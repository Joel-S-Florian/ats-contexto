import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { USD_TO_DOP_REFERENCE, planKeys, plans } from "@ats/shared";
import { nav, pricing } from "@/content/es";
import Page from "@/app/page";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

const html = renderToStaticMarkup(<Page />);

describe("landing: contenido y estructura", () => {
  it("tiene un solo h1 y todas las secciones del documento de producto", () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    for (const id of [
      "inicio",
      "como-funciona",
      "funcionalidades",
      "confianza",
      "planes",
      "preguntas",
      "demo",
    ])
      expect(html).toContain(`id="${id}"`);
  });

  it("los precios y límites salen de la fuente única compartida, sin cifras duplicadas", () => {
    for (const k of planKeys) {
      const p = plans[k];
      expect(html).toContain(p.name);
      expect(html).toContain(`US$ ${p.priceUsd}`);
      expect(html).toContain((p.priceUsd * USD_TO_DOP_REFERENCE).toLocaleString("es-DO"));
    }
    expect(pricing.popular in plans).toBe(true);
    expect(html).toContain("Sin IA"); // Esencial: 0 análisis
    expect(html).toContain("Ilimitadas"); // Empresa: vacantes sin tope
  });

  it("es accesible: enlaces internos válidos, secciones etiquetadas, campos con etiqueta y botón de salto", () => {
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    for (const n of nav) expect(ids.has(n.href.slice(1)), n.href).toBe(true);
    for (const m of html.matchAll(/aria-labelledby="([^"]+)"/g))
      expect(ids.has(m[1]!), m[1]).toBe(true);
    const fields = html.match(/<(input|select|textarea)\b[^>]*>/g) ?? [];
    expect(fields.length).toBeGreaterThanOrEqual(7);
    // cada campo visible vive dentro de un <label>
    const labelled = html.match(/<label[\s\S]*?<\/label>/g) ?? [];
    const inLabels = labelled.join("").match(/<(input|select|textarea)\b/g) ?? [];
    expect(inLabels.length).toBe(fields.length);
    for (const a of html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [])
      expect(a.replace(/<[^>]+>/g, "").trim().length, a).toBeGreaterThan(0);
    for (const b of html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [])
      expect(/aria-label|>[^<]+</.test(b), b).toBe(true);
    expect(html.includes("<img")).toBe(false); // sin imágenes pesadas: rendimiento
  });

  it("no usa emojis y el formulario lleva el señuelo anti-bots fuera de pantalla", () => {
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(html).toContain('name="website"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('name="consent"');
  });

  it("el estado final sin JavaScript muestra el contenido (los bloques se ocultan solo con la clase js)", async () => {
    const css = (await import("node:fs")).readFileSync(
      new URL("./app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/\.js \.reveal\s*\{/);
    expect(css).not.toMatch(/^\.reveal\s*\{[^}]*opacity:\s*0/m);
    expect(css).toContain("prefers-reduced-motion");
  });
});

describe("landing: SEO", () => {
  it("el mapa del sitio y robots apuntan a las páginas reales", () => {
    const urls = sitemap().map((s) => s.url);
    expect(urls.some((u) => u.endsWith("/privacidad"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/terminos"))).toBe(true);
    expect(robots().sitemap).toMatch(/sitemap\.xml$/);
  });

  it("incluye datos estructurados FAQ válidos", () => {
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)!;
    const ld = JSON.parse(
      m[1]!
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&#x27;/g, "'"),
    );
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity.length).toBeGreaterThanOrEqual(6);
  });
});
