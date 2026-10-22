import { describe, expect, it } from "vitest";
import { processIdempotently, type JobHandler, type JobIdempotencyStore } from "./job.js";

class Store implements JobIdempotencyStore {
  keys = new Set<string>();
  async has(tenantId: string, key: string) {
    return this.keys.has(`${tenantId}:${key}`);
  }
  async mark(tenantId: string, key: string) {
    this.keys.add(`${tenantId}:${key}`);
  }
}

describe("worker idempotente", () => {
  it("procesa una entrega duplicada una sola vez", async () => {
    const store = new Store();
    let calls = 0;
    const handler: JobHandler = { handle: async () => { calls += 1; } };
    const body = JSON.stringify({
      version: 1,
      type: "prospecting",
      idempotencyKey: "request-1234",
      tenantId: "00000000-0000-4000-8000-000000000010",
      payload: {},
    });
    expect(await processIdempotently(body, store, handler)).toBe("processed");
    expect(await processIdempotently(body, store, handler)).toBe("duplicate");
    expect(calls).toBe(1);
  });
});
