# 04 - Seguridad y privacidad

Este documento es una guía técnica de diseño, no asesoría legal. Antes de comercializar, revisar con un abogado la Ley 172-13 de protección de datos personales de República Dominicana y cualquier normativa aplicable a decisiones automatizadas en procesos de empleo.

## 1. Autenticación y sesiones

- Correo y contraseña con hash Argon2id.
- Sesiones con cookies `HttpOnly`, `Secure`, `SameSite`; rotación al iniciar sesión.
- Bloqueo progresivo ante intentos fallidos; recuperación de contraseña con enlace de un solo uso y vencimiento corto.
- Segundo factor (TOTP): previsto, después del MVP.

## 2. Autorización (RBAC)

Cada endpoint verifica autenticación, tenant y rol. Matriz base:

| Acción                                       | Super admin | Admin | Reclutador | Resp. de área                |
| -------------------------------------------- | ----------- | ----- | ---------- | ---------------------------- |
| Gestionar tenants y planes                   | Si          | No    | No         | No                           |
| Usuarios, configuración, claves, pesos de IA | No          | Si    | No         | No                           |
| Crear y editar vacantes                      | No          | Si    | Si         | Solo las asignadas (lectura) |
| Ver y mover candidatos                       | No          | Si    | Si         | Solo vacantes asignadas      |
| Ver CV y datos personales                    | No          | Si    | Si         | Solo vacantes asignadas      |
| Programar entrevistas y comunicaciones       | No          | Si    | Si         | Limitado                     |
| Crear exámenes                               | No          | Si    | Si         | No                           |
| Calificar y opinar en selección              | No          | Si    | Si         | Si                           |
| Confirmar contratación                       | No          | Si    | Si         | No                           |
| Exportar datos                               | No          | Si    | Si         | No                           |

El super administrador no ve datos de candidatos de los tenants; solo métricas de uso. Cualquier acceso excepcional (soporte) queda auditado y requiere permiso explícito del tenant.

## 3. Aislamiento entre tenants

Ver `02-arquitectura.md` sección 2. `tenant_id` en todas las tablas, capa de acceso obligatoria, Row Level Security y pruebas de aislamiento automatizadas.

## 4. Widget y API pública

- Clave pública `pk_` por tenant, que identifica pero no autoriza datos sensibles; clave secreta `sk_` solo para servidor, guardada como hash.
- Lista de orígenes permitidos por clave pública; se verifica `Origin` y se configura CORS estricto.
- Captcha (por ejemplo Cloudflare Turnstile u opción equivalente) en el envío del formulario.
- Límites de tasa por IP, por clave y por tenant.
- Rechazo de cargas que no sean PDF o .docx verificando la firma del archivo (no solo la extensión ni el tipo MIME declarado).
- Tamaño máximo 5 MB por CV.
- Escaneo antivirus (por ejemplo ClamAV) antes de procesar.
- El texto extraído nunca se interpreta como HTML ni se ejecuta.
- Respuestas públicas sin datos personales; el estado de seguimiento devuelve información mínima.

## 5. Archivos

- Bucket privado. Descarga mediante URL firmada de corta duración, solo para usuarios autorizados del tenant.
- Cifrado en reposo y en tránsito (TLS).
- Nombres de archivo generados por el sistema; el nombre original solo como metadato.

## 6. Webhooks salientes

- Firma HMAC SHA-256 con marca de tiempo; secreto distinto por endpoint, rotable.
- Entrega por HTTPS únicamente.
- Protección contra SSRF al registrar destinos (no permitir redes privadas ni direcciones internas).
- Reintentos con espera exponencial y registro de entregas.

## 7. Enlaces para candidatos

Los enlaces de examen y confirmaciones: token aleatorio largo, de un solo uso, con vencimiento, atado a la postulación. Se guarda solo el hash del token.

## 8. Datos personales

### 8.1 Aviso y consentimiento

El formulario incluye una casilla obligatoria con un aviso claro, en español, que informe:

- Quién es el responsable (la empresa que publica la vacante) y quién procesa (la plataforma).
- Para qué se usan los datos (evaluar la postulación).
- Que se podrán procesar con herramientas automatizadas, incluidas herramientas de inteligencia artificial, y que una persona revisa las decisiones.
- Por cuánto tiempo se conservan.
- Cómo ejercer acceso, rectificación y eliminación.

Se guarda `ConsentRecord` con versión del texto aceptado, fecha y hora, e IP truncada.

### 8.2 Minimización

- Solo se piden los datos necesarios.
- No se solicitan ni se almacenan datos innecesarios o sensibles (por ejemplo, religión, afiliación política, salud). Si aparecen dentro del CV, no se extraen ni se usan para puntuar.
- Anonimización antes de enviar a un proveedor de IA (ver `03-ia-y-arnes.md`).

### 8.3 Retención y eliminación

- Retención por defecto: 12 meses desde la última actividad de la postulación; configurable por tenant.
- Tarea programada que anonimiza o elimina datos vencidos.
- Proceso para atender solicitudes de acceso, rectificación y eliminación de un candidato, iniciado por la empresa desde el panel.
- Exportación de los datos de un candidato en formato legible por máquina.

### 8.4 Registros

- Los logs de aplicación no incluyen nombre, correo, teléfono ni contenido de CV.
- `AuditLog` registra accesos a CV, descartes, exportaciones y cambios de configuración, con quién y cuándo.

## 9. Proveedores de IA y terceros

- Revisar y documentar, para cada proveedor de IA y de correo, las condiciones de tratamiento y retención de datos, y si usan los datos para entrenamiento. Preferir configuraciones y planes que no usen los datos enviados para entrenar.
- Registrar a los proveedores como encargados del tratamiento en la política de privacidad.

## 10. Decisiones automatizadas

- El puntaje es una ayuda: una persona puede ver, cambiar y revertir toda recomendación.
- Cada descarte automático lleva motivo legible y queda en el historial.
- La selección automática es un interruptor apagado por defecto.
- Se prueban sesgos de forma periódica (ver `03-ia-y-arnes.md`, sección 10).

## 11. Respaldo y recuperación

Copias de seguridad automáticas de la base de datos y del almacenamiento de archivos, con pruebas periódicas de restauración. Las copias respetan la política de retención.

## 12. Secretos y configuración

Sin secretos en el repositorio. Gestión de secretos por entorno. Rotación de claves de firma, claves de API y secretos de webhooks.
