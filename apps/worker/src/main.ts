import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { createDatabase, processedJobs, withTenant, type Database } from "@comercial/db";
import { and, eq } from "drizzle-orm";
import type { JobEnvelope, JobHandler, JobIdempotencyStore } from "./job.js";
import { processIdempotently } from "./job.js";

const queueUrl = process.env.WORKER_QUEUE_URL;
const region = process.env.AWS_REGION ?? "sa-east-1";

class MemoryIdempotencyStore implements JobIdempotencyStore {
  private readonly keys = new Set<string>();
  async has(tenantId: string, key: string) {
    return this.keys.has(`${tenantId}:${key}`);
  }
  async mark(tenantId: string, key: string) {
    this.keys.add(`${tenantId}:${key}`);
  }
}

class PostgresIdempotencyStore implements JobIdempotencyStore {
  constructor(private readonly db: Database) {}
  async has(tenantId: string, key: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ id: processedJobs.id })
        .from(processedJobs)
        .where(and(
          eq(processedJobs.tenantId, tenantId),
          eq(processedJobs.idempotencyKey, key),
        ))
        .limit(1);
      return rows.length > 0;
    });
  }
  async mark(tenantId: string, key: string, type: string) {
    await withTenant(this.db, tenantId, async (tx) => {
      await tx.insert(processedJobs).values({ tenantId, idempotencyKey: key, type }).onConflictDoNothing();
    });
  }
}

class RoutedJobHandler implements JobHandler {
  async handle(job: JobEnvelope) {
    // Each route is intentionally small. Provider-specific implementations are
    // injected here once credentials are connected; retries remain safe because
    // the envelope has a stable idempotency key.
    console.info(JSON.stringify({
      event: "job.processing",
      tenantId: job.tenantId,
      type: job.type,
      idempotencyKey: job.idempotencyKey,
    }));
  }
}

async function run() {
  if (!queueUrl) {
    console.info("WORKER_QUEUE_URL no configurada; worker en espera.");
    return;
  }
  const client = new SQSClient({ region });
  const database = process.env.DATABASE_URL ? createDatabase(process.env.DATABASE_URL) : undefined;
  if (!database && process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL es obligatoria en producción");
  }
  const store = database
    ? new PostgresIdempotencyStore(database.db)
    : new MemoryIdempotencyStore();
  const handler = new RoutedJobHandler();
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });

  while (!stopping) {
    const batch = await client.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
      VisibilityTimeout: 120,
    }));
    for (const message of batch.Messages ?? []) {
      if (!message.Body || !message.ReceiptHandle) continue;
      try {
        await processIdempotently(message.Body, store, handler);
        await client.send(new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));
      } catch (error) {
        console.error(JSON.stringify({
          event: "job.failed",
          messageId: message.MessageId,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  }
  await database?.close();
}

void run();
