# 02 - Arquitectura técnica

## 1. Stack

| Capa                | Tecnología                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Panel administrador | Next.js (App Router) + TypeScript + Tailwind CSS                                                          |
| Landing comercial   | Next.js (generación estática) + Tailwind CSS                                                              |
| Sitio de pruebas    | Next.js o página estática + servidor mínimo para el receptor de webhooks                                  |
| API                 | Node.js + TypeScript (Fastify o NestJS; elegir uno en la Fase 0 y documentarlo)                           |
| Base de datos       | PostgreSQL + Prisma ORM                                                                                   |
| Colas y trabajos    | Redis + BullMQ                                                                                            |
| Archivos            | Almacenamiento compatible con S3 (bucket privado)                                                         |
| Validación          | zod en todos los bordes                                                                                   |
| Widget              | TypeScript compilado a un bundle único, sin dependencias pesadas (Preact o JavaScript puro)               |
| Pruebas             | Vitest o Jest; Playwright para flujos críticos                                                            |
| Desarrollo local    | docker-compose (PostgreSQL, Redis, almacenamiento local compatible con S3, servidor de correo de pruebas) |

## 2. Multi-tenencia

- Una sola base de datos, esquema compartido.
- Toda tabla de negocio tiene `tenant_id` no nulo.
- Capa de acceso a datos obligatoria que inyecta el tenant en cada consulta (no se permiten consultas Prisma "crudas" sin pasar por ella).
- Row Level Security en PostgreSQL activada: cada transacción fija `app.tenant_id` y las políticas comparan contra ella. Es defensa en profundidad, no sustituye el filtrado en código.
- Pruebas automáticas de aislamiento: por cada recurso, un usuario del tenant A no puede leer ni modificar datos del tenant B.
- Operaciones del super administrador pasan por un camino separado y auditado.

## 3. Modelo de datos (entidades principales)

Esto es un punto de partida; el esquema exacto lo define Claude Code en la Fase 1 a partir de estos requisitos.

- **Tenant**: empresa cliente. Plan, estado, configuración (retención, umbrales, notificación de rechazo, proveedor de correo).
- **User** y **Membership**: usuario con rol dentro de un tenant.
- **Vacancy**: campos de `01-producto.md` sección 4.1. Relación con Pipeline.
- **VacancySkill**: etiquetas con tipo (obligatoria, deseable).
- **VacancyEvaluator**: personas asignadas a una vacante (Responsable de área, evaluadores). Deja listo el comité futuro.
- **Pipeline** y **PipelineStage**: plantillas de embudo por tenant. Etapa con tipo, orden, configuración JSON y reglas de transición.
- **Candidate**: persona dentro de un tenant. Correo único por tenant. Datos de contacto y campos estructurados.
- **Application**: candidato + vacante (vacante nula = bolsa general). Etapa actual, estado, origen.
- **ApplicationStageHistory**: historial de movimientos (de, a, quién, automático o manual, motivo, fecha).
- **Document**: CV (y otros). Ruta en almacenamiento, tipo, tamaño, hash, estado de escaneo, texto extraído.
- **ScreeningResult**: modo (`rules` o `ai`), puntaje total, puntajes por dimensión, justificaciones, recomendación, banderas eliminatorias, confianza, modelo, versión de prompt, versión de pesos.
- **Interview**: fecha y hora, modalidad, lugar o enlace, plataforma, participantes, estado, mensaje previo.
- **AssessmentTemplate**, **AssessmentModule**, **Question**: examen generalista.
- **AssessmentAttempt**: intento del candidato (enlace firmado de un solo uso, inicio, fin, respuestas, puntaje).
- **ExternalAssessmentRecord**: plantilla de registro para procesos propios de la empresa (descripción, fecha y hora, cómo se realizó, evaluadores, resultado, observaciones).
- **SelectionDecision**: decisión, quién, si fue automática, motivo.
- **Hire**: contratación confirmada y datos entregados al exterior.
- **EmailTemplate** y **EmailLog**: plantillas por etapa y registro de envíos (sin cuerpos con datos sensibles en logs generales).
- **ApiKey**: clave pública del widget (`pk_...`) con orígenes permitidos; clave secreta de servidor (`sk_...`) para la API privada. Solo se guarda el hash de la secreta.
- **WebhookEndpoint** y **WebhookDelivery**: destino, secreto de firma, intentos y estado.
- **ConsentRecord**: versión del aviso aceptado, fecha, IP truncada.
- **AiUsage**: proveedor, modelo, tokens de entrada y salida, costo estimado, latencia, tenant, resultado.
- **AuditLog**: acciones sensibles (acceso a CV, cambios de configuración, descartes, exportaciones).
- **Plan**, **Subscription**, **UsageCounter**: planes, límites y consumo mensual.
- **Lead**: solicitud de demo captada en la landing (a nivel de plataforma, no pertenece a un tenant).

## 4. Estados de una postulación

`received` -> `screening` -> (`shortlisted` | `in_review` | `low_fit` | `knocked_out`) -> `interview` -> `assessment` -> `selection` -> (`selected` | `not_selected` | `on_hold`) -> `hired` | `withdrawn`

Además existe el estado de procesamiento: `analysis_pending`, `analysis_failed`. Una postulación con `analysis_failed` va siempre a revisión manual y nunca se descarta por el fallo.

Todo cambio queda en `ApplicationStageHistory`.

## 5. Flujo de ingestión de una postulación

1. El widget envía el formulario a `POST /public/v1/applications` con la clave pública del tenant.
2. La API valida: clave y origen permitidos, captcha, límites de tasa, esquema zod, tipo real del archivo (por firma, no solo extensión), tamaño máximo (5 MB), aceptación del aviso de datos.
3. Se guarda el archivo en el bucket privado y se crea `Candidate`, `Application`, `Document`, `ConsentRecord`.
4. Se encola el trabajo de procesamiento y se responde 202 con un identificador de seguimiento.
5. Trabajo asíncrono: escaneo de antivirus, extracción de texto (PDF y .docx), preselección (reglas o IA según plan), cálculo de puntaje, decisión de avance según umbrales, registro de historial.
6. Se envía correo de confirmación al candidato.
7. Si la postulación no es a una vacante concreta, entra a la bolsa general.

PDF escaneados sin texto: en el MVP se marcan como `no legible` y pasan a revisión manual. OCR queda para después.

## 6. Widget y API pública

### 6.1 Integración en la página del cliente

Opción principal: un script con una clave pública.

```html
<script src="https://cdn.tudominio.com/widget.js" data-key="pk_live_xxx" data-mode="jobs"></script>
<div id="careers-widget"></div>
```

El widget se renderiza dentro de Shadow DOM (para no chocar con los estilos del cliente) y se comunica con la API pública. Modos: listado de vacantes con buscador y filtros, detalle de vacante con formulario, y formulario general.

SEO: para que Google indexe las vacantes, ofrecer además un endpoint de datos estructurados (JSON-LD `JobPosting`) que la empresa pueda incrustar, y dejar la página alojada por nosotros como opción futura.

### 6.2 Endpoints públicos (prefijo `/public/v1`)

- `GET /jobs` con filtros: texto, ubicación, modalidad, tipo de empleo, nivel, fecha, departamento, paginación.
- `GET /jobs/:id`
- `POST /applications` (multipart)
- `GET /applications/:trackingId/status` (estado mínimo, sin datos personales)
- `POST /leads` (solicitud de demo desde la landing comercial; ver sección 15)

### 6.3 Seguridad del widget

Ver `04-seguridad-y-privacidad.md`: clave pública por tenant, orígenes permitidos, CORS estricto, captcha, límites de tasa, validación de archivos, aviso de datos.

## 7. API privada (panel)

REST autenticada por sesión (panel) o clave secreta (integraciones). Agrupada por módulo: vacantes, candidatos, postulaciones, etapas, entrevistas, evaluaciones, decisiones, plantillas de correo, usuarios, configuración, uso y facturación. Documentar con OpenAPI generado desde los esquemas zod.

## 8. API de contratados (webhooks)

- Evento `candidate.hired` con carga JSON versionada (`schema_version`): datos del contratado, puesto, vacante, fecha, referencia interna.
- Firma HMAC SHA-256 con marca de tiempo en cabeceras; el receptor valida firma y tolerancia de tiempo.
- Reintentos con espera exponencial; panel para ver entregas y reenviar.
- Exportación manual en JSON y CSV.
- Cada sistema de nómina será una integración posterior; el MVP solo entrega el webhook y la exportación.

## 9. Capa de IA

Paquete `packages/ai`. Contrato único de proveedor con adaptadores para Gemini, Claude y OpenAI, y espacio para otros. Detalle completo en `03-ia-y-arnes.md`. La plataforma elige el proveedor y modelo por configuración; el código de negocio nunca importa un SDK de proveedor directamente.

## 10. Correo y calendario

- Interfaz `EmailProvider` con adaptador de Google primero. Antes de comprometerse hay que revisar límites diarios de envío y precios del proveedor elegido; si el volumen lo requiere, cambiar a un servicio transaccional sin tocar el código de negocio.
- Interfaz `CalendarProvider`: Google Calendar en el MVP, Outlook (Microsoft Graph) después.
- Plantillas por etapa, con variables (nombre, vacante, fecha, enlace) y vista previa.
- Los enlaces para candidatos (examen, confirmaciones) son firmados, de un solo uso y con vencimiento.

## 11. Estructura de monorepo

```
apps/api        rutas, servicios, colas, webhooks
apps/web        panel administrador Next.js
apps/widget     script embebible
apps/landing    landing comercial del SaaS
apps/demo-site  sitio de pruebas (página de empleo ficticia + receptor de contratados)
packages/shared tipos y esquemas zod
packages/ai     proveedores, arnés, anonimización, scoring
packages/db     Prisma, migraciones, seeds, políticas RLS
docs/           documentación
```

## 12. Configuración y entorno

Variables validadas con zod al arrancar (falla rápido si falta algo): base de datos, Redis, almacenamiento, secretos de sesión y firma, claves de proveedores de IA, topes de gasto, credenciales de correo, clave del captcha, dominio del widget.

## 13. Observabilidad

Logs estructurados sin datos personales, identificador de correlación por solicitud, métricas de colas y de consumo de IA, alertas al 80 % de cuota y al activarse el tope global.

## 14. Despliegue (pendiente de decisión)

Por defecto se asume contenedores Docker. Hosting (VPS o nube administrada), dominio y CDN para el widget están por definir. Mantener la aplicación sin dependencias de un proveedor específico.

## 15. Landing comercial (apps/landing)

- Next.js con generación estática; contenido en español y textos separados en archivos de contenido para facilitar i18n futuro.
- Los planes y precios se leen de un único archivo de configuración compartido (`packages/shared`), el mismo que usa el panel para los límites.
- Formulario de demo: `POST /public/v1/leads` en la API. Entidad **Lead** (nombre, empresa, correo, teléfono, tamaño, mensaje, origen, estado). Captcha, límites de tasa, consentimiento y aviso por correo al operador.
- Panel del super administrador: lista de leads y cambio de estado (nuevo, contactado, demo agendada, convertido, descartado).
- No comparte base de código de UI con el panel salvo tokens de diseño; es un sitio independiente que solo habla con la API pública.

## 16. Sitio de pruebas (apps/demo-site)

- **Página de empleo ficticia**: incrusta el widget con `data-key` de un tenant de demostración. Se puede probar el listado con filtros, la postulación a una vacante y la postulación general, y además el comportamiento ante orígenes no permitidos (ofrecer una segunda página con un origen distinto para verificar el rechazo).
- **Receptor de contratados**: ruta `POST /webhooks/hired` que verifica la firma HMAC SHA-256 y la tolerancia de tiempo con el secreto del endpoint de demostración, guarda los eventos en memoria o en un archivo local y los muestra en una página. Debe poder responder de forma controlada con errores para ejercitar los reintentos.
- **Tenant de demostración**: seed con una empresa ficticia, vacantes de ejemplo de varias categorías, un embudo configurado, claves de widget y un endpoint de webhook apuntando al receptor. Todo con datos sintéticos.
- Solo corre en desarrollo y en entornos de demostración. Nunca se conecta a datos reales.
- Sirve como prueba de integración de punta a punta: postulación por el widget, preselección, avance por el embudo y webhook de contratado recibido y verificado.
