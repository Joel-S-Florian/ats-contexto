// Estilos del widget. Viven dentro del Shadow DOM, así que no chocan con los de la página del cliente.
// El cliente puede personalizar el acento con --ats-accent en el contenedor (ej. #careers-widget { --ats-accent: #0f766e }).
export const css = `
:host { all: initial; display: block; }
* { box-sizing: border-box; }
.w {
  --accent: var(--ats-accent, #5846e6);
  --accent-soft: color-mix(in srgb, var(--accent) 10%, white);
  --text: #101828; --muted: #667085; --border: #e4e7ec; --surface: #fff; --bg: #f7f8fa;
  --danger: #c0322b; --danger-soft: #fdecea; --success: #12875a; --success-soft: #e7f6ef;
  --ease: cubic-bezier(0.23, 1, 0.32, 1);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
  color: var(--text); font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) { .w.auto-dark {
  --accent-soft: color-mix(in srgb, var(--accent) 18%, #12151c);
  --text: #f2f4f7; --muted: #98a2b3; --border: #262b36; --surface: #12151c; --bg: #0b0d12;
  --danger-soft: #331816; --success-soft: #11291f;
} }
svg.i { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
h2, h3, p { margin: 0; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }

.view { animation: in 280ms var(--ease) both; }
@keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.search { position: relative; flex: 1 1 220px; }
.search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 16px; }
.search input { padding-left: 36px; }
input, select, textarea {
  width: 100%; border: 1px solid var(--border); background: var(--surface); border-radius: 10px;
  padding: 9px 12px; font-size: 14px; transition: border-color 200ms ease, box-shadow 200ms ease;
}
textarea { resize: vertical; }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
select { width: auto; }

.card {
  display: block; width: 100%; text-align: left; background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 16px 18px; margin-bottom: 10px;
  transition: transform 200ms var(--ease), box-shadow 200ms ease, border-color 200ms ease;
  animation: in 320ms var(--ease) both; animation-delay: calc(var(--i, 0) * 45ms);
}
@media (hover: hover) and (pointer: fine) { .card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgb(16 24 40 / .08); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); } }
.card:active { transform: scale(0.99); }
.card h3 { font-size: 16px; font-weight: 600; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; color: var(--muted); font-size: 13px; }
.meta span { display: inline-flex; align-items: center; gap: 5px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.tag { background: var(--accent-soft); color: var(--accent); border-radius: 6px; padding: 2px 8px; font-size: 12px; font-weight: 500; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 10px;
  padding: 10px 18px; font-weight: 600; font-size: 14px; background: var(--accent); color: #fff;
  transition: transform 140ms var(--ease), opacity 200ms ease, filter 200ms ease;
}
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: .6; pointer-events: none; }
@media (hover: hover) and (pointer: fine) { .btn:hover { filter: brightness(1.08); } }
.btn.ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
.back { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; color: var(--muted); padding: 4px 0; margin-bottom: 14px; font-size: 14px; transition: color 200ms ease, transform 140ms var(--ease); }
.back:hover { color: var(--text); }
.back:active { transform: scale(0.97); }

.detail h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
.detail section { margin-top: 20px; }
.detail h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 6px; }
.detail p { white-space: pre-line; }
.cta { margin-top: 24px; }

form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
.full { grid-column: 1 / -1; }
@media (max-width: 560px) { form { grid-template-columns: 1fr; } }
label { display: block; font-size: 13px; font-weight: 600; }
label > .c { margin-top: 5px; font-weight: 400; }
.hint { font-weight: 400; color: var(--muted); font-size: 12px; margin-top: 4px; display: block; }
.drop {
  display: flex; align-items: center; gap: 10px; border: 1.5px dashed var(--border); border-radius: 12px; padding: 14px;
  background: var(--bg); transition: border-color 200ms ease, background-color 200ms ease; font-weight: 400;
}
.drop.over, .drop:hover { border-color: var(--accent); background: var(--accent-soft); }
.drop svg { font-size: 20px; color: var(--accent); }
.drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.consent { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; font-size: 13px; }
.consent input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--accent); }
details { font-size: 13px; color: var(--muted); }
details summary { cursor: pointer; }
details p { margin-top: 6px; }
.err { display: flex; gap: 8px; align-items: flex-start; background: var(--danger-soft); color: var(--danger); border-radius: 10px; padding: 10px 12px; font-size: 14px; animation: in 240ms var(--ease) both; }
.empty { text-align: center; color: var(--muted); padding: 36px 12px; }
.skel { height: 78px; border-radius: 14px; margin-bottom: 10px; background: var(--border); position: relative; overflow: hidden; }
.skel::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, rgb(255 255 255 / .55), transparent); animation: sh 1.3s linear infinite; }
@keyframes sh { to { transform: translateX(100%); } }
.spin { animation: rot .8s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }

.done { text-align: center; padding: 28px 8px; }
.ok { width: 56px; height: 56px; border-radius: 50%; background: var(--success-soft); color: var(--success); display: grid; place-items: center; margin: 0 auto 16px; font-size: 28px; animation: pop 420ms var(--ease) both; }
.ok svg { stroke-dasharray: 30; stroke-dashoffset: 30; animation: draw 420ms 160ms var(--ease) forwards; }
@keyframes pop { from { transform: scale(.8); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes draw { to { stroke-dashoffset: 0; } }
.code { display: inline-block; margin-top: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; font-family: ui-monospace, monospace; font-size: 13px; user-select: all; }
@media (prefers-reduced-motion: reduce) {
  .view, .card, .err, .ok, .ok svg, .skel::after { animation: none; }
  .ok svg { stroke-dashoffset: 0; }
  .btn, .card, .back { transition: none; }
}
`;
