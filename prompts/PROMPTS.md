# Prompts por fases para Claude Code

Cómo usar este archivo:

1. Copia la carpeta del proyecto (incluyendo `CLAUDE.md` y `docs/`) en la raíz del repositorio.
2. Abre Claude Code en esa raíz. Claude Code lee `CLAUDE.md` automáticamente.
3. Pega primero el Prompt 0 (modo de trabajo). Después, un prompt por fase, en orden.
4. No pases a la siguiente fase hasta que la anterior tenga pruebas pasando y los criterios de aceptación verificados.
5. Cuando Claude Code tome una decisión nueva, pídele que la registre en `docs/01-producto.md` (sección 6).

---

## Prompt 0 - Modo de trabajo

```
Vas a ayudarme a construir una plataforma SaaS de reclutamiento (ATS) multi-tenant.
Lee completo CLAUDE.md y los archivos de docs/ antes de hacer nada. Son la fuente de verdad.

Modo de trabajo:
- Trabajamos por fases. En cada fase, primero me presentas un plan breve (qué vas a crear, en qué orden, qué decisiones necesitas de mí) y esperas mi confirmación antes de escribir código.
- Si algo del contexto es ambiguo o se contradice, pregúntame. No asumas en silencio.
- Cada fase termina con pruebas automatizadas pasando y una lista de criterios de aceptación verificados.
- No adelantes funcionalidades de fases futuras.
- Respeta las reglas no negociables de CLAUDE.md (aislamiento por tenant, la IA no decide en silencio, el CV es entrada no confiable, sin datos personales en logs, costos de IA acotados).
- Tipado estricto, sin any, zod en los bordes.

Entregables del proyecto (están en CLAUDE.md y docs/01-producto.md sección 0):
- Bloque A: landing comercial del SaaS (apps/landing).
- Bloque B: el SaaS = widget y API pública, panel administrador y API (incluida la API de contratados).
- Bloque C: sitio de pruebas (apps/demo-site) con página de empleo ficticia que incrusta el widget y un receptor de contratados, para probar de punta a punta.

Confírmame que leíste los documentos resumiendo en 10 líneas qué vamos a construir y qué NO entra al MVP. Después espera mi indicación para empezar la Fase 0.
```

---

## Fase 0 - Fundaciones del repositorio

```
Fase 0: fundaciones.

Objetivo: dejar el monorepo listo para desarrollar.

Alcance:
- Monorepo con pnpm workspaces: apps/api, apps/web, apps/widget, apps/landing, apps/demo-site, packages/shared, packages/ai, packages/db. Las apps landing y demo-site pueden quedar como esqueletos mínimos que arrancan; su contenido llega en las fases 3, 8 y 10.
- Elegir entre Fastify y NestJS para la API. Propón tu recomendación con razones breves y espera mi confirmación; documenta la decisión.
- TypeScript estricto compartido, ESLint, Prettier, Vitest, hooks de commit.
- docker-compose para desarrollo: PostgreSQL, Redis, almacenamiento compatible con S3 y servidor de correo de pruebas.
- Validación de variables de entorno con zod que falle al arrancar si falta algo, con un archivo .env.example completo.
- Logger estructurado que NO registre datos personales (con redacción de campos sensibles).
- CI básica: lint, tipos, tests.
- Un endpoint de salud en la API y una página mínima en el panel para verificar que todo conecta.

Criterios de aceptación:
- pnpm install, pnpm dev y pnpm test funcionan desde cero siguiendo un README corto.
- docker-compose levanta los servicios y la API conecta a la base y a Redis.
- La CI pasa.

Antes de codificar, preséntame el plan.
```

---

## Fase 1 - Multi-tenencia, usuarios y roles

```
Fase 1: multi-tenencia, autenticación y roles.

Lee docs/02-arquitectura.md (secciones 2 y 3) y docs/04-seguridad-y-privacidad.md (secciones 1 a 3).

Alcance:
- Esquema Prisma inicial: Tenant, User, Membership, AuditLog, y la base para el resto de entidades. Todas las tablas de negocio con tenant_id.
- Capa de acceso a datos que inyecta el tenant obligatoriamente, y políticas Row Level Security en PostgreSQL con app.tenant_id por transacción.
- Autenticación con correo y contraseña (Argon2id), sesiones seguras, recuperación de contraseña.
- Roles: super administrador, administrador, reclutador, responsable de área. Middleware de autorización según la matriz de docs/04.
- Alta de un tenant y de su primer administrador (flujo del super administrador) e invitación de usuarios.
- AuditLog para acciones sensibles.
- Panel: inicio de sesión, layout base con navegación según rol, gestión de usuarios del tenant.

Pruebas obligatorias:
- Aislamiento: un usuario del tenant A no puede leer ni modificar nada del tenant B (probado a nivel de API y a nivel de base con RLS).
- Autorización por rol para cada endpoint creado.

Criterios de aceptación: los de arriba, más migraciones reproducibles y un seed para desarrollo con dos tenants de ejemplo.

Preséntame el plan antes de codificar.
```

---

## Fase 2 - Vacantes, embudos configurables y búsqueda pública

```
Fase 2: vacantes, embudos configurables y API pública de vacantes.

Lee docs/01-producto.md (secciones 2 y 4.1, 4.2) y docs/02-arquitectura.md (secciones 3, 4 y 6).

Alcance:
- CRUD de vacantes con todos los campos de docs/01-producto.md sección 4.1, incluyendo skills (obligatorias y deseables), categoría de puesto, filtros eliminatorios, estado y responsable de área.
- Pipeline y PipelineStage como datos: plantillas por tenant, plantilla por defecto (Postulación, Preselección, Entrevista, Evaluación, Selección, Contratación, Seguimiento), asignación a vacante, orden y configuración por etapa.
- Panel: listado, creación y edición de vacantes; editor de embudos con etapas activables y reordenables.
- API pública GET /public/v1/jobs y GET /public/v1/jobs/:id con búsqueda por texto y filtros (ubicación, modalidad, tipo de empleo, nivel, fecha, departamento) y paginación. Solo vacantes publicadas.
- Endpoint de datos estructurados JobPosting (JSON-LD) por vacante.

Pruebas: CRUD con aislamiento por tenant, filtros de búsqueda, que no se expongan vacantes no publicadas ni de otro tenant, validación de reglas de transición de etapas.

Criterios de aceptación: puedo crear una vacante con un embudo propio y verla en la API pública con filtros funcionando.

Preséntame el plan antes de codificar.
```

---

## Fase 3 - Widget y captación de postulaciones

```
Fase 3: widget de postulación e ingestión.

Lee docs/02-arquitectura.md (secciones 5 y 6) y docs/04-seguridad-y-privacidad.md (secciones 4, 5, 7 y 8).

Alcance:
- ApiKey (clave pública con orígenes permitidos y clave secreta con hash) y su gestión en el panel.
- POST /public/v1/applications (multipart): validación zod, verificación de clave y origen, CORS estricto, captcha, límites de tasa, aceptación obligatoria del aviso de datos, validación de archivo por firma (solo PDF y .docx, máximo 5 MB), escaneo antivirus.
- Modelos Candidate, Application (vacante nula = bolsa general), Document, ConsentRecord. Correo único por tenant.
- Cola BullMQ: tras la recepción, trabajo asíncrono que extrae texto del PDF y del .docx y deja la postulación lista para preselección. PDF sin texto => estado "no legible" y revisión manual.
- Correo de confirmación al candidato (interfaz EmailProvider con adaptador de desarrollo, el de Google viene en la fase 6).
- Widget en apps/widget: script con data-key, Shadow DOM, modo listado de vacantes con buscador y filtros, detalle con formulario, y formulario general. Campos de docs/01-producto.md sección 4.3.
- Sitio de pruebas (apps/demo-site), parte 1: página de empleo ficticia de "Empresa Demo" que incruste el widget con la clave pública de un tenant de demostración (docs/02-arquitectura.md sección 16). Incluye una segunda página con un origen distinto para verificar que se rechaza un origen no permitido. Crea el seed del tenant de demostración con datos sintéticos.
- GET /public/v1/applications/:trackingId/status con información mínima.

Pruebas: rechazo de orígenes no permitidos, de archivos falsificados (extensión .pdf con otro contenido), de archivos grandes y de envíos sin consentimiento; idempotencia razonable; aislamiento por tenant.

Criterios de aceptación: desde el sitio de pruebas puedo postular a una vacante y a la bolsa general, y ver la postulación y su texto extraído en el panel.

Preséntame el plan antes de codificar.
```

---

## Fase 4 - Preselección: reglas e IA con arnés

```
Fase 4: preselección. Esta es la fase central del producto. Ve despacio.

Lee completo docs/03-ia-y-arnes.md. Es la especificación.

Alcance:
- packages/ai con la interfaz AIProvider y adaptadores para Gemini, Claude y OpenAI. Los nombres de modelo vienen de configuración. Verifica en la documentación vigente de cada proveedor los parámetros antes de implementar. Para pruebas usa un proveedor simulado (mock) determinístico.
- Filtros eliminatorios con reglas (se evalúan primero, también en modo IA).
- Modo "rules": puntaje determinístico sobre los campos estructurados del formulario, con explicaciones generadas desde plantillas.
- Modo "ai": anonimización (sección 6), arnés completo (sección 7: mensaje de sistema versionado, entrada delimitada como no confiable, detección de patrones sospechosos con bandera de riesgo, validación de salida con zod y un reintento, protocolo de error), contrato de salida de la sección 5.
- Cálculo del puntaje total y la recomendación en código con los pesos por categoría y los umbrales de la sección 4. El modelo nunca devuelve el total.
- Avance automático según umbral, con historial (ApplicationStageHistory) marcado como automático y con motivo.
- Control de costos: UsageCounter por tenant, cuota por plan, tope global diario y mensual, límite de tokens por llamada, corte de circuito, registro en AiUsage.
- Cuando la cuota se agota o la IA falla: caída a modo rules o revisión manual, sin perder postulaciones ni descartar.
- Bolsa de talento: prefiltro SQL + puntuación de los mejores N con IA; pestaña "Sugeridos" (solo la API y el modelo de datos en esta fase si la interfaz es muy grande).

Pruebas obligatorias (ver sección 10 del documento):
- Conjunto dorado de 30 CVs sintéticos.
- Prueba de sesgo (mismos datos, distinto nombre y género).
- Pruebas de inyección: CVs con instrucciones explícitas y ocultas que no deben alterar el resultado.
- Fallos: proveedor caído, salida inválida, cuota agotada, tope global.

Criterios de aceptación: una postulación recibida recorre la preselección en ambos modos, queda con puntaje, justificación y recomendación, y el sistema se comporta correctamente ante todos los fallos probados.

Antes de codificar, preséntame el plan y las preguntas que tengas sobre esta fase.
```

---

## Fase 5 - Panel de candidatos y embudo

```
Fase 5: panel de candidatos.

Lee docs/01-producto.md (secciones 2, 4.4 y 4.5).

Alcance:
- Vista de embudo por vacante (columnas por etapa) y vista de lista con filtros y orden por puntaje.
- Ficha del candidato: datos, CV (descarga con URL firmada de corta duración y registro en AuditLog), historial de etapas, puntaje por dimensión, justificaciones y evidencia, banderas de riesgo, campos estructurados.
- Separación clara entre postulaciones a la vacante y bolsa general (y pestaña "Sugeridos").
- Acciones manuales: mover de etapa, revertir un descarte, agregar notas, reabrir candidatos.
- Lista de "No cumple requisitos mínimos" y "Baja compatibilidad" con el motivo, con opción de revertir.
- Los datos personales se muestran solo a quienes tienen permiso según la matriz de roles.

Pruebas: permisos por rol, aislamiento por tenant, reversión de descartes registrada en historial.

Criterios de aceptación: un reclutador puede revisar el embudo de una vacante, entender por qué cada candidato tiene su puntaje y mover candidatos manualmente.

Preséntame el plan antes de codificar.
```

---

## Fase 6 - Entrevistas, agenda y correos

```
Fase 6: entrevistas, agenda y comunicación.

Lee docs/01-producto.md (sección 4.5) y docs/02-arquitectura.md (sección 10).

Alcance:
- EmailProvider con adaptador de Google y CalendarProvider con Google Calendar. Dejar la interfaz lista para Outlook, sin implementarlo. Antes de implementar, revisa los límites de envío y las condiciones vigentes y dime si recomiendas otra opción para correo transaccional.
- EmailTemplate por etapa con variables y vista previa; EmailLog.
- Módulo de entrevistas: fecha, hora, modalidad, lugar o enlace, plataforma, participantes, mensaje previo al candidato, estado. Creación del evento de calendario con enlace de reunión cuando sea virtual.
- Registro de comunicaciones manuales (llamadas y mensajes).
- Configuración de notificación de rechazo: manual (por defecto), automática con retraso, sin notificación.

Pruebas: plantillas con variables, creación y cancelación de entrevistas, aislamiento por tenant, correos que no filtran datos de otros candidatos.

Criterios de aceptación: puedo agendar una entrevista, el candidato recibe el correo con los detalles y el evento aparece en el calendario.

Preséntame el plan antes de codificar.
```

---

## Fase 7 - Evaluación

```
Fase 7: evaluación.

Lee docs/01-producto.md (sección 4.6).

Alcance:
- Examen generalista: plantillas con módulos y preguntas (selección múltiple, verdadero/falso, respuesta corta), tiempo límite y puntaje mínimo.
- Acceso del candidato por enlace firmado de un solo uso con vencimiento; el temporizador se controla en el servidor; protección contra reenvío y reintentos no autorizados.
- Puntaje automático en preguntas cerradas; revisión manual de las abiertas.
- Plantilla de registro para evaluaciones propias de la empresa (descripción, fecha y hora, cómo se realizó, evaluadores, resultado, observaciones).
- Reglas de transición: avance automático según puntaje mínimo, configurable por etapa.
- No incluir ejecución de código en vivo.

Pruebas: expiración y un solo uso del enlace, límite de tiempo, puntajes, transiciones, aislamiento por tenant.

Criterios de aceptación: RRHH crea un examen, el candidato lo responde desde el correo, el puntaje se calcula y la postulación avanza o queda en revisión según la configuración.

Preséntame el plan antes de codificar.
```

---

## Fase 8 - Selección, contratación y API de contratados

```
Fase 8: selección, contratación y seguimiento.

Lee docs/01-producto.md (secciones 4.7 a 4.9) y docs/02-arquitectura.md (sección 8).

Alcance:
- Selección: decisión humana por defecto con comentarios de los evaluadores asignados; interruptor por vacante para selección automática, apagado por defecto, con registro de que la decisión fue automática.
- Manejo de no seleccionados: en espera, notificado o sin notificación, según la configuración del tenant.
- Contratación: confirmación explícita, correo al contratado con plantilla, registro de Hire.
- API de contratados: WebhookEndpoint, evento candidate.hired con carga versionada y firmada HMAC SHA-256 con marca de tiempo, reintentos con espera exponencial, panel de entregas y reenvío, protección contra SSRF al registrar destinos, exportación JSON y CSV.
- Seguimiento: historial completo y métricas básicas (tiempo por etapa, embudo de conversión, origen).
- Sitio de pruebas (apps/demo-site), parte 2: receptor de contratados (POST /webhooks/hired) que valide firma HMAC y marca de tiempo, muestre los eventos recibidos en una página y permita simular errores (respuesta con error, firma inválida) para ejercitar los reintentos. Registrar el endpoint del receptor en el tenant de demostración.

Pruebas: firma y validación del webhook, reintentos, SSRF, selección automática apagada y encendida, aislamiento por tenant.

Criterios de aceptación: al confirmar una contratación, el contratado recibe el correo y el receptor del sitio de pruebas recibe el webhook, valida la firma y lo muestra; los reintentos se ven al simular errores.

Preséntame el plan antes de codificar.
```

---

## Fase 9 - Planes, cuotas y privacidad operativa

```
Fase 9: planes, límites y cumplimiento operativo.

Lee docs/05-planes-y-precios.md y docs/04-seguridad-y-privacidad.md (secciones 8 y 10).

Alcance:
- Plan, Subscription y UsageCounter con los tres planes y sus límites (vacantes activas, postulaciones, usuarios, análisis de IA). Asignación manual de plan por el super administrador. La pasarela de pago queda como interfaz pendiente.
- Aplicación de límites en la API con mensajes claros, avisos al 80 % y comportamiento definido al 100 % (en IA: caer a modo rules).
- Panel de uso para el administrador y para el super administrador.
- Retención: tarea programada que anonimiza o elimina datos vencidos según la configuración del tenant (12 meses por defecto).
- Exportación y eliminación de los datos de un candidato desde el panel.
- Texto del aviso de tratamiento de datos versionado y editable por el super administrador.

Pruebas: límites por plan, retención, exportación, eliminación, aislamiento por tenant.

Criterios de aceptación: un tenant del plan Esencial no puede usar IA y se mantiene dentro de sus límites; uno del plan Profesional consume su cupo de análisis y cae a modo rules al agotarlo.

Preséntame el plan antes de codificar.
```

---

## Fase 10 - Landing comercial del SaaS

```
Fase 10: landing comercial (apps/landing).

Lee docs/01-producto.md sección 7 y docs/02-arquitectura.md sección 15, y docs/05-planes-y-precios.md.

Alcance:
- Landing en español (República Dominicana) con las secciones definidas: propuesta de valor, problema, cómo funciona, funcionalidades, confianza y privacidad, planes y precios, preguntas frecuentes, solicitud de demo y páginas legales (borradores).
- Los planes y precios se leen de la configuración compartida en packages/shared (la misma fuente que usan los límites del panel). No dupliques cifras.
- Formulario de solicitud de demo que envía a POST /public/v1/leads: entidad Lead, captcha, límites de tasa, consentimiento y aviso por correo al operador. Lista de leads con cambio de estado en el panel del super administrador.
- SEO básico (metadatos, sitemap, datos estructurados de organización), rendimiento y diseño adaptable a móvil.
- Un enlace o sección que muestre el sitio de pruebas como demostración en vivo del widget (solo si se despliega un entorno de demostración).
- Sin registro autoservicio ni pago en línea.

Pruebas: validación y límites del formulario, creación de leads, permisos de la lista de leads, pruebas de accesibilidad y rendimiento básicas.

Criterios de aceptación: la landing se construye sin errores, el formulario crea un lead visible para el super administrador y el operador recibe el aviso.

Antes de diseñar, muéstrame la estructura de secciones y el tono del texto para que los apruebe.
```

---

## Después del MVP (backlog)

Página de empleo alojada, Outlook, clave de IA propia por cliente, comités de selección y consenso, verificación de referencias, OCR para PDF escaneados, ejecución de código en pruebas técnicas, segundo factor de autenticación, integraciones específicas con sistemas de nómina, reportes avanzados, internacionalización.
