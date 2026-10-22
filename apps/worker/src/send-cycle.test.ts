import { describe, expect, it, vi } from "vitest";
import type { MailboxConnector } from "@comercial/domain";
import { runSendCycle, type DueSend, type SendRepository } from "./send-cycle.js";

const baseSend: DueSend = {
  id: "send-1",
  tenantId: "00000000-0000-4000-8000-000000000010",
  idempotencyKey: "campaign:contact:step",
  recipient: "ana@example.com",
  campaignActive: true,
  testApproved: true,
  timeZone: "America/Bogota",
  sentToday: 0,
  dailyLimit: 40,
  suppressed: false,
  replied: false,
  controlGroup: false,
  alreadySent: false,
  template: { name: "Inicial", subject: "Hola {{nombre}}", body: "Para {{empresa}}" },
  variables: { nombre: "Ana", empresa: "Acme", cargo: "CEO", remitente: "Rafael" },
  unsubscribeUrl: "https://example.com/unsubscribe/token",
};

function repositoryFor(send: DueSend): SendRepository {
  return {
    claimDue: vi.fn().mockResolvedValue([send]),
    markSent: vi.fn(),
    markSkipped: vi.fn(),
    markFailed: vi.fn(),
  };
}

describe("ciclo de envío", () => {
  it("nunca llama al proveedor para un contacto que respondió", async () => {
    const repository = repositoryFor({ ...baseSend, replied: true });
    const connector = { send: vi.fn(), listChanges: vi.fn() } as unknown as MailboxConnector;
    const result = await runSendCycle({
      repository,
      connectorFor: async () => connector,
      now: new Date("2026-10-22T15:00:00Z"),
      batchSize: 5,
    });
    expect(connector.send).not.toHaveBeenCalled();
    expect(repository.markSkipped).toHaveBeenCalledWith("send-1", "contacto_respondio");
    expect(result.skipped).toBe(1);
  });

  it("incluye baja y marca el envío terminado", async () => {
    const repository = repositoryFor(baseSend);
    const send = vi.fn().mockResolvedValue({ providerId: "provider-1" });
    const connector = { send, listChanges: vi.fn() } as unknown as MailboxConnector;
    const result = await runSendCycle({
      repository,
      connectorFor: async () => connector,
      now: new Date("2026-10-22T15:00:00Z"),
      batchSize: 5,
    });
    expect(send.mock.calls[0]?.[0].html).toContain("No deseo recibir");
    expect(repository.markSent).toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });
});
