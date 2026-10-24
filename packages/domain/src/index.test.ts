import { describe, expect, it } from "vitest";
import {
  assignControlGroup,
  attributeDeal,
  calculateRoi,
  canSend,
  classifyInboxMessage,
  deduplicateContacts,
  matchMeetingToContact,
  renderTemplate,
} from "./index.js";

describe("reglas del dominio", () => {
  it("no renderiza una plantilla con variables ausentes", () => {
    expect(() =>
      renderTemplate(
        { name: "Inicial", channel: "correo", tone: "consultivo", subject: "Hola {{nombre}}", body: "Para {{empresa}}" },
        { nombre: "Ana", empresa: "", cargo: "CEO", remitente: "Rafael" },
      ),
    ).toThrow("empresa");
  });

  it("elimina duplicados por correo normalizado", () => {
    const contacts = deduplicateContacts([
      { firstName: "Ana", lastName: "Paz", email: " ANA@ACME.COM " },
      { firstName: "Otra", lastName: "Persona", email: "ana@acme.com" },
    ]);
    expect(contacts).toHaveLength(1);
  });

  it("bloquea contacto suprimido antes de enviar", () => {
    const result = canSend({
      campaignActive: true,
      testApproved: true,
      now: new Date("2026-10-22T15:00:00Z"),
      timeZone: "America/Bogota",
      workdayStartHour: 8,
      workdayEndHour: 18,
      sentToday: 0,
      dailyLimit: 40,
      suppressed: true,
      replied: false,
      controlGroup: false,
      alreadySent: false,
    });
    expect(result).toEqual({ allowed: false, reason: "contacto_suprimido" });
  });

  it("envía el sábado solo cuando ese día está elegido", () => {
    const saturday = new Date("2026-10-24T15:00:00Z");
    const base = {
      campaignActive: true,
      testApproved: true,
      now: saturday,
      timeZone: "America/Bogota",
      workdayStartHour: 8,
      workdayEndHour: 18,
      sentToday: 0,
      dailyLimit: 40,
      suppressed: false,
      replied: false,
      controlGroup: false,
      alreadySent: false,
    };
    expect(canSend(base).reason).toBe("fin_de_semana");
    expect(canSend({ ...base, allowedWeekdays: [6] })).toEqual({ allowed: true });
    expect(canSend({ ...base, allowedWeekdays: [6], now: new Date("2026-10-26T15:00:00Z") }).reason).toBe("dia_no_seleccionado");
  });

  it("clasifica rebotes con reglas sin IA", () => {
    expect(
      classifyInboxMessage({
        from: "mailer-daemon@example.com",
        subject: "Delivery Status Notification",
        text: "",
        headers: {},
      }),
    ).toMatchObject({ type: "rebote", source: "rule" });
  });

  it("asigna el grupo de control de forma determinista", () => {
    expect(assignControlGroup("campaña-1", "contacto-1", 10)).toBe(
      assignControlGroup("campaña-1", "contacto-1", 10),
    );
  });

  it("no atribuye cierres del grupo de control", () => {
    const type = attributeDeal({
      deal: {
        organizationDomain: "acme.com",
        value: 10_000,
        currency: "COP",
        closedAt: new Date("2026-02-01"),
        existedBeforeCampaign: false,
      },
      firstContactAt: new Date("2026-01-01"),
      attributionWindowDays: 90,
      inControlGroup: true,
    });
    expect(type).toBe("no_atribuible");
  });

  it("calcula ROI sobre margen, no sobre ingresos", () => {
    expect(calculateRoi({ attributedRevenue: 10_000, marginRate: 0.3, periodCost: 1_000 })).toBe(2);
  });

  it("marca para revisión una reunión cruzada solo por dominio", () => {
    expect(matchMeetingToContact(
      ["compras@acme.com"],
      [{ id: "contact-1", email: "ana@otrocorreo.com", organizationDomain: "acme.com" }],
    )).toEqual({ contactId: "contact-1", confidence: 0.6, requiresReview: true });
  });
});
