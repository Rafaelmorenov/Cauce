import { randomUUID } from "node:crypto";
import { HttpException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ContactImportRowSchema,
  ConversationRequestSchema,
  DealSchema,
  ProspectCriteriaSchema,
  TemplateDraftSchema,
  TemplateProposalRequestSchema,
  parseAssistantTurn,
  type AssistantTurn,
  type CampaignStatus,
  type ConversationMessage,
  type ProspectCriteria,
  type ProspectRequestStatus,
  type TemplateDraft,
} from "@comercial/contracts";
import { ProviderError, trialRecipient, type TrialMailbox } from "./integrations.js";

export interface AudienceAssistant {
  interpret(messages: ConversationMessage[]): Promise<unknown>;
}

export interface TemplateAssistant {
  proposeTemplate(input: {
    channel: "correo" | "linkedin" | "whatsapp";
    tone: "directo" | "consultivo" | "formal" | "cercano";
    brief: string;
    audience?: string | undefined;
  }): Promise<unknown>;
}
import {
  assignControlGroup,
  attributeDeal,
  calculateRoi,
  canSend,
  classifyInboxMessage,
  estimateApolloCredits,
  renderTemplate,
} from "@comercial/domain";

interface ProspectRecord {
  id: string;
  tenantId: string;
  criteria: ProspectCriteria;
  status: ProspectRequestStatus;
  estimatedCredits: number;
  approvedAt?: string;
}

interface TemplateRecord extends TemplateDraft {
  id: string;
  tenantId: string;
  version: number;
  status: "borrador" | "aprobada";
}

interface CampaignRecord {
  id: string;
  tenantId: string;
  name: string;
  status: CampaignStatus;
  dailyLimit: number;
  controlPercentage: number;
  sendDays: number[];
  sendStartHour: number;
  sendEndHour: number;
  templateId?: string;
  testApprovedAt?: string;
  lastReason?: string;
}

interface EnrollmentRecord {
  id: string;
  contactId: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  status: "en_cola" | "enviado" | "en_control" | "fallido";
  subject?: string;
  sentAt?: string;
}

interface TestSendRecord {
  sent: true;
  tenantId: string;
  templateId: string;
  contactId: string;
  recipient: string;
  subject: string;
  sentAt: string;
  providerId: string;
  alreadySent: boolean;
}

interface ContactRecord {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  phone?: string;
  organizationName: string;
  organizationDomain?: string;
}

@Injectable()
export class PlatformService {
  private readonly assistantTurns = new Map<string, number>();
  private readonly prospects = new Map<string, ProspectRecord>();
  private readonly templates = new Map<string, TemplateRecord>();
  private readonly campaigns = new Map<string, CampaignRecord>();
  private readonly enrollments = new Map<string, EnrollmentRecord[]>();
  private readonly contacts = new Map<string, ContactRecord[]>();
  private readonly testSends = new Map<string, TestSendRecord[]>();
  private readonly testSendInFlight = new Set<string>();

  dashboard(tenantId?: string) {
    const contactCount = tenantId ? (this.contacts.get(tenantId)?.length ?? 0) : 0;
    return {
      metrics: {
        contacts: contactCount,
        responses: 0,
        meetings: 0,
        sales: 0,
        attributedRevenue: 0,
        roi: null,
      },
      notices: [
        "Conecta Google Workspace o Microsoft 365 para habilitar campañas.",
        "Los créditos de Apollo nunca se consumen sin aprobación.",
      ],
    };
  }

  importContacts(tenantId: string, input: unknown) {
    if (!Array.isArray(input)) {
      throw new HttpException("La base debe ser una lista de contactos.", 400);
    }
    const errors: Array<{ line: number; message: string }> = [];
    const rows = input.flatMap((row, index) => {
      const parsed = ContactImportRowSchema.safeParse(row);
      if (!parsed.success) {
        errors.push({ line: index + 1, message: parsed.error.issues[0]?.message ?? "Fila inválida" });
        return [];
      }
      return [parsed.data];
    });
    const current = this.contacts.get(tenantId) ?? [];
    const byEmail = new Map(current.flatMap((contact) => (
      contact.email ? [[contact.email.toLowerCase(), contact] as const] : []
    )));
    let imported = 0;
    let duplicates = 0;
    rows.forEach((row) => {
      const existing = byEmail.get(row.email);
      if (existing) {
        existing.firstName = row.firstName;
        existing.lastName = row.lastName;
        if (row.title) existing.title = row.title;
        if (row.phone) existing.phone = row.phone;
        existing.organizationName = row.organizationName;
        if (row.organizationDomain) existing.organizationDomain = row.organizationDomain;
        else delete existing.organizationDomain;
        duplicates += 1;
        return;
      }
      const record: ContactRecord = {
        id: randomUUID(),
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        ...(row.title ? { title: row.title } : {}),
        ...(row.phone ? { phone: row.phone } : {}),
        organizationName: row.organizationName,
        ...(row.organizationDomain ? { organizationDomain: row.organizationDomain } : {}),
      };
      current.push(record);
      byEmail.set(row.email, record);
      imported += 1;
    });
    this.contacts.set(tenantId, current);
    return {
      received: input.length,
      imported,
      duplicates,
      rejected: errors.length,
      errors,
      total: current.length,
    };
  }

  listContacts(tenantId: string) {
    return this.contacts.get(tenantId) ?? [];
  }

  async interpretAudience(
    tenantId: string,
    input: unknown,
    assistant: AudienceAssistant | null,
  ): Promise<AssistantTurn> {
    const request = ConversationRequestSchema.parse(input);
    const raw = await this.withAssistant(tenantId, assistant, () => assistant!.interpret(request.messages));
    try {
      return parseAssistantTurn(raw);
    } catch {
      throw new HttpException(
        "El asistente no devolvió una audiencia válida. Intente reformular el pedido.",
        502,
      );
    }
  }

  async proposeTemplate(
    tenantId: string,
    input: unknown,
    assistant: TemplateAssistant | null,
  ): Promise<{ draft: TemplateDraft; note: string }> {
    const request = TemplateProposalRequestSchema.parse(input);
    const raw = await this.withAssistant(tenantId, assistant, () => assistant!.proposeTemplate(request));
    const model = raw as { name?: unknown; subject?: unknown; body?: unknown; note?: unknown };
    let draft: TemplateDraft;
    try {
      draft = TemplateDraftSchema.parse({
        name: model.name,
        channel: request.channel,
        tone: request.tone,
        subject: request.channel === "correo" ? model.subject ?? "" : "",
        body: model.body,
      });
    } catch {
      throw new HttpException(
        "La plantilla propuesta no cumple el tono del canal. Intente reformular el pedido.",
        502,
      );
    }
    const note = typeof model.note === "string" ? model.note.trim().slice(0, 500) : "";
    if (!note) {
      throw new HttpException("La plantilla propuesta no explicó el tono elegido.", 502);
    }
    return { draft, note };
  }

  private async withAssistant<T>(
    tenantId: string,
    assistant: object | null,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!assistant) {
      throw new HttpException(
        "Falta GEMINI_API_KEY en el servidor. Agrégala en .env y reinicia la API.",
        503,
      );
    }
    const capValue = Number(process.env.ASSISTANT_TURN_CAP ?? 40);
    const cap = Number.isInteger(capValue) && capValue > 0 ? capValue : 40;
    const used = this.assistantTurns.get(tenantId) ?? 0;
    if (used >= cap) {
      throw new HttpException("Esta empresa alcanzó el tope de consultas del asistente.", 429);
    }
    try {
      const result = await run();
      this.assistantTurns.set(tenantId, used + 1);
      return result;
    } catch (error) {
      if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) {
        throw new HttpException("Gemini rechazó la clave configurada.", 502);
      }
      if (error instanceof ProviderError && (error.status === 429 || error.status === 503)) {
        throw new HttpException("Gemini está saturado. Espere un momento y vuelva a enviar.", 503);
      }
      if (error instanceof ProviderError && error.status === 404) {
        throw new HttpException("El modelo de Gemini configurado ya no está disponible.", 502);
      }
      if (error instanceof ProviderError && error.status === 504) {
        throw new HttpException("Gemini tardó demasiado. Vuelva a enviar el mensaje.", 504);
      }
      if (error instanceof ProviderError) {
        throw new HttpException("El asistente no está disponible en este momento.", 502);
      }
      throw error;
    }
  }

  createProspect(tenantId: string, input: unknown): ProspectRecord {
    const criteria = ProspectCriteriaSchema.parse(input);
    const record: ProspectRecord = {
      id: randomUUID(),
      tenantId,
      criteria,
      status: "en_revision",
      estimatedCredits: estimateApolloCredits(criteria),
    };
    this.prospects.set(record.id, record);
    return record;
  }

  approveProspect(tenantId: string, id: string): ProspectRecord {
    const record = this.requireTenantRecord(this.prospects, tenantId, id);
    record.status = "aprobada";
    record.approvedAt = new Date().toISOString();
    return record;
  }

  listProspects(tenantId: string) {
    return [...this.prospects.values()].filter((item) => item.tenantId === tenantId);
  }

  createTemplate(tenantId: string, input: unknown): TemplateRecord {
    const value = TemplateDraftSchema.parse(input);
    const record: TemplateRecord = {
      id: randomUUID(),
      tenantId,
      ...value,
      version: 1,
      status: "borrador",
    };
    this.templates.set(record.id, record);
    return record;
  }

  previewTemplate(tenantId: string, id: string, variables: Record<string, string>) {
    const template = this.requireTenantRecord(this.templates, tenantId, id);
    return renderTemplate(template, {
      nombre: variables.nombre ?? "",
      empresa: variables.empresa ?? "",
      cargo: variables.cargo ?? "",
      remitente: variables.remitente ?? "",
    });
  }

  approveTemplate(tenantId: string, id: string) {
    const template = this.requireTenantRecord(this.templates, tenantId, id);
    if (template.channel !== "correo") {
      throw new HttpException("Solo el correo se puede aprobar para el envío de prueba.", 409);
    }
    template.status = "aprobada";
    return template;
  }

  listTemplates(tenantId: string) {
    return [...this.templates.values()].filter((item) => item.tenantId === tenantId);
  }

  testSendStatus(tenantId: string) {
    return { sends: this.testSends.get(tenantId) ?? [] };
  }

  rememberFoundTest(tenantId: string, found: { sentAt: string }, subject: string) {
    const current = this.testSends.get(tenantId) ?? [];
    const existing = current.find((item) => item.subject === subject);
    if (existing) return existing;
    const record: TestSendRecord = {
      sent: true,
      tenantId,
      templateId: "",
      contactId: "",
      recipient: trialRecipient,
      subject,
      sentAt: found.sentAt,
      providerId: "enviado-antes",
      alreadySent: true,
    };
    this.testSends.set(tenantId, [...current, record]);
    return record;
  }

  async sendTestEmail(tenantId: string, input: unknown, mailbox: TrialMailbox) {
    const sentForTenant = this.testSends.get(tenantId) ?? [];
    if (this.testSendInFlight.has(tenantId)) {
      throw new HttpException("El correo de prueba ya se está enviando.", 409);
    }
    const body = input as { templateId?: unknown; contactId?: unknown };
    if (typeof body.templateId !== "string" || typeof body.contactId !== "string") {
      throw new HttpException("Falta la plantilla o el contacto.", 400);
    }
    const template = this.requireTenantRecord(this.templates, tenantId, body.templateId);
    if (template.channel !== "correo" || template.status !== "aprobada") {
      throw new HttpException("Apruebe primero la plantilla de correo.", 409);
    }
    const contact = (this.contacts.get(tenantId) ?? []).find((item) => item.id === body.contactId);
    if (!contact?.email) throw new NotFoundException("El contacto no está en la base.");
    if (contact.email.toLowerCase() !== trialRecipient) {
      throw new HttpException("Esta prueba solo se envía a santiago.moreno@jumpcube.io.", 409);
    }
    const already = sentForTenant.find((item) => item.templateId === template.id);
    if (already) return already;
    let rendered: { subject: string; body: string };
    try {
      rendered = renderTemplate(template, {
        nombre: contact.firstName,
        empresa: contact.organizationName,
        cargo: contact.title ?? "Contacto",
        remitente: "Santiago Moreno",
      });
    } catch (error) {
      throw new HttpException(error instanceof Error ? error.message : "La plantilla no se pudo completar.", 400);
    }
    this.testSendInFlight.add(tenantId);
    try {
      const previous = await mailbox.findSentTest(rendered.subject);
      if (previous) {
        const record: TestSendRecord = {
          sent: true,
          tenantId,
          templateId: template.id,
          contactId: contact.id,
          recipient: contact.email,
          subject: rendered.subject,
          sentAt: previous.sentAt,
          providerId: "enviado-antes",
          alreadySent: true,
        };
        this.testSends.set(tenantId, [...sentForTenant, record]);
        return record;
      }
      const sent = await mailbox.send({
        to: contact.email,
        subject: rendered.subject,
        html: messageHtml(rendered.body),
        templateId: template.id,
      });
      const record: TestSendRecord = {
        sent: true,
        tenantId,
        templateId: template.id,
        contactId: contact.id,
        recipient: contact.email,
        subject: rendered.subject,
        sentAt: new Date().toISOString(),
        providerId: sent.providerId,
        alreadySent: false,
      };
      this.testSends.set(tenantId, [...(this.testSends.get(tenantId) ?? []), record]);
      return record;
    } finally {
      this.testSendInFlight.delete(tenantId);
    }
  }

  createCampaign(tenantId: string, input: {
    name?: string;
    dailyLimit?: number;
    controlPercentage?: number;
    sendDays?: number[];
    sendStartHour?: number;
    sendEndHour?: number;
  }) {
    const dailyLimit = Math.min(150, Math.max(1, Number(input.dailyLimit ?? 40)));
    const controlPercentage = Math.min(50, Math.max(0, Number(input.controlPercentage ?? 10)));
    const sendDays = normalizeSendDays(input.sendDays);
    const sendStartHour = normalizeHour(input.sendStartHour, 8, 0, 23);
    const sendEndHour = normalizeHour(input.sendEndHour, 18, 1, 24);
    if (sendEndHour <= sendStartHour) throw new Error("La hora de cierre tiene que ser posterior a la de inicio");
    const record: CampaignRecord = {
      id: randomUUID(),
      tenantId,
      name: String(input.name ?? "").trim(),
      status: "prueba_pendiente",
      dailyLimit,
      controlPercentage,
      sendDays,
      sendStartHour,
      sendEndHour,
    };
    if (!record.name) throw new Error("La campaña requiere nombre");
    this.campaigns.set(record.id, record);
    return record;
  }

  approveCampaignTest(tenantId: string, id: string) {
    const campaign = this.requireTenantRecord(this.campaigns, tenantId, id);
    campaign.status = "aprobada";
    campaign.testApprovedAt = new Date().toISOString();
    return campaign;
  }

  activateCampaign(tenantId: string, id: string, templateId?: string) {
    const campaign = this.requireTenantRecord(this.campaigns, tenantId, id);
    const tested = (this.testSends.get(tenantId) ?? []).length > 0 || Boolean(campaign.testApprovedAt);
    if (!tested) throw new Error("Debe aprobar el correo de prueba");
    if (!templateId) throw new HttpException("La campaña necesita una plantilla de correo aprobada.", 409);
    const template = this.requireTenantRecord(this.templates, tenantId, templateId);
    if (template.channel !== "correo" || template.status !== "aprobada") {
      throw new HttpException("La campaña necesita una plantilla de correo aprobada.", 409);
    }
    campaign.templateId = template.id;
    campaign.status = "activa";
    for (const other of this.campaigns.values()) {
      if (other.tenantId === tenantId && other.id !== campaign.id && other.status === "activa") other.status = "pausada";
    }
    if (!campaign.testApprovedAt) campaign.testApprovedAt = new Date().toISOString();
    this.enrollNewContacts(campaign);
    return this.campaignView(campaign);
  }

  previewCampaignSends(tenantId: string, now: Date) {
    return this.reviewCampaignSends(tenantId, now, null);
  }

  async runCampaignSends(tenantId: string, mailbox: TrialMailbox, now: Date) {
    return this.reviewCampaignSends(tenantId, now, mailbox);
  }

  pauseCampaign(tenantId: string, id: string) {
    const campaign = this.requireTenantRecord(this.campaigns, tenantId, id);
    campaign.status = "pausada";
    return campaign;
  }

  listCampaigns(tenantId: string) {
    return [...this.campaigns.values()]
      .filter((item) => item.tenantId === tenantId)
      .map((campaign) => this.campaignView(campaign));
  }

  classifyMessage(input: unknown) {
    const value = input as {
      from?: string;
      subject?: string;
      text?: string;
      headers?: Record<string, string>;
    };
    return classifyInboxMessage({
      from: value.from ?? "",
      subject: value.subject ?? "",
      text: value.text ?? "",
      headers: value.headers ?? {},
    });
  }

  attribute(input: unknown) {
    const value = input as Record<string, unknown>;
    const deal = DealSchema.parse(value.deal);
    const type = attributeDeal({
      deal,
      firstContactAt: new Date(String(value.firstContactAt)),
      attributionWindowDays: Number(value.attributionWindowDays ?? 90),
      inControlGroup: Boolean(value.inControlGroup),
    });
    return { type };
  }

  roi(input: { attributedRevenue?: number; marginRate?: number; periodCost?: number }) {
    return {
      roi: calculateRoi({
        attributedRevenue: Number(input.attributedRevenue ?? 0),
        ...(input.marginRate === undefined ? {} : { marginRate: Number(input.marginRate) }),
        periodCost: Number(input.periodCost ?? 0),
      }),
    };
  }

  controlAssignment(input: { campaignSeed: string; contactId: string; percentage?: number }) {
    return {
      inControlGroup: assignControlGroup(
        input.campaignSeed,
        input.contactId,
        input.percentage ?? 10,
      ),
    };
  }

  private enrollNewContacts(campaign: CampaignRecord) {
    const current = this.enrollments.get(campaign.id) ?? [];
    const known = new Set(current.map((item) => item.contactId));
    const added = (this.contacts.get(campaign.tenantId) ?? []).flatMap((contact) => {
      if (!contact.email || known.has(contact.id)) return [];
      const inControl = assignControlGroup(campaign.id, contact.id, campaign.controlPercentage);
      const enrollment: EnrollmentRecord = {
        id: randomUUID(),
        contactId: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        organizationName: contact.organizationName,
        status: inControl ? "en_control" : "en_cola",
      };
      return [enrollment];
    });
    if (added.length > 0) this.enrollments.set(campaign.id, [...current, ...added]);
  }

  private campaignView(campaign: CampaignRecord) {
    return { ...campaign, enrollments: this.enrollments.get(campaign.id) ?? [] };
  }

  private async reviewCampaignSends(tenantId: string, now: Date, mailbox: TrialMailbox | null) {
    let sent = 0;
    let waiting = 0;
    let failed = 0;
    let reason: string | null = null;
    for (const campaign of this.campaigns.values()) {
      if (campaign.tenantId !== tenantId || campaign.status !== "activa" || !campaign.templateId) continue;
      this.enrollNewContacts(campaign);
      const template = this.templates.get(campaign.templateId);
      if (!template) continue;
      const enrollments = this.enrollments.get(campaign.id) ?? [];
      const today = bogotaDay(now);
      let used = enrollments.filter((item) => item.sentAt && bogotaDay(new Date(item.sentAt)) === today).length;
      for (const enrollment of enrollments) {
        if (enrollment.status !== "en_cola") continue;
        const decision = canSend({
          campaignActive: true,
          testApproved: true,
          now,
          timeZone: "America/Bogota",
          workdayStartHour: campaign.sendStartHour,
          workdayEndHour: campaign.sendEndHour,
          allowedWeekdays: campaign.sendDays,
          sentToday: used,
          dailyLimit: campaign.dailyLimit,
          suppressed: false,
          replied: false,
          controlGroup: false,
          alreadySent: false,
        });
        if (!decision.allowed) {
          waiting += 1;
          reason = decision.reason ?? reason;
          continue;
        }
        if (!mailbox) {
          used += 1;
          sent += 1;
          continue;
        }
        const contact = (this.contacts.get(tenantId) ?? []).find((item) => item.id === enrollment.contactId);
        try {
          const rendered = renderTemplate(template, {
            nombre: enrollment.firstName,
            empresa: enrollment.organizationName,
            cargo: contact?.title ?? "Contacto",
            remitente: "Santiago Moreno",
          });
          await mailbox.send({
            to: enrollment.email,
            subject: rendered.subject,
            html: messageHtml(rendered.body),
            templateId: template.id,
          });
          enrollment.status = "enviado";
          enrollment.sentAt = now.toISOString();
          enrollment.subject = rendered.subject;
          used += 1;
          sent += 1;
        } catch {
          enrollment.status = "fallido";
          failed += 1;
        }
      }
      if (reason) campaign.lastReason = reason;
    }
    return { sent, waiting, failed, reason };
  }

  private requireTenantRecord<T extends { tenantId: string }>(
    map: Map<string, T>,
    tenantId: string,
    id: string,
  ): T {
    const record = map.get(id);
    if (!record || record.tenantId !== tenantId) throw new NotFoundException();
    return record;
  }
}

function messageHtml(body: string): string {
  const escape = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return body.split(/\n{2,}/).map((paragraph) => `<p>${escape(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
}

function normalizeSendDays(value: number[] | undefined): number[] {
  const fallback = [1, 2, 3, 4, 5];
  if (!Array.isArray(value) || value.length === 0) return fallback;
  const days = [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  if (days.length === 0) throw new Error("Elija al menos un día de envío");
  return days.sort((left, right) => left - right);
}

function normalizeHour(value: number | undefined, fallback: number, min: number, max: number): number {
  const hour = Number(value ?? fallback);
  if (!Number.isInteger(hour) || hour < min || hour > max) throw new Error("Elija una hora de envío válida");
  return hour;
}

function bogotaDay(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
