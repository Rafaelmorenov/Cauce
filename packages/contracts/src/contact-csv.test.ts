import { describe, expect, it } from "vitest";
import { contactImportTemplateCsv, inspectContactCsv, parseContactCsv, parseMappedContactCsv } from "./contact-csv.js";

describe("plantilla de contactos", () => {
  it("acepta la plantilla oficial y conserva los dos contactos de prueba", () => {
    const parsed = parseContactCsv(contactImportTemplateCsv());
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((row) => row.email)).toEqual([
      "santiago.moreno@jumpcube.io",
      "andrescabesilla@gmail.com",
    ]);
    expect(parsed.rows[0]).toMatchObject({ organizationDomain: "jumpcube.io", title: "Contacto de prueba" });
    expect(parsed.rows[1]?.organizationDomain).toBeUndefined();
  });

  it("toma el dominio del correo de empresa y deja fuera el correo personal", () => {
    const parsed = parseContactCsv([
      "nombre,apellido,correo,cargo,empresa,dominio",
      "Ana,Paz,ana@acme.com,Gerente,Acme,",
      "Luis,Rojas,luis@gmail.com,Gerente,Gmail,gmail.com",
    ].join("\n"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.organizationDomain).toBe("acme.com");
    expect(parsed.rows[1]?.organizationDomain).toBeUndefined();
  });

  it("acepta punto y coma y reporta la fila inválida sin descartar las válidas", () => {
    const parsed = parseContactCsv([
      "nombre;apellido;correo;cargo;empresa;dominio",
      "Ana;Paz;ana@acme.com;Gerente;Acme;acme.com",
      "Luis;Rojas;no-es-correo;Gerente;Acme;",
    ].join("\n"));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([{ line: 3, message: "El correo no es válido" }]);
  });

  it("explica en español cuando falta una columna obligatoria", () => {
    const parsed = parseContactCsv([
      "nombre,apellido,cargo,empresa",
      "Ana,Paz,Gerente,Acme",
    ].join("\n"));
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual([{ line: 1, message: "Faltan columnas: correo" }]);
  });

  it("sugiere las columnas y deja que la persona cambie la empresa", () => {
    const file = [
      "Company,Full Name,Email Address,Mobile",
      "Jumpcube,Santiago Moreno,santiago.moreno@jumpcube.io,3000000001",
      "Prueba Cauce,Andrés Cabesilla,andrescabesilla@gmail.com,3000000002",
    ].join("\n");
    const inspected = inspectContactCsv(file);
    expect(inspected.errors).toEqual([]);
    expect(inspected.headers).toEqual(["Company", "Full Name", "Email Address", "Mobile"]);
    expect(inspected.suggested).toMatchObject({
      organizationName: 0,
      firstName: 1,
      email: 2,
      phone: 3,
      lastName: null,
    });
    const mapped = parseMappedContactCsv(file, inspected.suggested);
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows[0]).toMatchObject({
      firstName: "Santiago",
      lastName: "Moreno",
      email: "santiago.moreno@jumpcube.io",
      organizationName: "Jumpcube",
      phone: "3000000001",
    });
    const changed = parseMappedContactCsv(file, { ...inspected.suggested, organizationName: 1, firstName: 0 });
    expect(changed.rows[0]?.organizationName).toBe("Santiago Moreno");
    expect(changed.rows[0]?.firstName).toBe("Jumpcube");
  });

  it("pide la columna que falta y rechaza una columna usada dos veces", () => {
    const file = "Dato,Otro\nAcme,ana@acme.com";
    const inspected = inspectContactCsv(file);
    expect(parseMappedContactCsv(file, inspected.suggested).errors[0]?.message).toContain("Seleccione la columna");
    expect(parseMappedContactCsv(file, {
      ...inspected.suggested,
      firstName: 0,
      email: 1,
      organizationName: 0,
    }).errors).toEqual([{ line: 1, message: "La columna \"Dato\" está asignada a más de un dato" }]);
  });
});
