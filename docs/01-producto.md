# 01 - Producto y alcance

## 0. Qué vamos a construir

| Bloque | Pieza                               | Ubicación                    | Quién la usa                                                        |
| ------ | ----------------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| A      | Landing comercial del SaaS          | `apps/landing`               | Empresas interesadas en contratar el servicio                       |
| B      | Widget / API pública de postulación | `apps/widget` y `/public/v1` | Candidatos, desde la página de empleo del cliente                   |
| B      | Panel administrador                 | `apps/web`                   | RRHH de cada empresa y el operador de la plataforma                 |
| B      | API privada y API de contratados    | `apps/api`                   | El panel, integraciones y sistemas de nómina o RRHH del cliente     |
| C      | Sitio de pruebas (sandbox)          | `apps/demo-site`             | Nosotros: probar el widget y la API de contratados de punta a punta |

El SaaS (bloque B) es el producto. La landing (bloque A) lo vende. El sitio de pruebas (bloque C) permite verificar que el widget y la API de contratados funcionan como los verá un cliente real.

## 1. Visión

Plataforma SaaS que permite a una empresa recibir postulaciones desde su propia página de empleo y gestionarlas en un embudo semiautomático: el sistema filtra, puntúa y sugiere; las personas de RRHH deciden y pueden intervenir en cualquier paso.

Principio rector: automatizar el trabajo repetitivo, nunca ocultar ni imponer decisiones. Cada acción automática es explicable, auditable y reversible.

## 2. Embudo

### 2.1 Vista general

1. Definición de vacante y perfil
2. Búsqueda y captación
3. Preselección
4. Entrevista
5. Evaluación
6. Selección
7. Contratación
8. Seguimiento

### 2.2 Vista técnica (plantilla por defecto)

| Etapa                   | Quién actúa                     | Automatización                                                                                                       |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Postulación (captación) | Candidato vía widget            | Validación, parseo del CV, correo de confirmación                                                                    |
| Preselección            | Sistema (reglas o IA)           | Filtros eliminatorios, puntaje, recomendación, avance automático según umbral                                        |
| Entrevista              | RRHH / Responsable de área      | Plantillas de correo, agenda, enlace de reunión                                                                      |
| Evaluación              | RRHH define; candidato responde | Examen generalista con puntaje automático en preguntas cerradas; registro manual para procesos propios de la empresa |
| Selección               | RRHH / Responsable de área      | Opcional: selección automática por interruptor (apagado por defecto)                                                 |
| Contratación            | RRHH                            | Correo al contratado, webhook de contratados                                                                         |
| Seguimiento             | RRHH                            | Registro del estado final y trazabilidad                                                                             |

Reglas del orden: Entrevista, luego Evaluación, luego Selección, luego Contratación. No existe fase intermedia entre Evaluación y Selección (la cultura de la empresa se valora en la entrevista). La verificación de referencias y antecedentes no entra al MVP; se podrá agregar después como etapa opcional.

### 2.3 Etapas configurables

Las etapas son datos. Cada tenant tiene plantillas de embudo; cada vacante usa una. Una etapa tiene: nombre, tipo (`screening`, `interview`, `assessment`, `selection`, `hiring`, `custom`), orden, configuración propia, y reglas de transición (manual, automática por umbral, automática por resultado de examen). Se debe poder tener, por ejemplo, dos entrevistas o ninguna prueba.

## 3. Roles

| Rol                              | Alcance            | Puede                                                                                            |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| Super administrador (plataforma) | Toda la plataforma | Gestionar tenants, planes, límites, ver métricas de uso. Es el operador del SaaS.                |
| Administrador (empresa)          | Su tenant          | Todo en su empresa: usuarios, configuración, pesos de IA, plantillas, planes, claves del widget. |
| Reclutador                       | Su tenant          | Vacantes, candidatos, entrevistas, evaluaciones, comunicaciones.                                 |
| Responsable de área              | Vacantes asignadas | Revisar candidatos finalistas, calificar, participar en la selección.                            |

Pendiente para fase posterior: comités de selección por vacante (varias personas que votan o califican y se llega a consenso). El modelo de datos debe dejarlo posible (ver `02-arquitectura.md`, entidad de evaluadores por vacante), pero la lógica de consenso no entra en el MVP.

El candidato no es un rol: no tiene cuenta.

## 4. Módulos

### 4.1 Vacantes (definición de vacante y perfil)

El perfil de la persona buscada y la descripción del puesto viven en el mismo registro.

Campos:

- Título, departamento, resumen, responsabilidades, beneficios
- Requisitos obligatorios y deseables
- Skills / etiquetas (para búsqueda y para el cálculo de compatibilidad)
- Categoría de puesto (define el preset de pesos de puntaje): General, Técnico/TI, Operativo/Servicio, Administrativo, Gerencial, Pasantía/Junior
- Nivel de experiencia: pasantía, junior, semi-senior, senior, gerencial
- Años mínimos de experiencia, formación mínima, idiomas requeridos
- Tipo de empleo: tiempo completo, medio tiempo, contrato, temporal, pasantía
- Modalidad: presencial, híbrido, remoto
- Ubicación (provincia y municipio)
- Rango salarial (opcional; se puede mostrar u ocultar)
- Plazas, fecha de publicación, fecha de cierre, estado (borrador, publicada, pausada, cerrada)
- Embudo asignado, responsable de área, reglas eliminatorias, umbrales y pesos (si se sobrescriben)

### 4.2 Búsqueda y captación (página de empleo del cliente)

El widget y la API pública permiten a la empresa mostrar sus vacantes y recibir postulaciones. Búsqueda por texto y filtros, en este orden de prioridad:

1. Palabra clave (título, skills)
2. Ubicación
3. Modalidad (presencial, híbrido, remoto)
4. Tipo de empleo
5. Nivel de experiencia
6. Fecha de publicación
7. Departamento

Hay dos tipos de postulación:

- **A una vacante específica**.
- **General** (bolsa de talento): sin vacante. El CV queda en la base para ser sugerido después.

SEO: la página de empleo de la empresa es del cliente; el widget debe poder renderizar contenido útil para buscadores (ver opciones en `02-arquitectura.md`). Una página de empleo alojada por nosotros queda para una fase posterior.

### 4.3 Formulario de postulación (campos)

Obligatorios: nombre completo, correo, teléfono, ubicación, nivel educativo, años de experiencia, skills (etiquetas), CV (PDF o .docx), aceptación del aviso de tratamiento de datos.
Opcionales: idiomas, modalidad preferida, disponibilidad, enlace de portafolio o perfil profesional.

Estos campos estructurados existen para que el plan sin IA pueda puntuar con reglas determinísticas.

### 4.4 Preselección

Ver `03-ia-y-arnes.md`. Resumen:

- Filtros eliminatorios configurables por vacante.
- Puntaje de 0 a 100 con dimensiones y pesos por defecto según categoría de puesto, ajustables por el administrador.
- Recomendación: avanzar, revisar, baja compatibilidad.
- Plan sin IA: reglas determinísticas. Planes con IA: análisis del CV por modelo, con justificación.
- Sugerencia de candidatos de la bolsa general para vacantes afines (planes con IA).

### 4.5 Entrevista

- Lista de candidatos preseleccionados, separados por tipo (aplicaron a la vacante / bolsa general) y con su puntaje y justificación visibles.
- Comunicación: correo con plantillas editables; registro de llamadas y mensajes manuales.
- Agenda: fecha, hora, modalidad (presencial o virtual), lugar o enlace, plataforma, participantes, y lo que se le enviará al candidato antes de la entrevista.
- Integración de calendario: Google Calendar en el MVP; Outlook después.

### 4.6 Evaluación

Dos modos:

- **Generalista (lo ofrece la plataforma)**: examen con módulos, preguntas (selección múltiple, verdadero/falso, respuesta corta) y tiempo límite. RRHH redacta las preguntas. Puntaje automático en preguntas cerradas; revisión manual en las abiertas. El candidato accede por enlace firmado de un solo uso enviado por correo.
- **Especializado (lo resuelve la empresa)**: la empresa realiza su propia prueba (técnica, de campo, etc.). La plataforma ofrece una plantilla de registro: descripción del proceso, fecha y hora, cómo se realizó, evaluadores, resultado y observaciones.

Fuera del MVP: ejecución de código en vivo (pilas, colas, etc.) que requiere un entorno aislado.

### 4.7 Selección

- Decisión humana por defecto (Responsable de área / RRHH).
- Interruptor por vacante, apagado por defecto: **selección automática**. Si se activa, quien supere el puntaje mínimo del examen pasa a selección con notificación. Contratar sigue requiriendo confirmación en la etapa de contratación salvo que el tenant active también la confirmación automática.
- Para quienes no pasan, la empresa decide qué hacer. Configuración de notificación de rechazo: `manual` (por defecto), `automática con retraso` o `sin notificación`. La empresa puede dejar al candidato "en espera".

### 4.8 Contratación

- Al confirmar la contratación se envía un correo al contratado (plantilla).
- Se dispara el evento `candidate.hired` hacia la **API de contratados** (webhook firmado y exportación JSON/CSV) para alimentar nómina o sistemas de RRHH de la empresa.

### 4.9 Seguimiento

Registro final, historial completo por postulación y métricas básicas: tiempo por etapa, embudo de conversión, fuente de candidatos.

## 5. Fuera del MVP

- Verificación de referencias y antecedentes
- Comités de selección y consenso
- Ejecución de código en pruebas técnicas
- Cuenta o portal del candidato
- Página de empleo alojada por la plataforma
- Integraciones directas con sistemas de nómina específicos (solo webhook y exportación)
- Registro autoservicio y pago en línea desde la landing
- Clave de IA propia por cliente (BYOK)
- Outlook (calendario y correo)
- Reportes avanzados y flujos personalizados complejos (nivel premium, después)
- Internacionalización más allá del español (la arquitectura debe permitirla)

## 6. Registro de decisiones

| #   | Decisión                                                                                     | Estado                               |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | Flujo: Entrevista, Evaluación, Selección, Contratación                                       | Cerrada                              |
| 2   | Sin fase intermedia entre Evaluación y Selección                                             | Cerrada                              |
| 3   | IA solo por API externa, sin PyTorch                                                         | Cerrada                              |
| 4   | Proveedor de IA intercambiable (Gemini, Claude, OpenAI, otros)                               | Cerrada                              |
| 5   | Plan base sin IA, con reglas determinísticas                                                 | Cerrada (interpretación a confirmar) |
| 6   | Tres planes de suscripción mensual                                                           | Cerrada                              |
| 7   | Selección automática: interruptor, apagado por defecto                                       | Cerrada                              |
| 8   | La IA siempre justifica; nada se elimina                                                     | Cerrada                              |
| 9   | Candidato sin cuenta; comunicación por correo                                                | Cerrada                              |
| 10  | Solo PDF y Word para CV                                                                      | Cerrada                              |
| 11  | Anonimización antes de la IA + aviso de tratamiento de datos al candidato                    | Cerrada                              |
| 12  | Backend Node + TypeScript                                                                    | Cerrada                              |
| 13  | Etapas configurables como datos                                                              | Cerrada                              |
| 14  | Verificación de referencias fuera del MVP                                                    | Cerrada                              |
| 15  | Mercado inicial: RD                                                                          | Cerrada                              |
| 16  | Pymes y empresas grandes según plan                                                          | Cerrada                              |
| 17  | Correo: Google primero; Outlook opcional después; evaluar precios                            | Abierta (precios)                    |
| 18  | Evaluación MVP: examen generalista + plantilla de registro                                   | Cerrada                              |
| 19  | Puntaje, pesos y umbrales: definidos en `03-ia-y-arnes.md`                                   | Propuesta, a validar                 |
| 20  | Precios: propuesta en `05-planes-y-precios.md`                                               | Propuesta, a validar                 |
| 21  | Nombre del producto, dominio, hosting, pasarela de pago                                      | Pendiente                            |
| 22  | Alcance: landing comercial + SaaS (widget/API, panel, API de contratados) + sitio de pruebas | Cerrada                              |
| 23  | Alta de clientes por solicitud de demo, creación del tenant por el super administrador       | Propuesta, a validar                 |
| 24  | API con Fastify (Fase 0)                                                                     | Propuesta, a confirmar               |
| 25  | UI: lucide-react, sin emojis, animación con CSS, Tailwind 4                                  | Cerrada                              |

## 7. Landing comercial del SaaS (Bloque A)

Objetivo: presentar el producto y captar clientes. Español de República Dominicana.

Secciones:

1. Encabezado con propuesta de valor y llamada a la acción "Solicitar demo".
2. El problema: recibir muchos CV y perder tiempo filtrando.
3. Cómo funciona: del formulario en tu página de empleo al candidato contratado (el embudo en pasos).
4. Funcionalidades clave: widget en tu página, preselección automática con justificación, entrevistas y agenda, evaluaciones, selección y contratación, API de contratados.
5. Confianza y privacidad: la IA explica cada decisión, el equipo siempre puede intervenir, tratamiento de datos.
6. Planes y precios (de `05-planes-y-precios.md`, con los valores confirmados).
7. Preguntas frecuentes.
8. Formulario de solicitud de demo.
9. Páginas legales: política de privacidad y términos (borradores a revisar con un abogado).

Requisitos:

- SEO básico (metadatos, sitemap, datos estructurados de organización), buen rendimiento y diseño adaptable a móvil.
- Formulario de solicitud de demo que envía a `POST /public/v1/leads` (nombre, empresa, correo, teléfono, tamaño, mensaje), con captcha, límites de tasa y consentimiento. Los leads se ven en el panel del super administrador y generan un aviso por correo al operador.
- Sin registro autoservicio ni cobro en línea en el MVP.
- Los textos de planes se alimentan de una sola fuente (configuración), para no duplicar precios.

## 8. Sitio de pruebas (Bloque C)

Objetivo: simular a una empresa cliente para probar de punta a punta, sin depender de terceros.

Contiene:

1. **Página de empleo ficticia** ("Empresa Demo"): incrusta el widget con una clave pública de un tenant de demostración. Permite listar y buscar vacantes, postular a una vacante y postular a la bolsa general.
2. **Receptor de contratados**: un endpoint y una página que reciben el webhook `candidate.hired`, validan la firma HMAC y la marca de tiempo, y muestran los eventos recibidos (carga, cabeceras, resultado de la validación, intentos). Sirve de ejemplo de referencia para que los clientes implementen su propio receptor.
3. **Controles de prueba**: botones para simular errores del receptor (responder con error para probar reintentos, firma inválida) y para disparar un evento de contratación de ejemplo.

Reglas:

- Solo para desarrollo, pruebas y demostraciones comerciales; no es un producto ni se vende.
- Usa un tenant de demostración con datos sintéticos; nunca datos reales.
- Su código sirve además como documentación viva de cómo integrar el widget y la API de contratados.
