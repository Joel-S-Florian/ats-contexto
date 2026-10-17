// Receptor de contratados de referencia (Bloque C): valida la firma HMAC y la marca de tiempo, y muestra cada evento.
// Sirve de ejemplo para que los clientes implementen el suyo. SOLO desarrollo y demostraciones.
import type { IncomingMessage, ServerResponse } from "node:http";
import { signWebhook, verifyWebhook } from "@ats/shared/webhook";

const SECRET = process.env.DEMO_WEBHOOK_SECRET ?? "whsec_demo_local_secret_0001";
const MAX_EVENTS = 100;

interface Received {
  at: string;
  deliveryId: string | null;
  eventId: string | null;
  event: string | null;
  headers: Record<string, string>;
  validation: string;
  responded: number;
  duplicate: boolean;
  payload: unknown;
}
const events: Received[] = [];
const seen = new Set<string>();
const sim = { failNext: 0 };

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error("Cuerpo demasiado grande"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const json = (res: ServerResponse, status: number, body: unknown) =>
  res
    .writeHead(status, { "content-type": "application/json; charset=utf-8" })
    .end(JSON.stringify(body));

const labels: Record<string, string> = {
  ok: "Firma válida",
  bad_signature: "Firma inválida",
  stale_timestamp: "Marca de tiempo fuera de tolerancia",
  missing_headers: "Faltan cabeceras",
};

/** POST /webhooks/hired */
async function receive(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req);
  const h = (k: string) => (req.headers[k] as string | undefined) ?? null;
  const headers = Object.fromEntries(
    ["x-ats-event", "x-ats-delivery", "x-ats-timestamp", "x-ats-signature"].map((k) => [
      k,
      h(k) ?? "",
    ]),
  );
  const v = verifyWebhook({
    secret: SECRET,
    body,
    signature: h("x-ats-signature"),
    timestamp: h("x-ats-timestamp"),
  });
  let payload: { id?: string; event?: string } | null = null;
  try {
    payload = JSON.parse(body);
  } catch {
    /* cuerpo no JSON: se registra como inválido */
  }
  const eventId = payload?.id ?? null;
  const duplicate = Boolean(eventId && seen.has(eventId));
  let status = 200;
  let validation = labels.ok!;
  if (!v.ok) {
    status = 401;
    validation = labels[v.reason] ?? v.reason;
  } else if (sim.failNext > 0) {
    // Error simulado para ejercitar los reintentos del emisor.
    sim.failNext--;
    status = 500;
    validation = "Firma válida, pero se simula un error del receptor";
  } else if (eventId) seen.add(eventId); // idempotencia: un reenvío del mismo evento no se procesa dos veces
  events.unshift({
    at: new Date().toISOString(),
    deliveryId: h("x-ats-delivery"),
    eventId,
    event: payload?.event ?? null,
    headers,
    validation,
    responded: status,
    duplicate: duplicate && status === 200,
    payload,
  });
  events.length = Math.min(events.length, MAX_EVENTS);
  json(res, status, { received: status === 200, duplicate: duplicate && status === 200 });
}

/** Envía un evento firmado a este mismo receptor, para probar sin depender de la API. */
async function selfSend(origin: string, valid: boolean) {
  const now = new Date().toISOString();
  const body = JSON.stringify({
    schema_version: "1.0",
    id: `evt_demo_${Date.now()}`,
    event: "candidate.hired",
    occurred_at: now,
    data: {
      hire_id: "demo-0000",
      internal_reference: "DEMO",
      hired_at: now,
      start_date: null,
      candidate: {
        full_name: "Persona de Ejemplo",
        email: "ejemplo@example.com",
        phone: "8095550000",
      },
      position: {
        vacancy_id: null,
        title: "Puesto de ejemplo",
        department: "Demo",
        employment_type: "full_time",
        work_mode: "onsite",
        location: "Santo Domingo",
      },
    },
  });
  const ts = Math.floor(Date.now() / 1000);
  await fetch(`${origin}/webhooks/hired`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ats-event": "candidate.hired",
      "x-ats-delivery": `del_demo_${ts}`,
      "x-ats-timestamp": String(ts),
      "x-ats-signature": valid
        ? signWebhook(SECRET, ts, body)
        : signWebhook("otro-secreto", ts, body),
    },
    body,
  });
}

const page = `<!doctype html><html lang="es-DO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receptor de contratados</title>
<style>
:root{--ac:#5846e6;color-scheme:light}*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif;background:#f4f5fa;color:#12131c}
.w{max-width:960px;margin:0 auto;padding:24px 20px 64px}h1{margin:0;font-size:24px;letter-spacing:-.02em}p.s{color:#6a6f84;margin:6px 0 20px;font-size:14px}
.bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}button{font:inherit;font-weight:600;font-size:14px;border:1px solid #e3e6f0;background:#fff;border-radius:10px;padding:9px 14px;cursor:pointer;transition:transform .14s cubic-bezier(.23,1,.32,1),background .2s}
button:active{transform:scale(.97)}button.p{background:linear-gradient(135deg,#5846e6,#8b5cf6);color:#fff;border:0}
.ev{background:#fff;border:1px solid #e3e6f0;border-radius:14px;padding:14px 16px;margin-bottom:10px;animation:in .32s cubic-bezier(.23,1,.32,1) both}@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}.b{border-radius:999px;padding:2px 10px;font-weight:600;font-size:12px}.ok{background:#e4f6ee;color:#0f8a5f}.no{background:#fdeceb;color:#c7372f}.wa{background:#fff1dd;color:#b45309}
pre{margin:10px 0 0;background:#f4f5fa;border-radius:10px;padding:10px;overflow:auto;font-size:12px;max-height:220px}.m{color:#6a6f84}.e{text-align:center;color:#6a6f84;padding:40px 0}
@media (prefers-reduced-motion:reduce){.ev{animation:none}}
</style></head><body><div class="w">
<h1>Receptor de contratados</h1><p class="s">Recibe <code>POST /webhooks/hired</code>, valida la firma HMAC SHA-256 y la marca de tiempo, y muestra cada evento. Es un ejemplo de referencia para tu propio receptor.</p>
<div class="bar"><button class="p" onclick="act('send-ok')">Enviar evento de ejemplo firmado</button><button onclick="act('send-bad')">Enviar con firma inválida</button><button onclick="act('fail?n=2')">Responder error 500 en los próximos 2 envíos</button><button onclick="act('clear')">Limpiar</button><a href="/" style="margin-left:auto;align-self:center;font-size:14px;color:#5846e6">Volver a la página de empleo</a></div>
<div id="list"></div></div>
<script>
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function act(p){await fetch('/receptor/'+p,{method:'POST'});load()}
async function load(){const r=await (await fetch('/receptor/events.json')).json();const el=document.getElementById('list');
 if(!r.length){el.innerHTML='<div class="e">Aún no llegan eventos. Contrata a alguien en el panel o usa los botones de arriba.</div>';return}
 el.innerHTML=r.map(e=>'<div class="ev"><div class="top"><span class="b '+(e.responded===200?'ok':e.responded===401?'no':'wa')+'">HTTP '+e.responded+'</span><b>'+esc(e.event||'(sin evento)')+'</b><span class="m">'+esc(new Date(e.at).toLocaleTimeString('es-DO'))+'</span><span>'+esc(e.validation)+'</span>'+(e.duplicate?'<span class="b wa">Duplicado</span>':'')+'</div><div class="m" style="font-size:12px;margin-top:6px">entrega '+esc(e.deliveryId)+' · evento '+esc(e.eventId)+'</div><pre>'+esc(JSON.stringify({headers:e.headers,payload:e.payload},null,2))+'</pre></div>').join('')}
load();setInterval(load,3000);
</script></body></html>`;

/** Devuelve true si la ruta le correspondía. */
export async function handleReceiver(
  req: IncomingMessage,
  res: ServerResponse,
  origin: string,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (req.method === "POST" && url === "/webhooks/hired") return (await receive(req, res), true);
  if (req.method === "GET" && url === "/receptor")
    return (res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page), true);
  if (req.method === "GET" && url === "/receptor/events.json")
    return (json(res, 200, events), true);
  if (req.method === "POST" && url === "/receptor/clear")
    return ((events.length = 0), seen.clear(), (sim.failNext = 0), json(res, 200, {}), true);
  if (req.method === "POST" && url === "/receptor/fail")
    return (
      (sim.failNext = Math.min(
        10,
        Number(new URL(req.url!, origin).searchParams.get("n") ?? 2) || 2,
      )),
      json(res, 200, { failNext: sim.failNext }),
      true
    );
  if (req.method === "POST" && (url === "/receptor/send-ok" || url === "/receptor/send-bad"))
    return (await selfSend(origin, url.endsWith("ok")), json(res, 200, {}), true);
  return false;
}
