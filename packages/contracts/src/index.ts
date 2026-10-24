import { z } from "zod";

export const TenantRoleSchema = z.enum([
  "admin",
  "operador_campanas",
  "aprobador",
  "lector",
  "vendedor",
]);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

export const ProspectCriteriaSchema = z.object({
  countries: z.array(z.string().trim().min(2)).min(1),
  employeeRanges: z.array(z.string().trim().min(1)).min(1),
  jobTitles: z.array(z.string().trim().min(2)).min(1),
  seniorities: z.array(z.string().trim().min(2)).default([]),
  industries: z.array(z.string().trim().min(2)).default([]),
  keywords: z.array(z.string().trim().min(2)).default([]),
  includedCompanies: z.array(z.string().trim().min(2)).default([]),
  excludedCompanies: z.array(z.string().trim().min(2)).default([]),
  contactLimit: z.number().int().min(1).max(5_000),
});
export type ProspectCriteria = z.infer<typeof ProspectCriteriaSchema>;

export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ConversationRequestSchema = z.object({
  messages: z.array(ConversationMessageSchema).min(1).max(24),
}).refine((value) => value.messages.at(-1)?.role === "user", {
  path: ["messages"],
  message: "El último mensaje debe ser del usuario",
});

export const MissingAudienceFieldSchema = z.enum([
  "pais",
  "tamano",
  "cargos",
  "sector",
  "cantidad",
]);

export const AssistantTurnSchema = z.object({
  reply: z.string().trim().min(1).max(2_000),
  ready: z.boolean(),
  missing: z.array(MissingAudienceFieldSchema).max(5).default([]),
  criteria: ProspectCriteriaSchema.nullable().default(null),
});
export type AssistantTurn = z.infer<typeof AssistantTurnSchema>;

export function parseAssistantTurn(input: unknown): AssistantTurn {
  const turn = AssistantTurnSchema.parse(input);
  if (turn.ready && !turn.criteria) {
    throw new Error("Los criterios son obligatorios cuando la audiencia está lista");
  }
  if (!turn.ready && turn.criteria) {
    throw new Error("No se proponen criterios hasta completar los datos");
  }
  if (turn.ready && turn.missing.length > 0) {
    throw new Error("Una audiencia lista no puede tener datos pendientes");
  }
  return turn;
}

export const ProspectRequestStatusSchema = z.enum([
  "borrador",
  "en_revision",
  "aprobada",
  "en_ejecucion",
  "lista",
  "fallida",
]);
export type ProspectRequestStatus = z.infer<typeof ProspectRequestStatusSchema>;

export const ContactStatusSchema = z.enum([
  "nuevo",
  "verificado",
  "excluido",
  "en_control",
  "contactado",
  "respondio",
  "reunion",
  "venta",
  "baja",
]);
export type ContactStatus = z.infer<typeof ContactStatusSchema>;

export {
  ContactImportRowSchema,
  contactImportFields,
  contactImportTemplateCsv,
  demoContacts,
  inspectContactCsv,
  parseContactCsv,
  parseMappedContactCsv,
  type ContactColumnMapping,
  type ContactCsvError,
  type ContactFieldKey,
  type ContactImportRow,
} from "./contact-csv.js";

export const TemplateVariableSchema = z.enum([
  "nombre",
  "empresa",
  "cargo",
  "remitente",
]);

export const TemplateChannelSchema = z.enum(["correo", "linkedin", "whatsapp"]);
export type TemplateChannel = z.infer<typeof TemplateChannelSchema>;

export const TemplateToneSchema = z.enum(["directo", "consultivo", "formal", "cercano"]);
export type TemplateTone = z.infer<typeof TemplateToneSchema>;

const tonesByChannel: Record<TemplateChannel, readonly TemplateTone[]> = {
  correo: ["directo", "consultivo", "formal"],
  linkedin: ["cercano", "consultivo"],
  whatsapp: ["cercano", "directo"],
};

export const TemplateDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  channel: TemplateChannelSchema.default("correo"),
  tone: TemplateToneSchema.default("consultivo"),
  subject: z.string().trim().max(180).default(""),
  body: z.string().trim().min(1).max(4_000),
}).refine((value) => tonesByChannel[value.channel].includes(value.tone), {
  path: ["tone"],
  message: "Ese tono no corresponde al canal",
}).refine((value) => value.channel !== "correo" || (value.subject.length > 0 && value.subject.length <= 90), {
  path: ["subject"],
  message: "El correo necesita un asunto de hasta 90 caracteres",
}).refine((value) => value.channel === "correo" || value.subject.length === 0, {
  path: ["subject"],
  message: "Ese canal no usa asunto",
}).refine((value) => value.channel !== "correo" || (value.body.includes("{{nombre}}") && value.body.includes("{{empresa}}")), {
  path: ["body"],
  message: "El correo debe incluir {{nombre}} y {{empresa}}",
}).refine((value) => value.channel === "correo" || value.body.length <= 500, {
  path: ["body"],
  message: "Ese canal admite hasta 500 caracteres",
});
export type TemplateDraft = z.infer<typeof TemplateDraftSchema>;

export const TemplateProposalRequestSchema = z.object({
  channel: TemplateChannelSchema,
  tone: TemplateToneSchema,
  brief: z.string().trim().min(8).max(2_000),
  audience: z.string().trim().max(1_000).optional(),
}).refine((value) => tonesByChannel[value.channel].includes(value.tone), {
  path: ["tone"],
  message: "Ese tono no corresponde al canal",
});
export type TemplateProposalRequest = z.infer<typeof TemplateProposalRequestSchema>;

export const CampaignStatusSchema = z.enum([
  "borrador",
  "prueba_pendiente",
  "aprobada",
  "activa",
  "pausada",
  "detenida",
  "completada",
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const InboxEventTypeSchema = z.enum([
  "respuesta",
  "rebote",
  "automatico",
  "baja",
  "queja",
  "revision",
]);
export type InboxEventType = z.infer<typeof InboxEventTypeSchema>;

export const DealSchema = z.object({
  organizationDomain: z.string().trim().toLowerCase().min(3),
  contactEmail: z.string().email().optional(),
  value: z.number().nonnegative().optional(),
  valueMin: z.number().nonnegative().optional(),
  valueMax: z.number().nonnegative().optional(),
  currency: z.string().length(3).default("COP"),
  closedAt: z.coerce.date(),
  existedBeforeCampaign: z.boolean().default(false),
});
export type Deal = z.infer<typeof DealSchema>;

export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
}

export interface SentMessage {
  providerId: string;
  internetMessageId?: string;
  threadId?: string;
}

export interface InboxMessage {
  providerId: string;
  from: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
  receivedAt: Date;
}

export interface CalendarMeeting {
  providerId: string;
  startsAt: Date;
  endsAt: Date;
  attendeeEmails: string[];
  status: "agendada" | "realizada" | "cancelada";
}

export interface PersonSearchResult {
  providerId: string;
  firstName: string;
  lastName: string;
  title: string;
  organizationName: string;
  organizationDomain?: string;
  email?: string;
  emailStatus?: string;
}
