# Plataforma de Reclutamiento (ATS SaaS) - Contexto para Claude Code

Nombre del producto: provisional, pendiente de definir.
Idioma del producto, del código de dominio y de los textos: español (República Dominicana). Identificadores de código en inglés.

## Qué es

SaaS B2B de reclutamiento. Es un ATS (Applicant Tracking System) dentro de un sistema más amplio que cubre todo el embudo de contratación: vacantes, captación desde la página de empleo del cliente, preselección automática, entrevistas, evaluación, selección, contratación y seguimiento.

El diferenciador es el embudo automatizado: el sistema filtra y puntúa candidatos para que RRHH solo dedique tiempo a los mejores, pero siempre con intervención humana posible y con justificación de cada decisión automática.

## Qué vamos a construir (entregables del proyecto)

El proyecto tiene cinco piezas, agrupadas en tres bloques:

**Bloque A - Landing comercial del SaaS** (`apps/landing`)
Sitio de marketing del producto: explica qué es, cómo funciona, muestra los planes y capta interesados (solicitud de demo). No es parte del SaaS en sí; es la vitrina para vender el SaaS.

**Bloque B - El SaaS** (lo que usan las empresas clientes)

1. **Widget / API pública de postulación** (`apps/widget` + rutas `/public/v1` de `apps/api`)
2. **Panel administrador** (`apps/web`)
3. **API** privada (`apps/api`) y **API de contratados** (webhooks y exportación)

**Bloque C - Sitio de pruebas (sandbox)** (`apps/demo-site`)
Una "página de empleo" de una empresa ficticia que incrusta el widget y una página **receptora de contratados** que recibe y valida los webhooks firmados. Sirve para probar el widget y la API de contratados de punta a punta sin depender de una empresa real. Es solo para desarrollo, demostraciones y pruebas; no se despliega como producto.

Prioridad de construcción: primero el Bloque B (con el Bloque C creciendo junto a él, porque lo necesita para probarse), y la landing del Bloque A al final del MVP. Ver `prompts/PROMPTS.md`.

### Las tres superficies del SaaS

1. **Widget / API pública de postulación**: formulario embebible en la página "Trabaja con nosotros" de la empresa cliente. Recibe datos y CV (PDF o Word) y los envía a nuestra API sin que el candidato salga del sitio del cliente.
2. **Panel administrativo (Next.js)**: lo usa el equipo de RRHH de cada empresa para gestionar vacantes, candidatos, entrevistas, evaluaciones y selección.
3. **API de contratados**: webhooks firmados y exportación que envían al candidato contratado hacia la nómina o el sistema de RRHH de la empresa.

El candidato NO es usuario del sistema. No tiene cuenta. Se comunica solo por correo (enlaces firmados de un solo uso para exámenes, confirmaciones, etc.).

## Flujo del embudo (plantilla por defecto)

Postulación -> Preselección (aquí vive la IA) -> Entrevista -> Evaluación -> Selección -> Contratación -> Seguimiento.

Orden fijado por el dueño del producto: Entrevista, luego Evaluación, luego Selección, luego Contratación. No hay fase intermedia entre Evaluación y Selección. La verificación de referencias queda FUERA del MVP.

Las etapas son datos, no código: cada empresa/vacante puede tener su propio embudo (con o sin pruebas, una o dos entrevistas, etc.). Ver `docs/02-arquitectura.md`.

## Decisiones cerradas

| Tema                        | Decisión                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Mercado inicial             | Solo República Dominicana, en español. Arquitectura lista para i18n.                                                   |
| Clientes                    | Pymes y empresas grandes, diferenciados por plan.                                                                      |
| Multi-tenencia              | Obligatoria desde el día uno.                                                                                          |
| Backend                     | Node.js + TypeScript.                                                                                                  |
| Frontend                    | Next.js + TypeScript + Tailwind CSS.                                                                                   |
| Base de datos               | PostgreSQL + Prisma.                                                                                                   |
| IA                          | Solo por API externa, nunca modelos propios. Proveedor intercambiable (Gemini, Claude, OpenAI, otros).                 |
| Plan base                   | Sin IA. Preselección por reglas determinísticas.                                                                       |
| Planes                      | Tres niveles, suscripción mensual.                                                                                     |
| Selección automática        | Interruptor por vacante, apagado por defecto.                                                                          |
| Descartes                   | La IA siempre entrega el motivo. Nada se borra; todo descarte es visible y reversible.                                 |
| CV                          | Solo PDF y Word (.docx).                                                                                               |
| Anonimización               | Se anonimiza el CV antes de enviarlo a la IA, y se informa al candidato que sus datos serán procesados.                |
| Evaluación MVP              | Examen generalista. Las empresas con proceso propio registran el resultado mediante una plantilla.                     |
| Correo                      | Proveedor de correo detrás de una interfaz; Google primero, Outlook después.                                           |
| Verificación de referencias | Fuera del MVP.                                                                                                         |
| Landing comercial           | Dentro del alcance: se construye al final del MVP en `apps/landing`.                                                   |
| Sitio de pruebas            | Dentro del alcance: `apps/demo-site` con página de empleo ficticia y receptor de contratados. Solo desarrollo y demos. |
| Alta de clientes            | Sin registro autoservicio en el MVP: la landing capta solicitudes de demo y el super administrador crea el tenant.     |

## Estructura prevista del repositorio (monorepo pnpm)

```
apps/
  api/        API Node + TypeScript (REST), colas, webhooks
  web/        Panel administrador (Next.js)
  widget/     Script embebible de postulación (bundle ligero, sin dependencias pesadas)
  landing/    Landing comercial del SaaS (Next.js, mayormente estática)
  demo-site/  Sitio de pruebas: página de empleo ficticia con el widget + receptor de contratados
packages/
  shared/     Tipos, esquemas zod, constantes compartidas
  ai/         Capa de IA: proveedores, arnés, anonimización, scoring
  db/         Prisma schema, migraciones, seeds
docs/         Documentación de producto y arquitectura
```

## Reglas no negociables

1. **Aislamiento por tenant**: toda tabla de negocio lleva `tenant_id`. Toda consulta se filtra por tenant. Además se aplica Row Level Security en PostgreSQL como defensa en profundidad. Ningún endpoint devuelve datos de otro tenant.
2. **La IA no decide en silencio**: cada puntaje y cada recomendación llevan justificación legible. La IA nunca contrata ni elimina datos. Si la IA falla, el candidato pasa a revisión manual, nunca se descarta.
3. **El contenido del CV es dato no confiable**: se trata siempre como entrada potencialmente hostil (inyección de prompts). Ver `docs/03-ia-y-arnes.md`.
4. **El puntaje total lo calcula el código**, no el modelo. El modelo devuelve puntajes por dimensión y justificaciones; el servidor aplica los pesos.
5. **Sin datos personales en logs**. Los logs y las trazas de IA no guardan nombre, correo, teléfono ni el texto completo del CV.
6. **Costos de IA acotados**: cuota por tenant según plan, tope global duro, límite de tokens por llamada. Ver `docs/03-ia-y-arnes.md`.
7. **Todo cambio de estado de una postulación queda en historial** (quién, cuándo, por qué, si fue automático).
8. **Nada de secretos en el repo**. Variables de entorno validadas con zod al arrancar.

## Cómo trabajar en este repo

- Antes de escribir código en una fase, presenta un plan breve y espera confirmación.
- Trabaja por fases, en el orden de `prompts/PROMPTS.md`. No adelantes fases.
- Cada fase termina con pruebas pasando y con criterios de aceptación verificados.
- Prefiere cambios pequeños y revisables. Un commit por unidad lógica.
- Tests: unitarios para lógica de dominio (scoring, reglas, estados), de integración para la API, y casos de aislamiento entre tenants en cada módulo nuevo.
- Estilo: TypeScript estricto, zod en los bordes (entrada de API, salida de IA, variables de entorno), sin `any`.
- Si algo del contexto es ambiguo o contradictorio, pregunta antes de asumir y registra la decisión en `docs/01-producto.md` (sección de decisiones).

## Documentos de referencia

- `docs/01-producto.md`: alcance, roles, módulos, campos y decisiones.
- `docs/02-arquitectura.md`: arquitectura técnica, modelo de datos, widget, colas, integraciones.
- `docs/03-ia-y-arnes.md`: scoring, anonimización y arnés de seguridad de la IA.
- `docs/04-seguridad-y-privacidad.md`: seguridad, privacidad y retención de datos.
- `docs/05-planes-y-precios.md`: planes, cuotas y propuesta de precios.
- `docs/06-diseno-ui-ux.md`: sistema de diseño, iconografía y movimiento.
- `prompts/PROMPTS.md`: prompts por fases para desarrollar el sistema.

La landing comercial y el sitio de pruebas están especificados en `docs/01-producto.md` (secciones 7 y 8) y `docs/02-arquitectura.md` (secciones 15 y 16).

## Suposiciones activas (confirmar con el dueño del producto)

- Cuando se dijo "el plan no incluye IA, por ejemplo el gratis", se entendió que el plan de entrada no usa IA y clasifica con reglas determinísticas sobre campos estructurados del formulario.
- La clave del proveedor de IA es de la plataforma. Que cada cliente aporte su propia clave (BYOK) queda como opción futura, no en el MVP.
- Retención de datos de candidatos por defecto: 12 meses, configurable por tenant.
- La landing no tiene registro autoservicio ni pago en línea en el MVP; solo solicitud de demo.
- Pasarela de pago, dominio, hosting y nombre del producto: pendientes de definir.
