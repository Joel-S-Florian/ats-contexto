import { brand, footer } from "@/content/es";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-fg">{brand.name}</p>
          <p className="mt-1">{footer.tagline}</p>
        </div>
        <nav aria-label="Legal" className="flex gap-5">
          {footer.links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-fg">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
