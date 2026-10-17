"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Building2,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  UserCog,
  Workflow,
  Inbox,
  KeyRound,
  ClipboardCheck,
  BarChart3,
  Mail,
  PlugZap,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/app-shell";
import { roleLabels } from "@/lib/api";

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // almacenamiento bloqueado: el tema solo dura la sesión
    }
    setDark(!dark);
  };
  const Icon = dark ? Sun : Moon;
  return (
    <button
      onClick={toggle}
      aria-label="Cambiar tema"
      className="press flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
    >
      <Icon size={18} />
    </button>
  );
}

export function Sidebar() {
  const path = usePathname();
  const { me, logout } = useAuth();
  const items = [
    { href: "/", label: "Resumen", icon: LayoutDashboard, show: true },
    { href: "/vacantes", label: "Vacantes", icon: Briefcase, show: Boolean(me.role) },
    { href: "/embudos", label: "Embudos", icon: Workflow, show: Boolean(me.role) },
    { href: "/candidatos", label: "Candidatos", icon: Inbox, show: Boolean(me.role) },
    { href: "/claves", label: "Widget y claves", icon: KeyRound, show: me.role === "admin" },
    {
      href: "/plantillas",
      label: "Plantillas",
      icon: Mail,
      show: me.role === "admin" || me.role === "recruiter",
    },
    {
      href: "/evaluaciones",
      label: "Evaluaciones",
      icon: ClipboardCheck,
      show: me.role === "admin" || me.role === "recruiter",
    },
    {
      href: "/seguimiento",
      label: "Seguimiento",
      icon: BarChart3,
      show: me.role === "admin" || me.role === "recruiter",
    },
    { href: "/integraciones", label: "Integraciones", icon: PlugZap, show: me.role === "admin" },
    { href: "/configuracion", label: "Configuración", icon: Settings, show: me.role === "admin" },
    { href: "/empresas", label: "Empresas", icon: Building2, show: me.isSuperAdmin },
    { href: "/usuarios", label: "Usuarios", icon: UserCog, show: me.role === "admin" },
  ].filter((i) => i.show);

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col glass border-r border-border p-4 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2 pt-1">
        <div className="brand-mark flex size-9 items-center justify-center rounded-xl">
          <Briefcase size={16} />
        </div>
        <div className="leading-tight">
          <span className="block font-semibold tracking-tight">Reclutamiento</span>
          <span className="text-xs text-muted">Panel de RRHH</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`press nav-link group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
            >
              <Icon size={18} className="transition-transform duration-200 group-hover:scale-110" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border pt-3">
        <div className="mb-2 px-1">
          <p className="truncate text-sm font-medium">{me.name}</p>
          <p className="truncate text-xs text-muted">
            {me.isSuperAdmin ? "Operador de la plataforma" : me.role ? roleLabels[me.role] : ""}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={logout}
            className="press flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
