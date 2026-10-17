// Esqueleto del sitio de pruebas (solo desarrollo). Pagina de empleo y receptor llegan en Fases 3 y 8.
import { createServer } from "node:http";

const port = Number(process.env.DEMO_PORT ?? 3100);
createServer((_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end("<h1>Empresa Demo</h1><p>Sitio de pruebas: pendiente Fase 3.</p>");
}).listen(port, () => console.log(`demo-site en http://localhost:${port}`));
