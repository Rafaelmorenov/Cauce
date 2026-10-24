"use client";

import { useEffect, useMemo, useState } from "react";
import type { TemplateChannel, TemplateDraft, TemplateTone } from "@comercial/contracts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const tenantId = "00000000-0000-4000-8000-000000000010";
const headers = {
  "content-type": "application/json",
  "x-tenant-id": tenantId,
  "x-role": "admin",
};

const tonesByChannel: Record<TemplateChannel, TemplateTone[]> = {
  correo: ["directo", "consultivo", "formal"],
  linkedin: ["cercano", "consultivo"],
  whatsapp: ["cercano", "directo"],
};

const channelLabel: Record<TemplateChannel, string> = {
  correo: "Correo",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

export function TemplateStudio() {
  const [channel, setChannel] = useState<TemplateChannel>("correo");
  const [tone, setTone] = useState<TemplateTone>("consultivo");
  const [brief, setBrief] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [status, setStatus] = useState<"borrador" | "aprobada" | "">("");
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sentTests, setSentTests] = useState<Array<{ templateId: string; recipient: string; subject: string }>>([]);
  const currentSent = sentTests.find((item) => item.templateId.length > 0 && item.templateId === templateId);
  useEffect(() => {
    void (async () => {
      try {
        const [templatesResponse, sentResponse] = await Promise.all([
          fetch(`${apiUrl}/v1/templates`, { headers, cache: "no-store" }),
          fetch(`${apiUrl}/v1/mailbox/test-send`, { headers, cache: "no-store" }),
        ]);
        if (templatesResponse.ok) {
          const templates = await templatesResponse.json() as Array<{
            id: string;
            name: string;
            channel: TemplateChannel;
            tone: TemplateTone;
            subject: string;
            body: string;
            status: string;
          }>;
          const latest = [...templates].reverse().find((item) => item.channel === "correo");
          if (latest) {
            setName(latest.name);
            setChannel(latest.channel);
            setTone(latest.tone);
            setSubject(latest.subject);
            setBody(latest.body);
            setTemplateId(latest.id);
            setStatus(latest.status === "aprobada" ? "aprobada" : "borrador");
          }
        }
        if (sentResponse.ok) {
          const payload = await sentResponse.json() as { sends?: Array<{ templateId: string; recipient: string; subject: string }> };
          setSentTests(payload.sends ?? []);
        }
      } catch {
        // The form remains usable when the initial read fails.
      }
    })();
  }, []);
  const tones = tonesByChannel[channel];
  const draft = useMemo<TemplateDraft>(() => ({
    name: name.trim(),
    channel,
    tone,
    subject: channel === "correo" ? subject.trim() : "",
    body: body.trim(),
  }), [body, channel, name, subject, tone]);

  function changeChannel(next: TemplateChannel) {
    setChannel(next);
    setTone(tonesByChannel[next][0] ?? "consultivo");
    setTemplateId(null);
    setStatus("");
    setPreview(null);
  }

  async function propose() {
    if (brief.trim().length < 8 || busy) return;
    setBusy("proposing");
    setError("");
    setPreview(null);
    try {
      const response = await fetch(`${apiUrl}/v1/assistant/template`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({ channel, tone, brief: brief.trim() }),
      });
      const payload = await readJson<{ draft?: TemplateDraft; note?: string; message?: string; issues?: Array<{ message: string }> }>(response);
      if (!response.ok || !payload.draft) {
        throw new Error(payload.message ?? payload.issues?.[0]?.message ?? "No se pudo proponer la plantilla");
      }
      setName(payload.draft.name);
      setSubject(payload.draft.subject);
      setBody(payload.draft.body);
      setNote(payload.note ?? "");
      setTemplateId(null);
      setStatus("");
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy("");
    }
  }

  async function save(): Promise<string> {
    const response = await fetch(`${apiUrl}/v1/templates`, {
      method: "POST",
      headers,
      body: JSON.stringify(draft),
    });
    const payload = await readJson<{ id?: string; message?: string; issues?: Array<{ message: string }> }>(response);
    if (!response.ok || !payload.id) {
      throw new Error(payload.message ?? payload.issues?.[0]?.message ?? "No se pudo guardar la plantilla");
    }
    setTemplateId(payload.id);
    setStatus("borrador");
    return payload.id;
  }

  async function saveDraft() {
    if (busy) return;
    setBusy("saving");
    setError("");
    try {
      await save();
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy("");
    }
  }

  async function showPreview() {
    if (busy) return;
    setBusy("preview");
    setError("");
    try {
      const id = templateId ?? await save();
      const response = await fetch(`${apiUrl}/v1/templates/${id}/preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          nombre: "Ana",
          empresa: "Homecenter",
          cargo: "Gerente de operaciones",
          remitente: "Santiago",
        }),
      });
      const payload = await readJson<{ subject?: string; body?: string; message?: string }>(response);
      if (!response.ok || !payload.body) throw new Error(payload.message ?? "No se pudo previsualizar");
      setPreview({ subject: payload.subject ?? "", body: payload.body });
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy("");
    }
  }

  async function sendTest() {
    if (busy || currentSent || channel !== "correo") return;
    setBusy("sending");
    setError("");
    try {
      const id = templateId ?? await save();
      const approved = await fetch(`${apiUrl}/v1/templates/${id}/approve`, { method: "POST", headers });
      if (!approved.ok) {
        const payload = await readJson<{ message?: string }>(approved);
        throw new Error(payload.message ?? "No se pudo aprobar la plantilla");
      }
      setStatus("aprobada");
      const contacts = await fetch(`${apiUrl}/v1/contacts`, { headers, cache: "no-store" });
      const list = await readJson<Array<{ id: string; email?: string }>>(contacts);
      const contact = Array.isArray(list)
        ? list.find((item) => item.email?.toLowerCase() === "santiago.moreno@jumpcube.io")
        : undefined;
      if (!contact) throw new Error("Santiago Moreno no está en la base.");
      const response = await fetch(`${apiUrl}/v1/mailbox/test-send`, {
        method: "POST",
        headers,
        body: JSON.stringify({ templateId: id, contactId: contact.id }),
      });
      const payload = await readJson<{ sent?: boolean; recipient?: string; subject?: string; templateId?: string; message?: string }>(response);
      if (!response.ok || !payload.sent) throw new Error(payload.message ?? "No se pudo enviar la prueba");
      setTemplateId(id);
      setSentTests((items) => [...items, {
        templateId: payload.templateId || id,
        recipient: payload.recipient ?? "santiago.moreno@jumpcube.io",
        subject: payload.subject ?? subject,
      }]);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy("");
    }
  }

  async function approve() {
    if (busy) return;
    setBusy("approving");
    setError("");
    try {
      const id = templateId ?? await save();
      const response = await fetch(`${apiUrl}/v1/templates/${id}/approve`, { method: "POST", headers });
      const payload = await readJson<{ status?: string; message?: string }>(response);
      if (!response.ok) throw new Error(payload.message ?? "No se pudo aprobar la plantilla");
      setStatus("aprobada");
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel template-studio">
      <header className="panel-head">
        <h2>Plantilla de prueba</h2>
        <small>{channel === "correo" ? "Lista para aprobar" : "Borrador, sin envío"}</small>
      </header>
      <div className="template-grid">
        <div className="template-form">
          <label>
            Canal
            <select value={channel} onChange={(event) => changeChannel(event.target.value as TemplateChannel)}>
              {(Object.keys(channelLabel) as TemplateChannel[]).map((item) => (
                <option value={item} key={item}>{channelLabel[item]}</option>
              ))}
            </select>
          </label>
          <label>
            Tono
            <select value={tone} onChange={(event) => { setTone(event.target.value as TemplateTone); setTemplateId(null); }}>
              {tones.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label className="wide">
            Pedido para el asistente
            <textarea
              aria-label="Pedido para construir la plantilla"
              value={brief}
              placeholder="Ej. Primer correo a gerentes de construcción, ofreciendo una reunión breve."
              onChange={(event) => setBrief(event.target.value)}
            />
          </label>
          <button className="primary" type="button" disabled={brief.trim().length < 8 || Boolean(busy)} onClick={() => void propose()}>
            {busy === "proposing" ? "Redactando…" : "Proponer con Gemini"}
          </button>
          {note && <p className="template-note">{note}</p>}
        </div>
        <div className="template-form">
          <label>
            Nombre
            <input aria-label="Nombre de la plantilla" value={name} onChange={(event) => { setName(event.target.value); setTemplateId(null); }} />
          </label>
          {channel === "correo" && (
            <label>
              Asunto
              <input aria-label="Asunto" value={subject} onChange={(event) => { setSubject(event.target.value); setTemplateId(null); }} />
            </label>
          )}
          <label className="wide">
            Mensaje
            <textarea
              aria-label="Cuerpo de la plantilla"
              className="template-body"
              value={body}
              placeholder="También puede pegar aquí su propia plantilla."
              onChange={(event) => { setBody(event.target.value); setTemplateId(null); }}
            />
          </label>
          <div className="template-actions">
            <button className="primary" type="button" disabled={!draft.name || !draft.body || Boolean(busy)} onClick={() => void saveDraft()}>
              {busy === "saving" ? "Guardando…" : "Guardar borrador"}
            </button>
            <button className="primary" type="button" disabled={!draft.body || Boolean(busy)} onClick={() => void showPreview()}>
              {busy === "preview" ? "Preparando…" : "Vista previa"}
            </button>
            <button className="primary" type="button" disabled={channel !== "correo" || !draft.body || Boolean(busy)} onClick={() => void approve()}>
              {status === "aprobada" ? "Aprobada" : busy === "approving" ? "Aprobando…" : "Aprobar para prueba"}
            </button>
            <button className="primary" type="button" disabled={channel !== "correo" || !draft.body || Boolean(currentSent) || Boolean(busy)} onClick={() => void sendTest()}>
              {currentSent ? "Prueba enviada" : busy === "sending" ? "Enviando…" : "Enviar prueba a Santiago Moreno"}
            </button>
          </div>
          {status && <p className="template-note">Estado: {status}. Aprobar no envía el correo.</p>}
          {currentSent ? (
            <p className="template-note">
              Esta plantilla ya se envió a {currentSent.recipient}. Asunto: {currentSent.subject}. No se vuelve a enviar.
            </p>
          ) : sentTests.length > 0 && (
            <p className="template-note">
              La prueba anterior ya salió. Esta plantilla se envía una vez a Santiago Moreno.
            </p>
          )}
          {preview && (
            <div className="template-preview">
              {preview.subject && <strong>{preview.subject}</strong>}
              <p>{preview.body}</p>
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </section>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({} as T)) as T;
}

function readableError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : "Error inesperado";
  if (message === "Failed to fetch" || message.includes("NetworkError")) {
    return "No se alcanzó la API. Verifique que esté encendida.";
  }
  if (caught instanceof DOMException && (caught.name === "TimeoutError" || caught.name === "AbortError")) {
    return "La consulta tardó demasiado. Vuelva a intentar.";
  }
  return message;
}
