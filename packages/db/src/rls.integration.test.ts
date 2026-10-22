import postgres from "postgres";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("aislamiento RLS en PostgreSQL real", () => {
  it("no cruza datos al reutilizar la conexión", async () => {
    const sql = postgres(url!, { max: 1, prepare: false });
    const table = `rls_test_${Date.now()}`;
    const tenantA = "00000000-0000-4000-8000-000000000010";
    const tenantB = "00000000-0000-4000-8000-000000000020";
    try {
      await sql.unsafe(`CREATE TABLE ${table} (tenant_id uuid NOT NULL, value text NOT NULL)`);
      await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await sql.unsafe(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await sql.unsafe(
        `CREATE POLICY tenant_policy ON ${table}
         USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
         WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)`,
      );
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantA}, true)`;
        await tx.unsafe(`INSERT INTO ${table} VALUES ('${tenantA}', 'A')`);
      });
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantB}, true)`;
        await tx.unsafe(`INSERT INTO ${table} VALUES ('${tenantB}', 'B')`);
      });
      const rowsA = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantA}, true)`;
        return tx.unsafe<Array<{ value: string }>>(`SELECT value FROM ${table}`);
      });
      const rowsB = await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantB}, true)`;
        return tx.unsafe<Array<{ value: string }>>(`SELECT value FROM ${table}`);
      });
      expect(rowsA.map((row) => row.value)).toEqual(["A"]);
      expect(rowsB.map((row) => row.value)).toEqual(["B"]);
    } finally {
      await sql.unsafe(`DROP TABLE IF EXISTS ${table}`);
      await sql.end();
    }
  });
});
