import { z } from "zod";

const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

export const ContactImportRowSchema = z.object({
  firstName: z.string("El nombre es obligatorio").trim().min(1, "El nombre es obligatorio"),
  lastName: z.string().trim().default(""),
  email: z.string("El correo es obligatorio").trim().email("El correo no es válido").transform((value) => value.toLowerCase()),
  title: optionalText,
  phone: optionalText,
  organizationName: z.string("La empresa es obligatoria").trim().min(1, "La empresa es obligatoria"),
  organizationDomain: z.string().trim().toLowerCase().optional(),
});
export type ContactImportRow = z.infer<typeof ContactImportRowSchema>;

export const contactImportFields = [
  { header: "nombre", key: "firstName", required: true, label: "Nombre" },
  { header: "apellido", key: "lastName", required: false, label: "Apellido" },
  { header: "correo", key: "email", required: true, label: "Correo" },
  { header: "telefono", key: "phone", required: false, label: "Teléfono" },
  { header: "cargo", key: "title", required: false, label: "Cargo" },
  { header: "empresa", key: "organizationName", required: true, label: "Empresa" },
  { header: "dominio", key: "organizationDomain", required: false, label: "Dominio" },
] as const;
export type ContactFieldKey = (typeof contactImportFields)[number]["key"];

export interface ContactColumnMapping {
  firstName: number | null;
  lastName: number | null;
  email: number | null;
  phone: number | null;
  title: number | null;
  organizationName: number | null;
  organizationDomain: number | null;
}

const columnAliases: Record<ContactFieldKey, string[]> = {
  firstName: ["nombre", "nombres", "name", "first name", "firstname", "contacto", "nombre completo", "full name"],
  lastName: ["apellido", "apellidos", "last name", "lastname", "surname"],
  email: ["correo", "correo electronico", "email", "e mail", "mail"],
  phone: ["telefono", "celular", "movil", "phone", "tel", "whatsapp", "numero de telefono", "mobile"],
  title: ["cargo", "puesto", "titulo", "title", "job title"],
  organizationName: ["empresa", "compania", "company", "organizacion", "razon social", "organization"],
  organizationDomain: ["dominio", "domain", "sitio web", "website"],
};

export const demoContacts: ContactImportRow[] = [
  {
    firstName: "Santiago",
    lastName: "Moreno",
    email: "santiago.moreno@jumpcube.io",
    title: "Contacto de prueba",
    organizationName: "Jumpcube",
    organizationDomain: "jumpcube.io",
  },
  {
    firstName: "Andrés",
    lastName: "Cabesilla",
    email: "andrescabesilla@gmail.com",
    title: "Contacto de prueba",
    organizationName: "Prueba Cauce",
  },
];

const freemailDomains = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "yahoo.es",
  "icloud.com",
  "live.com",
  "hotmail.es",
]);

export interface ContactCsvError {
  line: number;
  message: string;
}

export function contactImportTemplateCsv(): string {
  const header = contactImportFields.map((field) => field.header).join(",");
  const lines = demoContacts.map((contact) => contactImportFields.map((field) => {
    const value = contact[field.key] ?? "";
    return /[",\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
  }).join(","));
  return `\uFEFF${[header, ...lines].join("\n")}\n`;
}

export function inspectContactCsv(text: string): {
  headers: string[];
  preview: string[][];
  suggested: ContactColumnMapping;
  errors: ContactCsvError[];
} {
  const table = readContactTable(text);
  if (table.errors.length > 0) {
    return { headers: [], preview: [], suggested: emptyMapping(), errors: table.errors };
  }
  return {
    headers: table.headers,
    preview: table.rows.slice(0, 3),
    suggested: suggestColumns(table.headers),
    errors: [],
  };
}

export function parseContactCsv(text: string): { rows: ContactImportRow[]; errors: ContactCsvError[] } {
  const table = readContactTable(text);
  if (table.errors.length > 0) return { rows: [], errors: table.errors };
  const headers = table.headers.map((header) => header.trim().toLowerCase());
  const missing = contactImportFields.filter((field) => field.required && !headers.includes(field.header));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Faltan columnas: ${missing.map((field) => field.header).join(", ")}` }],
    };
  }
  const mapping = emptyMapping();
  contactImportFields.forEach((field) => {
    const position = headers.indexOf(field.header);
    mapping[field.key] = position >= 0 ? position : null;
  });
  return rowsFromMapping(table, mapping, false);
}

export function parseMappedContactCsv(
  text: string,
  mapping: ContactColumnMapping,
): { rows: ContactImportRow[]; errors: ContactCsvError[] } {
  const table = readContactTable(text);
  if (table.errors.length > 0) return { rows: [], errors: table.errors };
  const missing = contactImportFields.filter((field) => field.required && mapping[field.key] === null);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Seleccione la columna de ${missing.map((field) => field.label.toLowerCase()).join(", ")}` }],
    };
  }
  const chosen = contactImportFields.flatMap((field) => {
    const index = mapping[field.key];
    return index === null ? [] : [index];
  });
  const duplicate = chosen.find((index, position) => chosen.indexOf(index) !== position);
  if (duplicate !== undefined) {
    return {
      rows: [],
      errors: [{ line: 1, message: `La columna "${table.headers[duplicate] ?? duplicate}" está asignada a más de un dato` }],
    };
  }
  return rowsFromMapping(table, mapping, mapping.lastName === null);
}

function rowsFromMapping(
  table: ContactTable,
  mapping: ContactColumnMapping,
  splitFullName: boolean,
): { rows: ContactImportRow[]; errors: ContactCsvError[] } {
  const rows: ContactImportRow[] = [];
  const errors: ContactCsvError[] = [];
  table.rows.forEach((cells, index) => {
    const record: Record<string, string> = {};
    contactImportFields.forEach((field) => {
      const position = mapping[field.key];
      if (position === null) return;
      const value = (cells[position] ?? "").trim();
      if (value) record[field.key] = value;
    });
    if (splitFullName && record.firstName) {
      const parts = record.firstName.split(/\s+/).filter(Boolean);
      record.firstName = parts[0] ?? "";
      if (parts.length > 1) record.lastName = parts.slice(1).join(" ");
    }
    const parsed = ContactImportRowSchema.safeParse(record);
    if (!parsed.success) {
      errors.push({ line: index + 2, message: parsed.error.issues[0]?.message ?? "Fila inválida" });
      return;
    }
    rows.push(withCompanyDomain(parsed.data));
  });
  return { rows, errors };
}

function withCompanyDomain(row: ContactImportRow): ContactImportRow {
  const fromEmail = row.email.split("@")[1]?.toLowerCase();
  const candidate = (row.organizationDomain || fromEmail || "").toLowerCase();
  const base: ContactImportRow = {
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    organizationName: row.organizationName,
  };
  if (row.title) base.title = row.title;
  if (row.phone) base.phone = row.phone;
  if (!candidate.includes(".") || freemailDomains.has(candidate)) return base;
  return { ...base, organizationDomain: candidate };
}

interface ContactTable {
  headers: string[];
  rows: string[][];
  errors: ContactCsvError[];
}

function readContactTable(text: string): ContactTable {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!source) return { headers: [], rows: [], errors: [{ line: 1, message: "El archivo está vacío" }] };
  const lines = source.split("\n").filter((line) => line.trim().length > 0);
  const first = lines[0] ?? "";
  const delimiter = first.includes(";") && !first.includes(",") ? ";" : ",";
  const headers = splitCsvLine(first, delimiter).map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    return { headers: [], rows: [], errors: [{ line: 1, message: "El archivo no tiene títulos de columna" }] };
  }
  return {
    headers,
    rows: lines.slice(1).map((line) => splitCsvLine(line, delimiter)),
    errors: [],
  };
}

function emptyMapping(): ContactColumnMapping {
  return {
    firstName: null,
    lastName: null,
    email: null,
    phone: null,
    title: null,
    organizationName: null,
    organizationDomain: null,
  };
}

function suggestColumns(headers: string[]): ContactColumnMapping {
  const mapping = emptyMapping();
  const used = new Set<number>();
  const order: ContactFieldKey[] = [
    "email",
    "phone",
    "organizationName",
    "organizationDomain",
    "lastName",
    "title",
    "firstName",
  ];
  order.forEach((key) => {
    const index = headers.findIndex((header, position) => !used.has(position) && matchesAlias(header, columnAliases[key]));
    if (index < 0) return;
    used.add(index);
    mapping[key] = index;
  });
  return mapping;
}

function matchesAlias(header: string, aliases: string[]): boolean {
  const normalized = header.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return aliases.some((alias) => {
    if (normalized === alias) return true;
    const aliasWords = alias.split(" ");
    if (aliasWords.length > 1) return normalized.includes(alias);
    return normalized.split(" ").includes(alias);
  });
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += character ?? "";
  }
  cells.push(current);
  return cells;
}
