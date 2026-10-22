import { describe, expect, it } from "vitest";
import { PlatformService } from "./platform.service.js";

const tenantA = "00000000-0000-4000-8000-000000000010";
const tenantB = "00000000-0000-4000-8000-000000000020";

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
      body: "Mensaje para {{empresa}}",
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
      { firstName: "Ana", lastName: "Paz", email: "ana@acme.com", organizationName: "Acme" },
      { firstName: "Otra", lastName: "Persona", email: "ANA@ACME.COM", organizationName: "Acme" },
    ]);
    service.importContacts(tenantB, [
      { firstName: "Ana", lastName: "Paz", email: "ana@acme.com", organizationName: "Acme" },
    ]);
    expect(result).toMatchObject({ imported: 1, duplicates: 1 });
    expect(service.listContacts(tenantA)).toHaveLength(1);
    expect(service.listContacts(tenantB)).toHaveLength(1);
  });
});
