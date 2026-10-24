"use client";

import { useMemo, useRef, useState } from "react";
import type { AssistantTurn, ProspectCriteria } from "@comercial/contracts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const tenantId = "00000000-0000-4000-8000-000000000010";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ProspectWorkspace() {
  const [draft, setDraft] = useState("");
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [criteria, setCriteria] = useState<ProspectCriteria | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [approval, setApproval] = useState<"idle" | "saving" | "approved">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const estimate = useMemo(() => criteria?.contactLimit ?? 0, [criteria]);

  async function submitConversation() {
    const text = draft.trim();
    if (!text || sending.current) return;
    sending.current = true;
    const next = [...conversation, { role: "user" as const, content: text }];
    setConversation(next);
    setDraft("");
    setCriteria(null);
    setRequestId(null);
    setApproval("idle");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/v1/assistant/conversation`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": tenantId,
          "x-role": "admin",
        },
        body: JSON.stringify({ messages: next }),
        signal: AbortSignal.timeout(45_000),
      });
      const body = await response.json().catch(() => ({})) as Partial<AssistantTurn> & {
        message?: string;
        issues?: Array<{ message: string }>;
      };
      if (!response.ok || !body.reply) {
        throw new Error(body.message ?? body.issues?.[0]?.message ?? "No se pudo consultar el asistente");
      }
      setConversation([...next, { role: "assistant", content: body.reply }]);
      setCriteria(body.ready && body.criteria ? body.criteria : null);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function approve() {
    if (!criteria || approval !== "idle") return;
    setApproval("saving");
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
      const approvalResponse = await fetch(`${apiUrl}/v1/prospects/${request.id}/approve`, {
        method: "POST",
        headers: { "x-tenant-id": tenantId, "x-role": "admin" },
      });
      if (!approvalResponse.ok) throw new Error("No se pudo aprobar la solicitud");
      setRequestId(request.id);
      setApproval("approved");
    } catch (caught) {
      setApproval("idle");
      setError(readableError(caught));
    }
  }

  return (
    <div className="workspace">
      <section className="panel">
        <header className="panel-head">
          <h2>Definamos su próximo mercado</h2>
          <small>Asistente</small>
        </header>
        <div className="chat" aria-live="polite">
          <div className="bubble system">
            Cuénteme a qué empresas y cargos quiere llegar. Le preguntaré lo que falte
            y no buscaremos contactos hasta que apruebe la audiencia.
          </div>
          {conversation.map((entry, index) => (
            <div className={`bubble ${entry.role === "user" ? "user" : "system"}`} key={`${entry.role}-${index}`}>
              {entry.content}
            </div>
          ))}
          {busy && <div className="bubble system">Estoy ordenando la audiencia…</div>}
          {approval === "approved" && (
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
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitConversation();
              }
            }}
          />
          <button className="primary" onClick={() => void submitConversation()} disabled={!draft.trim() || busy}>
            {busy ? "Consultando…" : "Enviar"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
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
            {criteria.includedCompanies.length > 0 && (
              <CriteriaRow label="Ejemplos" values={criteria.includedCompanies} />
            )}
            <div className="approval">
              <strong>Aprobación requerida</strong>
              Tope de {estimate} contactos. Estimación máxima: {estimate} créditos
              de enriquecimiento. Aprobar no busca contactos todavía.
              <button
                className="primary"
                disabled={approval !== "idle"}
                onClick={() => void approve()}
              >
                {approval === "saving" ? "Guardando…" : approval === "approved" ? "Aprobada" : "Aprobar y continuar"}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function readableError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : "Error inesperado";
  if (message === "Failed to fetch" || message.includes("NetworkError")) {
    return "No se alcanzó la API. Verifique que esté encendida.";
  }
  if (caught instanceof DOMException && (caught.name === "TimeoutError" || caught.name === "AbortError")) {
    return "La consulta tardó demasiado. Vuelva a enviar el mensaje.";
  }
  return message;
}

function CriteriaRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="criteria-row">
      <label>{label}</label>
      <div className="tags">
        {values.map((value) => <span className="tag" key={value}>{value}</span>)}
      </div>
    </div>
  );
}
