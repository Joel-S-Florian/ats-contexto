# 05 - Planes y precios

Todo lo de este documento es una propuesta de partida, no un dato validado. Las cifras de costo de IA son estimaciones que deben medirse con CVs reales, y los precios de venta deben contrastarse con empresas dominicanas y con los precios vigentes de la competencia antes de publicarse.

## 1. Modelo

- Suscripción mensual por niveles (decisión tomada).
- Tres planes. El plan de entrada no incluye IA.
- Cobro en pesos dominicanos (DOP), calculado a partir de una referencia en USD. Descuento por pago anual.
- Los límites se miden por mes calendario: vacantes activas, postulaciones recibidas, usuarios y análisis de IA.

## 2. Planes propuestos

|                                  | Esencial                             | Profesional          | Empresa                      |
| -------------------------------- | ------------------------------------ | -------------------- | ---------------------------- |
| Público                          | Pymes pequeñas                       | Pymes en crecimiento | Empresas grandes             |
| Precio de referencia             | US$ 25 / mes                         | US$ 79 / mes         | US$ 199 / mes                |
| Vacantes activas                 | 3                                    | 15                   | Ilimitadas                   |
| Postulaciones por mes            | 100                                  | 500                  | 2,000                        |
| Usuarios                         | 2                                    | 5                    | 15                           |
| Widget y página de empleo        | Si                                   | Si                   | Si                           |
| Preselección                     | Reglas (sin IA)                      | IA con justificación | IA con justificación         |
| Análisis de IA incluidos por mes | 0                                    | 300                  | 1,500                        |
| Bolsa de talento con sugerencias | Prefiltro por etiquetas              | Sugerencias con IA   | Sugerencias con IA           |
| Embudo configurable              | Plantilla fija con etapas activables | Si                   | Si, con varias plantillas    |
| Entrevistas, agenda y correos    | Si                                   | Si                   | Si                           |
| Exámenes generalistas            | Hasta 1 plantilla                    | Si                   | Si                           |
| API de contratados               | No (solo exportación)                | Webhook              | Webhook y múltiples destinos |
| Reportes                         | Básicos                              | Básicos              | Avanzados                    |
| Soporte                          | Correo                               | Correo               | Prioritario                  |

Excedentes (opcional): análisis de IA adicionales a un precio fijo por bloque (por ejemplo, bloques de 100). Postulaciones adicionales: paso al plan siguiente o bloque adicional.

Plan Corporativo a medida: para volúmenes mayores, más usuarios, integraciones específicas o requisitos de seguridad. Se cotiza aparte.

## 3. Por qué estas cifras

- El plan Esencial debe ser accesible para una pyme y no genera costo de IA, así que su margen es alto y sirve de puerta de entrada.
- El plan Profesional es el principal: incluye IA con un cupo generoso para una pyme.
- El plan Empresa cubre volumen y características de equipo grande.
- La separación entre planes con y sin IA protege el margen: el costo variable de la IA solo aparece donde se cobra por ella.

## 4. Costo de la IA (estimación a medir)

Para estimar el costo por análisis:

```
costo_por_analisis = (tokens_entrada / 1_000_000) * precio_entrada + (tokens_salida / 1_000_000) * precio_salida
```

Supuestos de partida para un CV típico (a verificar):

- Entrada: aproximadamente 3,000 a 5,000 tokens (CV anonimizado + vacante + instrucciones).
- Salida: aproximadamente 500 a 900 tokens (JSON con justificaciones).

Con un modelo de nivel económico, el costo por análisis suele quedar en centavos de dólar o menos. Procedimiento:

1. Elegir el modelo por nivel y consultar sus precios vigentes en la documentación del proveedor.
2. Medir tokens reales con 50 CVs de prueba.
3. Calcular el costo por análisis y el costo mensual a cupo completo de cada plan.
4. Verificar que el margen bruto del plan con IA se mantenga por encima de la meta (sugerencia: al menos 70 %).
5. Ajustar cupos o precios si no se cumple.

Palancas para reducir costo: prefiltro por SQL antes de la IA, modelo económico para extracción y modelo más fuerte solo para la valoración final, caché de resultados por documento y vacante, límite de tokens por llamada.

## 5. Medición y límites en el sistema

- `UsageCounter` por tenant y mes: vacantes activas, postulaciones, usuarios, análisis de IA.
- Al llegar al 80 %: aviso al administrador.
- Al llegar al 100 % de análisis de IA: el sistema pasa a modo `rules` (no se pierde ninguna postulación) y ofrece comprar un bloque o cambiar de plan.
- Tope global de gasto de IA a nivel de plataforma (ver `03-ia-y-arnes.md`, sección 7.6).

## 6. Cobros

Pasarela de pago pendiente de decisión. Opciones a evaluar: procesadores locales de República Dominicana y pasarelas internacionales, considerando comisiones, cobro recurrente, facturación con comprobantes fiscales y la moneda de cobro. Hasta decidirla, el MVP puede operar con planes asignados manualmente por el super administrador.

## 7. Validación recomendada antes de lanzar

1. Entrevistar a 5 empresas dominicanas (pymes y una grande) sobre cuánto pagan hoy o pagarían.
2. Comparar con sistemas de reclutamiento que operen en la región.
3. Probar el plan Esencial gratis por un periodo corto con 2 o 3 empresas piloto.
4. Medir el costo real de IA con los pilotos y ajustar.
