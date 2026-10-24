import { describe, expect, it } from "vitest";
import { ProviderError, trialRecipient, type TrialMailbox } from "./integrations.js";
import { PlatformService } from "./platform.service.js";
import { trialEmail } from "./trial-email.js";

const tenantA = "00000000-0000-4000-8000-000000000010";
const tenantB = "00000000-0000-4000-8000-000000000020";

const readyCriteria = {
  countries: ["Colombia"],
  employeeRanges: ["51-200"],
  jobTitles: ["Gerente de operaciones"],
  seniorities: ["manager"],
  industries: ["Retail"],
  contactLimit: 40,
};

describe("PlatformService", () => {
  it("exige aprobación explícita antes de ejecutar prospección", () => {
    const service = new PlatformService();
    const record = service.createProspect(tenantA, {
      countries: ["Colombia"],
      employeeRanges: ["51,200"],
      jobTitles: ["Gerente de operaciones"],
      seniorities: ["manager"],
      industries: ["retail"],
      contactLimit: 80,
    });
    expect(record.status).toBe("en_revision");
    expect(record.approvedAt).toBeUndefined();

    const approved = service.approveProspect(tenantA, record.id);
    expect(approved.status).toBe("aprobada");
  });

  it("impide que otro tenant acceda al recurso", () => {
    const service = new PlatformService();
    const template = service.createTemplate(tenantA, {
      name: "Inicial",
      subject: "Hola {{nombre}}",
      body: "Mensaje para {{nombre}} de {{empresa}}",
    });
    expect(() => service.approveTemplate(tenantB, template.id)).toThrow();
  });

  it("no activa una campaña sin aprobar el correo de prueba", () => {
    const service = new PlatformService();
    const campaign = service.createCampaign(tenantA, { name: "Retail" });
    expect(() => service.activateCampaign(tenantA, campaign.id)).toThrow(
      "aprobar el correo de prueba",
    );
  });

  it("deduplica una carga propia sin mezclar tenants", () => {
    const service = new PlatformService();
    const result = service.importContacts(tenantA, [
      { firstName: "Ana", lastName: "Paz", email: "ana@acme.com", title: "Gerente", organizationName: "Acme" },
      { firstName: "Otra", lastName: "Persona", email: "ANA@ACME.COM", title: "Gerente", organizationName: "Acme", phone: "3000000001" },
      { firstName: "Sin", lastName: "Correo", organizationName: "Acme" },
    ]);
    service.importContacts(tenantB, [
      { firstName: "Ana", lastName: "Paz", email: "ana@acme.com", title: "Gerente", organizationName: "Acme" },
    ]);
    expect(result).toMatchObject({ imported: 1, duplicates: 1, rejected: 1 });
    expect(service.listContacts(tenantA)[0]?.firstName).toBe("Otra");
    expect(service.listContacts(tenantA)[0]?.phone).toBe("3000000001");
    expect(service.listContacts(tenantA)).toHaveLength(1);
    expect(service.listContacts(tenantB)).toHaveLength(1);
  });

  it("la conversación pregunta lo que falta y no crea una prospección", async () => {
    const service = new PlatformService();
    const turn = await service.interpretAudience(tenantA, {
      messages: [{ role: "user", content: "Gerentes de retail en Colombia" }],
    }, {
      interpret: async () => ({
        reply: "¿De qué tamaño son las empresas y cuántos contactos necesita?",
        ready: false,
        missing: ["tamano", "cantidad"],
        criteria: null,
      }),
    });
    expect(turn.ready).toBe(false);
    expect(turn.criteria).toBeNull();
    expect(service.listProspects(tenantA)).toHaveLength(0);
  });

  it("devuelve criterios listos sin aprobarlos ni buscar contactos", async () => {
    const service = new PlatformService();
    const turn = await service.interpretAudience(tenantA, {
      messages: [{ role: "user", content: "40 gerentes de operaciones de retail en Colombia, empresas de 51 a 200 personas" }],
    }, {
      interpret: async () => ({
        reply: "La audiencia está lista para revisión.",
        ready: true,
        missing: [],
        criteria: readyCriteria,
      }),
    });
    expect(turn.criteria?.contactLimit).toBe(40);
    expect(service.listProspects(tenantA)).toHaveLength(0);
  });

  it("rechaza una audiencia marcada como lista sin criterios", async () => {
    const service = new PlatformService();
    await expect(service.interpretAudience(tenantA, {
      messages: [{ role: "user", content: "Empresas de retail" }],
    }, {
      interpret: async () => ({ reply: "Lista", ready: true, missing: [], criteria: null }),
    })).rejects.toThrow("audiencia válida");
    expect(service.listProspects(tenantA)).toHaveLength(0);
  });

  it("avisa cuando Gemini está saturado", async () => {
    const service = new PlatformService();
    await expect(service.interpretAudience(tenantA, {
      messages: [{ role: "user", content: "Hola" }],
    }, {
      interpret: async () => {
        throw new ProviderError("gemini", 503, "unavailable", null);
      },
    })).rejects.toThrow("saturado");
  });

  it("propone una plantilla sin guardarla ni aprobarla", async () => {
    const service = new PlatformService();
    const proposal = await service.proposeTemplate(tenantA, {
      channel: "correo",
      tone: "consultivo",
      brief: "Primer contacto con gerentes de construcción",
    }, {
      proposeTemplate: async () => ({
        name: "Construcción",
        subject: "Una idea para {{empresa}}",
        body: "Hola {{nombre}}, vi el trabajo de {{empresa}}. ¿Le sirve una conversación de 15 minutos?\n\nSi no desea recibir más correos, responda baja.",
        note: "Tono consultivo, un solo pedido y variables del correo.",
      }),
    });
    expect(proposal.draft.channel).toBe("correo");
    expect(service.listTemplates(tenantA)).toHaveLength(0);
  });

  it("no aprueba una plantilla de WhatsApp para el envío de prueba", () => {
    const service = new PlatformService();
    const template = service.createTemplate(tenantA, {
      name: "WhatsApp",
      channel: "whatsapp",
      tone: "cercano",
      subject: "",
      body: "Hola {{nombre}}, ¿tiene 10 minutos esta semana?",
    });
    expect(() => service.approveTemplate(tenantA, template.id)).toThrow("correo");
  });

  it("envía un solo correo de prueba al destinatario acordado", async () => {
    const service = new PlatformService();
    const words = trialEmail.body.replace(/\{\{[^}]+\}\}/g, "empresa").split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(80);
    expect(words.length).toBeLessThanOrEqual(140);
    service.importContacts(tenantA, [
      { firstName: "Santiago", lastName: "Moreno", email: trialRecipient, title: "Contacto de prueba", organizationName: "Jumpcube", organizationDomain: "jumpcube.io" },
      { firstName: "Andrés", lastName: "Cabesilla", email: "andrescabesilla@gmail.com", title: "Contacto de prueba", organizationName: "Prueba Cauce" },
    ]);
    const template = service.createTemplate(tenantA, trialEmail);
    const santiago = service.listContacts(tenantA).find((contact) => contact.email === trialRecipient);
    const andres = service.listContacts(tenantA).find((contact) => contact.email === "andrescabesilla@gmail.com");
    const mailbox = fakeMailbox();
    await expect(service.sendTestEmail(tenantA, { templateId: template.id, contactId: santiago?.id }, mailbox)).rejects.toThrow("Apruebe");
    service.approveTemplate(tenantA, template.id);
    await expect(service.sendTestEmail(tenantA, { templateId: template.id, contactId: andres?.id }, mailbox)).rejects.toThrow("santiago.moreno@jumpcube.io");
    const sent = await service.sendTestEmail(tenantA, { templateId: template.id, contactId: santiago?.id }, mailbox);
    const repeated = await service.sendTestEmail(tenantA, { templateId: template.id, contactId: santiago?.id }, mailbox);
    const another = service.createTemplate(tenantA, {
      ...trialEmail,
      name: "Otra prueba",
      subject: "Otra pregunta para {{empresa}}",
    });
    service.approveTemplate(tenantA, another.id);
    await service.sendTestEmail(tenantA, { templateId: another.id, contactId: santiago?.id }, mailbox);
    expect(sent).toMatchObject({ sent: true, recipient: trialRecipient, subject: "El primer contacto comercial en Jumpcube", alreadySent: false });
    expect(repeated.providerId).toBe("uno");
    expect(mailbox.sends).toBe(2);
  });

  it("encola la base y espera al horario laboral para enviar un correo por contacto", async () => {
    const service = new PlatformService();
    service.importContacts(tenantA, [
      { firstName: "Santiago", lastName: "Moreno", email: trialRecipient, title: "Contacto de prueba", organizationName: "Jumpcube", organizationDomain: "jumpcube.io" },
      { firstName: "Andrés", lastName: "Cabesilla", email: "andrescabesilla@gmail.com", title: "Contacto de prueba", organizationName: "Prueba Cauce" },
    ]);
    const template = service.createTemplate(tenantA, trialEmail);
    service.approveTemplate(tenantA, template.id);
    const santiago = service.listContacts(tenantA).find((contact) => contact.email === trialRecipient);
    const mailbox = fakeMailbox();
    await service.sendTestEmail(tenantA, { templateId: template.id, contactId: santiago?.id }, mailbox);
    const campaign = service.createCampaign(tenantA, { name: "Base de prueba", dailyLimit: 1, controlPercentage: 0 });
    const active = service.activateCampaign(tenantA, campaign.id, template.id);
    expect(active.enrollments).toHaveLength(2);
    const saturday = new Date("2026-10-24T13:30:00.000Z");
    const weekend = await service.runCampaignSends(tenantA, mailbox, saturday);
    expect(weekend).toMatchObject({ sent: 0, waiting: 2, reason: "fin_de_semana" });
    const monday = new Date("2026-10-26T15:00:00.000Z");
    const firstDay = await service.runCampaignSends(tenantA, mailbox, monday);
    expect(firstDay).toMatchObject({ sent: 1, waiting: 1, reason: "tope_diario" });
    const tuesday = new Date("2026-10-27T15:00:00.000Z");
    const secondDay = await service.runCampaignSends(tenantA, mailbox, tuesday);
    expect(secondDay.sent).toBe(1);
    const repeated = await service.runCampaignSends(tenantA, mailbox, tuesday);
    expect(repeated.sent).toBe(0);
    expect(mailbox.sends).toBe(3);
  });

  it("respeta un sábado elegido y no envía el lunes si ese día quedó fuera", async () => {
    const service = new PlatformService();
    service.importContacts(tenantA, [
      { firstName: "Santiago", lastName: "Moreno", email: trialRecipient, title: "Contacto de prueba", organizationName: "Jumpcube", organizationDomain: "jumpcube.io" },
    ]);
    const template = service.createTemplate(tenantA, trialEmail);
    service.approveTemplate(tenantA, template.id);
    const santiago = service.listContacts(tenantA).find((contact) => contact.email === trialRecipient);
    const mailbox = fakeMailbox();
    await service.sendTestEmail(tenantA, { templateId: template.id, contactId: santiago?.id }, mailbox);
    const campaign = service.createCampaign(tenantA, {
      name: "Solo sábado",
      dailyLimit: 40,
      controlPercentage: 0,
      sendDays: [6],
      sendStartHour: 8,
      sendEndHour: 12,
    });
    service.activateCampaign(tenantA, campaign.id, template.id);
    const monday = await service.runCampaignSends(tenantA, mailbox, new Date("2026-10-26T15:00:00.000Z"));
    expect(monday).toMatchObject({ sent: 0, waiting: 1, reason: "dia_no_seleccionado" });
    const saturday = await service.runCampaignSends(tenantA, mailbox, new Date("2026-10-24T15:00:00.000Z"));
    expect(saturday.sent).toBe(1);
  });

  it("explica que falta la clave del asistente", async () => {
    const service = new PlatformService();
    await expect(service.interpretAudience(tenantA, {
      messages: [{ role: "user", content: "Quiero prospectar en Colombia" }],
    }, null)).rejects.toThrow("GEMINI_API_KEY");
    expect(service.listProspects(tenantA)).toHaveLength(0);
  });
});

function fakeMailbox(): TrialMailbox & { sends: number } {
  const mailbox = {
    sends: 0,
    async findSentTest() {
      return null;
    },
    async send() {
      mailbox.sends += 1;
      return { providerId: "uno" };
    },
  };
  return mailbox;
}
