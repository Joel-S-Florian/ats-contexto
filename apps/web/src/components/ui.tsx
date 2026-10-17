"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";

const tones = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const statusTone = {
  draft: "neutral",
  published: "success",
  paused: "warning",
  closed: "danger",
} as const;

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="rise flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-surface-2 text-muted">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-medium ${className}`}>
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
      {hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

/** Etiquetas editables: Enter o coma agregan; cada chip entra con una micro-animación. */
export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().replace(/,$/, "");
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="field flex flex-wrap items-center gap-1.5 !p-1.5">
      {value.map((t) => (
        <span
          key={t}
          className="rise inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent"
        >
          {t}
          <button
            type="button"
            aria-label={`Quitar ${t}`}
            onClick={() => onChange(value.filter((v) => v !== t))}
            className="press rounded hover:text-fg"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent px-1.5 py-1 text-sm outline-none"
      />
      {draft && (
        <button
          type="button"
          onClick={add}
          aria-label="Agregar"
          className="press rounded p-1 text-muted hover:text-fg"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}
