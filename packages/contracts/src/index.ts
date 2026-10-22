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

export const ContactImportRowSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  title: z.string().trim().optional(),
  organizationName: z.string().trim().min(1),
  organizationDomain: z.string().trim().toLowerCase().optional(),
});
export type ContactImportRow = z.infer<typeof ContactImportRowSchema>;

export const TemplateVariableSchema = z.enum([
  "nombre",
  "empresa",
  "cargo",
  "remitente",
]);

export const TemplateDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(20_000),
});
export type TemplateDraft = z.infer<typeof TemplateDraftSchema>;

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
