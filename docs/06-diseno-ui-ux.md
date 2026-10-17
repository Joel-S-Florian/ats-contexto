# 06 - Diseño UI/UX y movimiento

Aplica al panel (`apps/web`), la landing y el widget. Los tokens viven en `packages/shared/src/tokens.css` (fuente única).

## Principios

- Herramienta de trabajo diario de RRHH: sobria, densidad cómoda, jerarquía clara. El color de acento se reserva para acción y estado.
- Sin emojis en ninguna parte. Iconos de `lucide-react` (trazo 1.5-2, tamaño 16-18 en UI, 20+ en cabeceras).
- Texto en español (RD). Estados siempre completos: cargando (skeleton), vacío, error y éxito.
- Accesibilidad: contraste AA, foco visible (`:focus-visible`), `aria-current` en navegación, objetivos táctiles de al menos 36 px.
- Modo claro y oscuro con `data-theme` en `<html>`; el tema se aplica antes de pintar para evitar parpadeo.

## Tokens

Color (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent*`, `--success`, `--warning`, `--danger` y variantes `-soft`), radios (`--radius-sm/--radius/--radius-lg`), sombras, tipografía Inter.

## Movimiento

Guía: skill `emil-design-eng` (instalada desde `emilkowalski/skill`).

| Elemento                                                 | Duración | Curva                                       |
| -------------------------------------------------------- | -------- | ------------------------------------------- |
| Feedback de pulsación (`.press`: scale 0.97)             | 140 ms   | `--ease-out` cubic-bezier(0.23, 1, 0.32, 1) |
| Hover, color, sombra                                     | 200 ms   | `--ease-out` / ease                         |
| Entrada de listas y tarjetas (`.rise`, escalonado 50 ms) | 320 ms   | `--ease-out`                                |
| Skeleton (shimmer)                                       | 1.4 s    | linear                                      |

Reglas:

- Solo `transform` y `opacity`; nunca `transition: all`; nunca `ease-in`; nada nace de `scale(0)`.
- Acciones de teclado y las que se repiten cientos de veces al día no se animan.
- Hover solo con `@media (hover: hover) and (pointer: fine)`.
- `prefers-reduced-motion`: los tokens de duración bajan a 1 ms y se anulan las animaciones de entrada y shimmer.
- Preferir transiciones CSS (interrumpibles) sobre keyframes para estados que cambian rápido. Los keyframes se usan solo para entradas únicas.
- Menos de 300 ms para UI; los popovers escalan desde su disparador, los modales desde el centro.

## Componentes base (Fase 0)

Barra lateral con navegación y cambio de tema, tarjeta de estado con skeleton, tarjetas de etapa con elevación en hover. Se amplía por fase: botones, formularios, tablas, toasts (Sonner), tablero de embudo.

## Revisión visual (Fase 4)

- Paleta indigo-violeta con degradado de marca (`--gradient`), superficies con matiz frío y sombras en capas; el modo oscuro usa los mismos roles de color con más luminosidad en el acento.
- Profundidad: barra lateral translúcida (`.glass`), fondo con resplandor suave, botón primario con brillo interior y halo al pasar el cursor.
- Movimiento nuevo: anillo de puntaje que se dibuja (`stroke-dashoffset`), barras de dimensión que crecen escalonadas, contadores del resumen con `CountUp`, indicador lateral de navegación. Todo se desactiva con `prefers-reduced-motion`.
- El puntaje siempre muestra su "por qué": dimensiones, justificaciones, evidencia y banderas de riesgo (texto plano, nunca HTML).
