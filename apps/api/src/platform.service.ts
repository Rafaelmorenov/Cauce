import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  ContactImportRowSchema,
  DealSchema,
  ProspectCriteriaSchema,
  TemplateDraftSchema,
  type CampaignStatus,
  type ProspectCriteria,
  type ProspectRequestStatus,
  type TemplateDraft,
} from "@comercial/contracts";
import {
  assignControlGroup,
  attributeDeal,
  calculateRoi,
  classifyInboxMessage,
  estimateApolloCredits,
  renderTemplate,
  deduplicateContacts,
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
  testApprovedAt?: string;
}

interface ContactRecord {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  organizationName: string;
  organizationDomain?: string;
}

@Injectable()
export class PlatformService {
  private readonly prospects = new Map<string, ProspectRecord>();
  private readonly templates = new Map<string, TemplateRecord>();
  private readonly campaigns = new Map<string, CampaignRecord>();
  private readonly contacts = new Map<string, ContactRecord[]>();

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
    const rows = Array.isArray(input) ? input.map((row) => ContactImportRowSchema.parse(row)) : [];
    const current = this.contacts.get(tenantId) ?? [];
    const incoming: ContactRecord[] = rows.map((row) => ({
      id: randomUUID(),
      firstName: row.firstName,
      lastName: row.lastName,
      organizationName: row.organizationName,
      ...(row.email ? { email: row.email } : {}),
      ...(row.title ? { title: row.title } : {}),
      ...(row.organizationDomain ? { organizationDomain: row.organizationDomain } : {}),
    }));
    const merged = deduplicateContacts<ContactRecord>([...current, ...incoming]);
    this.contacts.set(tenantId, merged);
    return {
      received: rows.length,
      imported: merged.length - current.length,
      duplicates: rows.length - (merged.length - current.length),
      total: merged.length,
    };
  }

  listContacts(tenantId: string) {
    return this.contacts.get(tenantId) ?? [];
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
    template.status = "aprobada";
    return template;
  }

  listTemplates(tenantId: string) {
    return [...this.templates.values()].filter((item) => item.tenantId === tenantId);
  }

  createCampaign(tenantId: string, input: { name?: string; dailyLimit?: number; controlPercentage?: number }) {
    const dailyLimit = Math.min(150, Math.max(1, Number(input.dailyLimit ?? 40)));
    const controlPercentage = Math.min(50, Math.max(0, Number(input.controlPercentage ?? 10)));
    const record: CampaignRecord = {
      id: randomUUID(),
      tenantId,
      name: String(input.name ?? "").trim(),
      status: "prueba_pendiente",
      dailyLimit,
      controlPercentage,
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

  activateCampaign(tenantId: string, id: string) {
    const campaign = this.requireTenantRecord(this.campaigns, tenantId, id);
    if (!campaign.testApprovedAt) throw new Error("Debe aprobar el correo de prueba");
    campaign.status = "activa";
    return campaign;
  }

  pauseCampaign(tenantId: string, id: string) {
    const campaign = this.requireTenantRecord(this.campaigns, tenantId, id);
    campaign.status = "pausada";
    return campaign;
  }

  listCampaigns(tenantId: string) {
    return [...this.campaigns.values()].filter((item) => item.tenantId === tenantId);
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
