"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, LayoutDashboard, Settings, Users, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const items = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/vacantes", label: "Vacantes", icon: Briefcase },
  { href: "/candidatos", label: "Candidatos", icon: Users },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

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
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2 pt-1">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-contrast">
          <Briefcase size={16} />
        </div>
        <span className="font-semibold tracking-tight">Reclutamiento</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`press group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
            >
              <Icon size={18} className="transition-transform duration-200 group-hover:scale-110" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between border-t border-border px-1 pt-3">
        <span className="text-xs text-muted">Empresa Demo</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
