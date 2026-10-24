import type { MailboxConnector } from "@comercial/domain";
import { canSend, renderTemplate } from "@comercial/domain";
import type { TemplateDraft } from "@comercial/contracts";

export interface DueSend {
  id: string;
  tenantId: string;
  idempotencyKey: string;
  recipient: string;
  campaignActive: boolean;
  testApproved: boolean;
  timeZone: string;
  workdayStartHour?: number;
  workdayEndHour?: number;
  allowedWeekdays?: number[];
  sentToday: number;
  dailyLimit: number;
  suppressed: boolean;
  replied: boolean;
  controlGroup: boolean;
  alreadySent: boolean;
  template: TemplateDraft;
  variables: Record<"nombre" | "empresa" | "cargo" | "remitente", string>;
  inReplyTo?: string;
  references?: string[];
  unsubscribeUrl: string;
}

export interface SendRepository {
  claimDue(limit: number, leaseUntil: Date): Promise<DueSend[]>;
  markSent(id: string, result: { providerId: string; internetMessageId?: string }): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export async function runSendCycle(input: {
  repository: SendRepository;
  connectorFor: (send: DueSend) => Promise<MailboxConnector>;
  now: Date;
  batchSize: number;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  const sends = await input.repository.claimDue(
    input.batchSize,
    new Date(input.now.getTime() + 5 * 60_000),
  );
  const result = { sent: 0, skipped: 0, failed: 0 };
  for (const send of sends) {
    const eligibility = canSend({
      campaignActive: send.campaignActive,
      testApproved: send.testApproved,
      now: input.now,
      timeZone: send.timeZone,
      workdayStartHour: send.workdayStartHour ?? 8,
      workdayEndHour: send.workdayEndHour ?? 18,
      ...(send.allowedWeekdays ? { allowedWeekdays: send.allowedWeekdays } : {}),
      sentToday: send.sentToday,
      dailyLimit: send.dailyLimit,
      suppressed: send.suppressed,
      replied: send.replied,
      controlGroup: send.controlGroup,
      alreadySent: send.alreadySent,
    });
    if (!eligibility.allowed) {
      await input.repository.markSkipped(send.id, eligibility.reason ?? "no_elegible");
      result.skipped += 1;
      continue;
    }
    try {
      const rendered = renderTemplate(send.template, send.variables);
      const connector = await input.connectorFor(send);
      const sent = await connector.send({
        to: send.recipient,
        subject: rendered.subject,
        html: `${rendered.body}<p><a href="${send.unsubscribeUrl}">No deseo recibir más mensajes</a></p>`,
        ...(send.inReplyTo ? { inReplyTo: send.inReplyTo } : {}),
        ...(send.references ? { references: send.references } : {}),
        headers: {
          "List-Unsubscribe": `<${send.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }, send.idempotencyKey);
      await input.repository.markSent(send.id, {
        providerId: sent.providerId,
        ...(sent.internetMessageId ? { internetMessageId: sent.internetMessageId } : {}),
      });
      result.sent += 1;
    } catch (error) {
      await input.repository.markFailed(
        send.id,
        error instanceof Error ? error.message : "error_desconocido",
      );
      result.failed += 1;
    }
  }
  return result;
}
