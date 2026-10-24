"use client";

import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const headers = {
  "content-type": "application/json",
  "x-tenant-id": "00000000-0000-4000-8000-000000000010",
  "x-role": "admin",
};

interface TemplateOption {
  id: string;
  name: string;
  channel: string;
  status: string;
}

interface Enrollment {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationName: string;
  status: "en_cola" | "enviado" | "en_control" | "fallido";
  subject?: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  dailyLimit: number;
  sendDays?: number[];
  sendStartHour?: number;
  sendEndHour?: number;
  lastReason?: string;
  enrollments: Enrollment[];
}

const dayOptions = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const statusLabel: Record<Enrollment["status"], string> = {
  en_cola: "En cola",
  enviado: "Enviado",
  en_control: "Sin correo",
  fallido: "No se pudo enviar",
};

function formatSchedule(days: number[], start: number, end: number): string {
  const ordered = dayOptions.map((day) => day.value).filter((day) => days.includes(day));
  const names = ordered.length === 7
    ? "todos los días"
    : ordered.join(",") === "1,2,3,4,5"
      ? "de lunes a viernes"
      : ordered.map((day) => dayNames[day]).join(", ");
  return `${names}, de ${start}:00 a ${end}:00`;
}

function scheduleOf(campaign: Campaign): string {
  return formatSchedule(campaign.sendDays ?? [1, 2, 3, 4, 5], campaign.sendStartHour ?? 8, campaign.sendEndHour ?? 18);
}

function reasonText(campaign: Campaign): string {
  const schedule = scheduleOf(campaign);
  if (campaign.lastReason === "fin_de_semana" || campaign.lastReason === "dia_no_seleccionado") {
    return `Hoy no sale ningún correo. La cola espera el siguiente día elegido: ${schedule}.`;
  }
  if (campaign.lastReason === "fuera_de_horario") return `Fuera del horario elegido: ${schedule}.`;
  if (campaign.lastReason === "tope_diario") return "Se alcanzó el tope de hoy. El resto sigue en cola.";
  return campaign.lastReason ?? "";
}

function windowOpenNow(days: number[], start: number, end: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const index: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return days.includes(index[weekday] ?? -1) && hour >= start && hour < end;
}

export function CampaignPanel() {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("Base de prueba");
  const [dailyLimit, setDailyLimit] = useState(40);
  const [sendDays, setSendDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [sendStartHour, setSendStartHour] = useState(8);
  const [sendEndHour, setSendEndHour] = useState(18);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const [templateResponse, campaignResponse] = await Promise.all([
      fetch(`${apiUrl}/v1/templates`, { headers, cache: "no-store" }),
      fetch(`${apiUrl}/v1/campaigns`, { headers, cache: "no-store" }),
    ]);
    if (templateResponse.ok) {
      const list = await templateResponse.json() as TemplateOption[];
      const approved = list.filter((item) => item.channel === "correo" && item.status === "aprobada");
      setTemplates(approved);
      setTemplateId((current) => current || approved[approved.length - 1]?.id || "");
    }
    if (campaignResponse.ok) setCampaigns(await campaignResponse.json() as Campaign[]);
  }

  async function activate() {
    if (busy || !templateId || name.trim().length < 2) return;
    if (sendDays.length === 0) {
      setError("Elija al menos un día de envío");
      return;
    }
    if (sendEndHour <= sendStartHour) {
      setError("La hora de cierre tiene que ser posterior a la de inicio");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await fetch(`${apiUrl}/v1/campaigns`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: name.trim(), dailyLimit, controlPercentage: 0, sendDays, sendStartHour, sendEndHour }),
      });
      const campaign = await readJson<{ id?: string; message?: string }>(created);
      if (!created.ok || !campaign.id) throw new Error(campaign.message ?? "No se pudo crear la campaña");
      const response = await fetch(`${apiUrl}/v1/campaigns/${campaign.id}/activate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ templateId }),
      });
      const payload = await readJson<{ message?: string }>(response);
      if (!response.ok) throw new Error(payload.message ?? "No se pudo activar la campaña");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo activar la campaña");
    } finally {
      setBusy(false);
    }
  }

  const latest = campaigns[campaigns.length - 1];

  return (
    <section className="panel campaign-panel">
      <header className="panel-head">
        <h2>Campaña</h2>
        <small>{latest ? latest.status : "Sin activar"}</small>
      </header>
      <div className="contact-body">
        <p className="template-note">
          Al activarla, cada contacto de la base entra una sola vez. El correo sale en los días y las horas que elija, con un tope diario. Este horario se cumple solo mientras el programa siga abierto en este equipo. Si apaga el computador o cierra la aplicación, la cola se detiene.
        </p>
        <div className="template-form campaign-form">
          <label>
            Nombre
            <input aria-label="Nombre de la campaña" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Plantilla aprobada
            <select aria-label="Plantilla de la campaña" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.length === 0 && <option value="">No hay una plantilla aprobada</option>}
              {templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Tope diario
            <input aria-label="Tope diario" type="number" min={1} max={150} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} />
          </label>
          <div className="schedule-block">
            <fieldset className="schedule-days">
              <legend>Días de envío</legend>
              {dayOptions.map((day) => (
                <label className="day-option" key={day.value}>
                  <input
                    type="checkbox"
                    checked={sendDays.includes(day.value)}
                    onChange={() => setSendDays((current) => current.includes(day.value) ? current.filter((item) => item !== day.value) : [...current, day.value])}
                  />
                  {day.label}
                </label>
              ))}
            </fieldset>
            <div className="schedule-hours">
              <label>
                Desde
                <select aria-label="Hora de inicio" value={sendStartHour} onChange={(event) => setSendStartHour(Number(event.target.value))}>
                  {Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{`${hour}:00`}</option>)}
                </select>
              </label>
              <label>
                Hasta
                <select aria-label="Hora de cierre" value={sendEndHour} onChange={(event) => setSendEndHour(Number(event.target.value))}>
                  {Array.from({ length: 24 }, (_, hour) => hour + 1).map((hour) => <option value={hour} key={hour}>{`${hour}:00`}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>
        {windowOpenNow(sendDays, sendStartHour, sendEndHour) && (
          <p className="template-note">Ese horario está abierto ahora. Al activar, el correo puede salir en los próximos minutos.</p>
        )}
        <button className="primary" type="button" disabled={busy || !templateId} onClick={() => void activate()}>
          {busy ? "Activando…" : "Activar campaña"}
        </button>
        {error && <p className="error">{error}</p>}
        {latest && <p className="template-note">Horario activo: {scheduleOf(latest)}.</p>}
        {latest?.lastReason && <p className="template-note">{reasonText(latest)}</p>}
        {latest && (
          <table className="contact-table">
            <thead>
              <tr>
                <th>Contacto</th>
                <th>Correo</th>
                <th>Empresa</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {latest.enrollments.length === 0 ? (
                <tr><td colSpan={4}>La base no tenía contactos con correo.</td></tr>
              ) : latest.enrollments.map((enrollment) => (
                <tr key={enrollment.id}>
                  <td>{enrollment.firstName} {enrollment.lastName}</td>
                  <td>{enrollment.email}</td>
                  <td>{enrollment.organizationName}</td>
                  <td>{statusLabel[enrollment.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({} as T)) as T;
}
