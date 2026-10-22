"use client";

import { useMemo, useState } from "react";
import type { ProspectCriteria } from "@comercial/contracts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const tenantId = "00000000-0000-4000-8000-000000000010";

function inferCriteria(text: string): ProspectCriteria {
  const lower = text.toLowerCase();
  return {
    countries: [lower.includes("méxico") ? "México" : "Colombia"],
    employeeRanges: ["51-200", "201-500"],
    jobTitles: lower.includes("operaciones")
      ? ["Gerente de operaciones", "Director de operaciones"]
      : ["Gerente general", "Director comercial"],
    seniorities: ["manager", "director"],
    industries: lower.includes("retail") ? ["Retail"] : ["Servicios B2B"],
    keywords: [],
    includedCompanies: [
      ...(lower.includes("avianca") ? ["Avianca"] : []),
      ...(lower.includes("homecenter") ? ["Homecenter"] : []),
    ],
    excludedCompanies: [],
    contactLimit: 80,
  };
}

export function ProspectWorkspace() {
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<ProspectCriteria | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "approved">("idle");
  const [error, setError] = useState("");
  const estimate = useMemo(() => criteria?.contactLimit ?? 0, [criteria]);

  function submitConversation() {
    if (!message.trim()) return;
    setConversation((current) => [...current, message.trim()]);
    setCriteria(inferCriteria(message));
    setMessage("");
    setError("");
  }

  async function approve() {
    if (!criteria) return;
    setStatus("saving");
    setError("");
    try {
      const create = await fetch(`${apiUrl}/v1/prospects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
          "x-role": "admin",
        },
        body: JSON.stringify(criteria),
      });
      if (!create.ok) throw new Error("No se pudo guardar la solicitud");
      const request = await create.json() as { id: string };
      const approval = await fetch(`${apiUrl}/v1/prospects/${request.id}/approve`, {
        method: "POST",
        headers: { "x-tenant-id": tenantId, "x-role": "admin" },
      });
      if (!approval.ok) throw new Error("No se pudo aprobar la solicitud");
      setRequestId(request.id);
      setStatus("approved");
    } catch (caught) {
      setStatus("idle");
      setError(caught instanceof Error ? caught.message : "Error inesperado");
    }
  }

  return (
    <div className="workspace">
      <section className="panel">
        <header className="panel-head">
          <h2>Definamos su próximo mercado</h2>
          <small>Conversación guiada</small>
        </header>
        <div className="chat" aria-live="polite">
          <div className="bubble system">
            Cuénteme a qué empresas y cargos quiere llegar. Puede mencionar ejemplos,
            sectores, país y tamaño de compañía.
          </div>
          {conversation.map((text, index) => (
            <div className="bubble user" key={`${text}-${index}`}>{text}</div>
          ))}
          {criteria && (
            <div className="bubble system">
              Preparé una propuesta de audiencia. Revísela a la derecha: no
              consumiremos créditos hasta que la apruebe.
            </div>
          )}
          {status === "approved" && (
            <div className="bubble system">
              Solicitud aprobada. Referencia: {requestId?.slice(0, 8)}. El trabajo
              queda listo para la cola de prospección.
            </div>
          )}
        </div>
        <div className="composer">
          <textarea
            aria-label="Describa su público objetivo"
            placeholder="Ej. Gerentes de operaciones de empresas de retail en Colombia…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitConversation();
              }
            }}
          />
          <button className="primary" onClick={submitConversation} disabled={!message.trim()}>
            Analizar
          </button>
        </div>
        {error && <div className="error">{error}. Verifique que la API esté encendida.</div>}
      </section>

      <aside className="panel">
        <header className="panel-head">
          <h2>Criterios</h2>
          <small>Vista previa</small>
        </header>
        {!criteria ? (
          <div className="criteria-empty">
            <div>
              <div className="ring">◎</div>
              <strong>Aún no hay criterios</strong>
              <p>La audiencia aparecerá aquí para su revisión antes de gastar créditos.</p>
            </div>
          </div>
        ) : (
          <div className="criteria">
            <CriteriaRow label="País" values={criteria.countries} />
            <CriteriaRow label="Sectores" values={criteria.industries} />
            <CriteriaRow label="Cargos" values={criteria.jobTitles} />
            <CriteriaRow label="Tamaño" values={criteria.employeeRanges} />
            <div className="approval">
              <strong>Aprobación requerida</strong>
              Tope de {estimate} contactos. Estimación máxima: {estimate} créditos
              de enriquecimiento.
              <button
                className="primary"
                disabled={status !== "idle"}
                onClick={() => void approve()}
              >
                {status === "saving" ? "Guardando…" : status === "approved" ? "Aprobada" : "Aprobar y continuar"}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function CriteriaRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="criteria-row">
      <label>{label}</label>
      <div className="tags">
        {values.map((value) => <span className="tag" key={value}>{value}</span>)}
      </div>
    </div>
  );
}
