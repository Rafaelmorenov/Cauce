import type {
  CalendarMeeting,
  Deal,
  InboxEventType,
  MailMessage,
  ProspectCriteria,
  SentMessage,
  TemplateDraft,
} from "@comercial/contracts";

export interface MailboxConnector {
  send(message: MailMessage, idempotencyKey: string): Promise<SentMessage>;
  listChanges(cursor?: string): Promise<{
    messages: Array<{
      providerId: string;
      from: string;
      subject: string;
      text: string;
      headers: Record<string, string>;
      receivedAt: Date;
    }>;
    cursor: string;
  }>;
}

export interface CalendarConnector {
  listMeetings(since: Date, cursor?: string): Promise<{
    meetings: CalendarMeeting[];
    cursor?: string;
  }>;
}

export interface DataProvider {
  preview(criteria: ProspectCriteria): Promise<{
    estimatedPeople: number;
    estimatedOrganizations?: number;
    estimatedCredits: number;
  }>;
  searchPeople(criteria: ProspectCriteria, cursor?: string): Promise<{
    people: Array<{
      providerId: string;
      firstName: string;
      lastName: string;
      title: string;
      organizationName: string;
      organizationDomain?: string;
    }>;
    nextCursor?: string;
  }>;
  enrichPeople(
    people: Array<{
      providerId: string;
      firstName: string;
      lastName: string;
      organizationDomain?: string;
    }>,
  ): Promise<{
    people: Array<{ providerId: string; email?: string; emailStatus?: string }>;
    creditsUsed: number;
  }>;
}

export interface CrmConnector {
  listWonDeals(since: Date, cursor?: string): Promise<{
    deals: Deal[];
    cursor?: string;
  }>;
}

const VARIABLE_PATTERN = /\{\{\s*(nombre|empresa|cargo|remitente)\s*\}\}/g;

export function renderTemplate(
  template: TemplateDraft,
  variables: Record<"nombre" | "empresa" | "cargo" | "remitente", string>,
): { subject: string; body: string } {
  const replace = (_match: string, key: keyof typeof variables) => {
    const value = variables[key]?.trim();
    if (!value) throw new Error(`Falta la variable obligatoria: ${key}`);
    return value;
  };
  return {
    subject: template.subject.replace(VARIABLE_PATTERN, replace),
    body: template.body.replace(VARIABLE_PATTERN, replace),
  };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function deduplicateContacts<T extends { email?: string; firstName: string; lastName: string; organizationDomain?: string }>(
  contacts: T[],
): T[] {
  const seen = new Set<string>();
  return contacts.filter((contact) => {
    const key = contact.email
      ? `email:${normalizeEmail(contact.email)}`
      : `person:${contact.firstName.trim().toLowerCase()}|${contact.lastName.trim().toLowerCase()}|${contact.organizationDomain?.trim().toLowerCase() ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface SendEligibility {
  campaignActive: boolean;
  testApproved: boolean;
  now: Date;
  timeZone: string;
  workdayStartHour: number;
  workdayEndHour: number;
  allowedWeekdays?: number[];
  sentToday: number;
  dailyLimit: number;
  suppressed: boolean;
  replied: boolean;
  controlGroup: boolean;
  alreadySent: boolean;
}

export function canSend(input: SendEligibility): { allowed: boolean; reason?: string } {
  if (!input.campaignActive) return { allowed: false, reason: "campaña_inactiva" };
  if (!input.testApproved) return { allowed: false, reason: "prueba_no_aprobada" };
  if (input.suppressed) return { allowed: false, reason: "contacto_suprimido" };
  if (input.replied) return { allowed: false, reason: "contacto_respondio" };
  if (input.controlGroup) return { allowed: false, reason: "grupo_control" };
  if (input.alreadySent) return { allowed: false, reason: "toque_ya_enviado" };
  if (input.sentToday >= input.dailyLimit) return { allowed: false, reason: "tope_diario" };

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timeZone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(input.now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const weekdayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const allowed = input.allowedWeekdays ?? [1, 2, 3, 4, 5];
  if (!allowed.includes(weekdayIndex[weekday] ?? -1)) {
    if (weekday === "Sat" || weekday === "Sun") return { allowed: false, reason: "fin_de_semana" };
    return { allowed: false, reason: "dia_no_seleccionado" };
  }
  if (hour < input.workdayStartHour || hour >= input.workdayEndHour) {
    return { allowed: false, reason: "fuera_de_horario" };
  }
  return { allowed: true };
}

export function classifyInboxMessage(message: {
  from: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
}): { type: InboxEventType; confidence: number; source: "rule" | "ai_required" } {
  const from = message.from.toLowerCase();
  const subject = message.subject.toLowerCase();
  const text = message.text.toLowerCase();
  const autoSubmitted = Object.entries(message.headers).find(
    ([key]) => key.toLowerCase() === "auto-submitted",
  )?.[1]?.toLowerCase();

  if (
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    subject.includes("undeliverable") ||
    subject.includes("delivery status notification") ||
    subject.includes("no se pudo entregar")
  ) {
    return { type: "rebote", confidence: 0.99, source: "rule" };
  }
  if (
    (autoSubmitted && autoSubmitted !== "no") ||
    subject.includes("fuera de la oficina") ||
    subject.includes("out of office") ||
    subject.includes("respuesta automática")
  ) {
    return { type: "automatico", confidence: 0.98, source: "rule" };
  }
  if (
    text.includes("darme de baja") ||
    text.includes("no me contacte") ||
    text.includes("unsubscribe")
  ) {
    return { type: "baja", confidence: 0.97, source: "rule" };
  }
  return { type: "revision", confidence: 0, source: "ai_required" };
}

export function assignControlGroup(seed: string, contactId: string, percentage = 10): boolean {
  let hash = 2166136261;
  for (const char of `${seed}:${contactId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100 < percentage;
}

export function attributeDeal(input: {
  deal: Deal;
  firstContactAt: Date;
  attributionWindowDays: number;
  inControlGroup: boolean;
}): "originada" | "influenciada" | "no_atribuible" {
  if (input.inControlGroup) return "no_atribuible";
  const closesAt = input.deal.closedAt.getTime();
  const startsAt = input.firstContactAt.getTime();
  const max = startsAt + input.attributionWindowDays * 86_400_000;
  if (closesAt < startsAt || closesAt > max) return "no_atribuible";
  return input.deal.existedBeforeCampaign ? "influenciada" : "originada";
}

export function calculateRoi(input: {
  attributedRevenue: number;
  marginRate?: number;
  periodCost: number;
}): number | null {
  if (input.periodCost <= 0 || input.marginRate === undefined) return null;
  const margin = input.attributedRevenue * input.marginRate;
  return (margin - input.periodCost) / input.periodCost;
}

export function estimateApolloCredits(criteria: ProspectCriteria): number {
  return criteria.contactLimit;
}

export function matchMeetingToContact(
  attendeeEmails: string[],
  contacts: Array<{ id: string; email: string; organizationDomain?: string }>,
): { contactId: string; confidence: number; requiresReview: boolean } | null {
  const normalizedAttendees = attendeeEmails.map(normalizeEmail);
  const exact = contacts.find((contact) => normalizedAttendees.includes(normalizeEmail(contact.email)));
  if (exact) return { contactId: exact.id, confidence: 1, requiresReview: false };

  const domains = new Set(
    normalizedAttendees
      .map((email) => email.split("@")[1])
      .filter((value): value is string => Boolean(value)),
  );
  const candidates = contacts.filter(
    (contact) => contact.organizationDomain && domains.has(contact.organizationDomain.toLowerCase()),
  );
  if (candidates.length === 1) {
    return { contactId: candidates[0]!.id, confidence: 0.6, requiresReview: true };
  }
  return null;
}

export { channelToneSkill, tonesForChannel } from "./channel-tone.js";
