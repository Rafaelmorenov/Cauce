import { CampaignPanel } from "@/components/campaign-panel";
import { ContactBase } from "@/components/contact-base";
import { ProspectWorkspace } from "@/components/prospect-workspace";
import { TemplateStudio } from "@/components/template-studio";

const nav = [
  ["Resumen", true],
  ["Prospección", false],
  ["Contactos", false],
  ["Plantillas", false],
  ["Campañas", false],
  ["Respuestas", false],
  ["Reuniones", false],
  ["Ventas y ROI", false],
  ["Conexiones", false],
];

export default function Home() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div><strong>Cauce</strong><small>Del mercado a la venta</small></div>
        </div>
        <nav className="nav" aria-label="Navegación principal">
          {nav.map(([label, active]) => (
            <a href="#" className={active ? "active" : ""} key={String(label)}>
              <span className="nav-dot" />{label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <div className="tenant">
            <strong>Empresa de demostración</strong>
            America/Bogota · Administrador
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Panel comercial</p>
            <h1>De una conversación a ventas.</h1>
            <p className="subtitle">Defina el mercado, apruebe la audiencia y mida el resultado completo.</p>
          </div>
          <div className="status-chip"><span /> Entorno de demostración</div>
        </header>

        <section className="metric-grid" aria-label="Embudo">
          <Metric label="Contactos" value="0" note="este mes" />
          <Metric label="Respuestas" value="0" note="0%" />
          <Metric label="Reuniones" value="0" note="0%" />
          <Metric label="Ventas" value="0" note="COP" />
          <Metric label="ROI" value="—" note="sin datos" />
        </section>

        <ProspectWorkspace />
        <TemplateStudio />
        <ContactBase />
        <CampaignPanel />
      </main>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><label>{label}</label><strong>{value}</strong><small>{note}</small></div>;
}
