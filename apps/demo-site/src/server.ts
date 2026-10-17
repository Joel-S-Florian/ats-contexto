// Sitio de pruebas (Bloque C): simula la página "Trabaja con nosotros" de una empresa cliente.
// SOLO desarrollo y demostraciones. Nunca se conecta a datos reales.
//   :3100  origen permitido por la clave de demostración -> el widget funciona
//   :3101  origen distinto -> la API debe rechazarlo (prueba de orígenes no permitidos)
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { handleReceiver } from "./receiver.js";
import { fileURLToPath } from "node:url";

const API = process.env.DEMO_API_URL ?? "http://localhost:4000";
const KEY = process.env.DEMO_PUBLIC_KEY ?? "pk_demo_local_0001";
const widgetFile = join(dirname(fileURLToPath(import.meta.url)), "../../widget/dist/widget.js");

const page = (opts: { title: string; banner: string; allowed: boolean }) => `<!doctype html>
<html lang="es-DO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title}</title>
<style>
  :root { --accent: #0f766e; color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif; color: #101828; background: #f7f8fa; }
  header { background: #0b2b2a; color: #fff; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 0 20px; }
  nav { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; font-weight: 600; }
  nav span:last-child { font-weight: 400; opacity: .7; font-size: 14px; }
  .hero { padding: 40px 0 56px; }
  .hero h1 { margin: 0; font-size: clamp(28px, 5vw, 40px); letter-spacing: -0.02em; }
  .hero p { margin: 12px 0 0; max-width: 520px; opacity: .8; }
  main { padding: 32px 0 64px; }
  .banner { border-radius: 12px; padding: 12px 16px; margin-bottom: 24px; font-size: 14px; background: ${opts.allowed ? "#e7f6ef" : "#fdecea"}; color: ${opts.allowed ? "#0b5d3f" : "#8f241e"}; }
  .note { margin-top: 32px; font-size: 13px; color: #667085; }
  footer { border-top: 1px solid #e4e7ec; padding: 20px 0; font-size: 13px; color: #667085; }
  a { color: var(--accent); }
</style>
</head>
<body>
<header><div class="wrap">
  <nav><span>Empresa Demo</span><span>Sitio de pruebas · <a href="/receptor" style="color:#fff">Receptor de contratados</a></span></nav>
  <div class="hero"><h1>Trabaja con nosotros</h1><p>Somos una empresa ficticia. Esta página existe para probar el widget de postulación de punta a punta.</p></div>
</div></header>
<main><div class="wrap">
  <div class="banner">${opts.banner}</div>
  <div id="careers-widget"></div>
  <script src="/widget.js" data-key="${KEY}" data-api="${API}" data-mode="jobs"></script>
  <p class="note">${opts.allowed ? 'Para probar el rechazo de orígenes abre <a href="http://localhost:3101">http://localhost:3101</a>.' : 'Vuelve a <a href="http://localhost:3100">http://localhost:3100</a> (origen permitido).'}</p>
</div></main>
<footer><div class="wrap">Empresa Demo es ficticia. No ingreses datos reales.</div></footer>
</body></html>`;

function serve(port: number, allowed: boolean) {
  createServer(async (req, res) => {
    // El receptor de contratados vive solo en el origen principal.
    if (allowed && (await handleReceiver(req, res, `http://localhost:${port}`).catch(() => false)))
      return;
    if (req.url === "/widget.js") {
      try {
        res
          .writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
          })
          .end(await readFile(widgetFile));
      } catch {
        res.writeHead(404).end("Falta compilar el widget: pnpm --filter @ats/widget build");
      }
      return;
    }
    if (req.url === "/" || req.url?.startsWith("/?")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(
        page(
          allowed
            ? {
                title: "Empresa Demo - Empleo",
                allowed,
                banner:
                  "Origen permitido (localhost:3100): el listado y las postulaciones deben funcionar.",
              }
            : {
                title: "Empresa Demo - Origen no permitido",
                allowed,
                banner:
                  "Origen NO permitido (localhost:3101): la API debe rechazar al widget. Es el resultado esperado de esta prueba.",
              },
        ),
      );
      return;
    }
    res.writeHead(404).end("No encontrado");
  }).listen(port, () =>
    console.log(
      `demo-site (${allowed ? "origen permitido" : "origen no permitido"}) en http://localhost:${port}`,
    ),
  );
}

serve(Number(process.env.DEMO_PORT ?? 3100), true);
serve(Number(process.env.DEMO_OTHER_PORT ?? 3101), false);
