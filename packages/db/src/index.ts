import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

export function createDatabase(databaseUrl: string): {
  db: Database;
  close: () => Promise<void>;
} {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

export async function withTenant<T>(
  db: Database,
  tenantId: string,
  operation: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error("tenantId inválido");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return operation(tx);
  });
}
