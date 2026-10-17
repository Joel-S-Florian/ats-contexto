import {
  ClipboardList,
  FileText,
  MessagesSquare,
  ClipboardCheck,
  UserCheck,
  Handshake,
  Activity,
} from "lucide-react";
import { SystemStatus } from "@/components/system-status";

const stages = [
  { name: "Postulación", icon: FileText },
  { name: "Preselección", icon: ClipboardList },
  { name: "Entrevista", icon: MessagesSquare },
  { name: "Evaluación", icon: ClipboardCheck },
  { name: "Selección", icon: UserCheck },
  { name: "Contratación", icon: Handshake },
  { name: "Seguimiento", icon: Activity },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Resumen</h1>
        <p className="mt-1 text-sm text-muted">Embudo de contratación y estado de la plataforma.</p>
      </header>

      <section className="mb-6 rounded-card border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Embudo por defecto</h2>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stages.map(({ name, icon: Icon }, i) => (
            <li
              key={name}
              style={{ "--i": i } as React.CSSProperties}
              className="rise lift flex flex-col items-start gap-3 rounded-lg border border-border bg-bg p-3"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Icon size={16} />
              </span>
              <span className="text-sm font-medium">{name}</span>
              <span className="text-xs text-muted">Etapa {i + 1}</span>
            </li>
          ))}
        </ol>
      </section>

      <SystemStatus />
    </div>
  );
}
