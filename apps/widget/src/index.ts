// Esqueleto: el formulario y el listado llegan en la Fase 3. Ya usa Shadow DOM para aislar estilos.
const script = document.currentScript as HTMLScriptElement | null;
const host = document.getElementById("careers-widget");
if (host && script?.dataset.key) {
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<p style="font-family:system-ui">Widget de empleo (pendiente Fase 3)</p>`;
}
