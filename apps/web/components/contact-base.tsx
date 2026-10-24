"use client";

import { useEffect, useState } from "react";
import {
  contactImportFields,
  contactImportTemplateCsv,
  inspectContactCsv,
  parseMappedContactCsv,
  type ContactColumnMapping,
  type ContactFieldKey,
} from "@comercial/contracts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const headers = {
  "content-type": "application/json",
  "x-tenant-id": "00000000-0000-4000-8000-000000000010",
  "x-role": "admin",
};

interface ListedContact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
  phone?: string;
  organizationName: string;
  organizationDomain?: string;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  rejected: number;
  total: number;
  errors?: Array<{ line: number; message: string }>;
  message?: string;
}

export function ContactBase() {
  const [contacts, setContacts] = useState<ListedContact[]>([]);
  const [summary, setSummary] = useState("");
  const [errors, setErrors] = useState<Array<{ line: number; message: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<{ name: string; text: string; headers: string[]; preview: string[][] } | null>(null);
  const [mapping, setMapping] = useState<ContactColumnMapping | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const response = await fetch(`${apiUrl}/v1/contacts`, { headers, cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo leer la base");
      setContacts(await response.json() as ListedContact[]);
      setLoadError("");
    } catch {
      setLoadError("No se pudo leer la base de contactos.");
    }
  }

  function downloadTemplate() {
    const file = new Blob([contactImportTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-contactos-cauce.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setSummary("");
    setErrors([]);
    setLoadError("");
    const text = await file.text();
    const inspected = inspectContactCsv(text);
    if (inspected.errors.length > 0) {
      setPending(null);
      setMapping(null);
      setErrors(inspected.errors);
      return;
    }
    setPending({ name: file.name, text, headers: inspected.headers, preview: inspected.preview });
    setMapping(inspected.suggested);
  }

  function chooseColumn(key: ContactFieldKey, value: string) {
    setMapping((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value === "" ? null : Number(value) };
      if (next[key] !== null) {
        contactImportFields.forEach((field) => {
          if (field.key !== key && next[field.key] === next[key]) next[field.key] = null;
        });
      }
      return next;
    });
  }

  async function confirmMapping() {
    if (!pending || !mapping || busy) return;
    setBusy(true);
    setSummary("");
    setErrors([]);
    setLoadError("");
    try {
      const parsed = parseMappedContactCsv(pending.text, mapping);
      if (parsed.rows.length === 0) {
        setErrors(parsed.errors.length > 0 ? parsed.errors : [{ line: 1, message: "El archivo no tiene contactos" }]);
        return;
      }
      const response = await fetch(`${apiUrl}/v1/contacts/import`, {
        method: "POST",
        headers,
        body: JSON.stringify(parsed.rows),
      });
      const payload = await response.json() as ImportResult;
      if (!response.ok) throw new Error(payload.message ?? "No se pudo cargar la base");
      setErrors([...parsed.errors, ...(payload.errors ?? [])]);
      setSummary(`${payload.imported} nuevos, ${payload.duplicates} actualizados, ${parsed.errors.length + (payload.rejected ?? 0)} con error. Total: ${payload.total}.`);
      setPending(null);
      setMapping(null);
      await load();
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "No se pudo cargar la base");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel contact-base">
      <header className="panel-head">
        <h2>Base de contactos</h2>
        <small>{contacts.length} en la base</small>
      </header>
      <div className="contact-body">
        <p className="template-note">
          Al cargar un archivo, elija qué columna corresponde a cada dato. El nombre, el correo y la empresa hacen falta para personalizar el mensaje. El teléfono queda guardado con el contacto. El dominio, si no viene en el archivo, se toma del correo de la empresa.
        </p>
        <ul className="contact-fields">
          {contactImportFields.map((field) => (
            <li key={field.header}>
              <strong>{field.label}</strong>
              <span>{field.required ? "obligatorio" : "opcional"}</span>
            </li>
          ))}
        </ul>
        <div className="template-actions">
          <button className="primary" type="button" onClick={downloadTemplate}>Descargar plantilla</button>
          <label className="file-button">
            {busy ? "Cargando…" : "Cargar archivo"}
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void upload(file);
              }}
            />
          </label>
        </div>
        {pending && mapping ? (
          <div className="column-map">
            <p className="template-note">Columnas de {pending.name}. Cambie la selección si la sugerencia no coincide.</p>
            <div className="template-form column-map-form">
              {contactImportFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <select
                    aria-label={`Columna de ${field.label}`}
                    value={mapping[field.key] ?? ""}
                    onChange={(event) => chooseColumn(field.key, event.target.value)}
                  >
                    <option value="">{field.required ? "Seleccione una columna" : "No usar"}</option>
                    {pending.headers.map((header, index) => (
                      <option value={index} key={`${header}-${index}`}>{header}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {pending.preview.length > 0 ? (
              <table className="contact-table">
                <thead>
                  <tr>{pending.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr>
                </thead>
                <tbody>
                  {pending.preview.map((row, index) => (
                    <tr key={index}>
                      {pending.headers.map((header, cell) => <td key={`${header}-${cell}`}>{(row[cell] ?? "").trim() || "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div className="template-actions">
              <button className="primary" type="button" disabled={busy} onClick={() => void confirmMapping()}>
                {busy ? "Cargando…" : "Usar estas columnas"}
              </button>
              <button className="file-button" type="button" disabled={busy} onClick={() => { setPending(null); setMapping(null); }}>Cancelar</button>
            </div>
          </div>
        ) : null}
        {summary ? <p className="template-note">{summary}</p> : null}
        {loadError ? <p className="error">{loadError}</p> : null}
        {errors.length > 0 ? (
          <ul className="contact-errors">
            {errors.map((error) => (
              <li key={`${error.line}-${error.message}`}>Fila {error.line}: {error.message}</li>
            ))}
          </ul>
        ) : null}
        <table className="contact-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th>Cargo</th>
              <th>Empresa</th>
              <th>Dominio</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr><td colSpan={6}>Todavía no hay contactos. Descargue la plantilla o cargue su archivo.</td></tr>
            ) : contacts.map((contact) => (
              <tr key={contact.id}>
                <td>{contact.firstName} {contact.lastName}</td>
                <td>{contact.email}</td>
                <td>{contact.phone ?? "—"}</td>
                <td>{contact.title}</td>
                <td>{contact.organizationName}</td>
                <td>{contact.organizationDomain ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
