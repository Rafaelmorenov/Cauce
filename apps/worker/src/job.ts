import { z } from "zod";

export const JobEnvelopeSchema = z.object({
  version: z.literal(1),
  type: z.enum(["prospecting", "inbox", "crm", "import"]),
  idempotencyKey: z.string().min(8).max(200),
  tenantId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
});
export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;

export interface JobIdempotencyStore {
  has(tenantId: string, key: string): Promise<boolean>;
  mark(tenantId: string, key: string, type: string): Promise<void>;
}

export interface JobHandler {
  handle(job: JobEnvelope): Promise<void>;
}

export async function processIdempotently(
  body: string,
  store: JobIdempotencyStore,
  handler: JobHandler,
): Promise<"processed" | "duplicate"> {
  const job = JobEnvelopeSchema.parse(JSON.parse(body));
  if (await store.has(job.tenantId, job.idempotencyKey)) return "duplicate";
  await handler.handle(job);
  await store.mark(job.tenantId, job.idempotencyKey, job.type);
  return "processed";
}
