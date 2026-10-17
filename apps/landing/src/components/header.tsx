"use client";
import { useState } from "react";
import { Briefcase, Menu, X } from "lucide-react";
import { brand, nav } from "@/content/es";

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="glass sticky top-0 z-50 border-b border-border/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#inicio" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span
            className="flex size-8 items-center justify-center rounded-lg text-white"
            style={{ background: "var(--gradient)", boxShadow: "var(--shadow-glow)" }}
          >
            <Briefcase size={16} aria-hidden />
          </span>
          {brand.name}
        </a>
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {n.label}
            </a>
          ))}
          <a href="#demo" className="btn btn-primary ml-2 !px-4 !py-2 text-sm">
            Solicitar demo
          </a>
        </nav>
        <button
          className="rounded-lg p-2 md:hidden"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          aria-controls="menu-movil"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav
          id="menu-movil"
          aria-label="Principal móvil"
          className="border-t border-border px-5 py-3 md:hidden"
        >
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-base font-medium"
            >
              {n.label}
            </a>
          ))}
          <a href="#demo" onClick={() => setOpen(false)} className="btn btn-primary mt-2 w-full">
            Solicitar demo
          </a>
        </nav>
      )}
    </header>
  );
}
