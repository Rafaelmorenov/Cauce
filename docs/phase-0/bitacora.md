# Bitácora de Cauce

Registro vivo de lo construido, lo configurado y los permisos concedidos.
Cada paso nuevo se agrega al final, con fecha. Aquí no se copian secretos,
identificadores de aplicación, tokens ni el contenido de `.env`.

## Estado al 22 de octubre de 2026

La plataforma se llama **Cauce**. El código está en
`https://github.com/rafaelmorenov/cauce.git`, rama `main`, primer guardado
`196172c`.

El correo y el calendario de prueba salen del tenant **HCSoftware**
(`hcsoftware.ai`), desde el buzón de Santiago Moreno. La aplicación registrada
se llama **Cauce Sandbox**. Santiago concedió el consentimiento de administrador. La autorización del
22 de octubre de 2026 guardó el token renovable en `.env`. La prueba leyó el
perfil y la bandeja de entrada, y consultó el calendario. No envió correo.

## Decisiones que quedan vigentes

- Una sola licencia de Apollo, de la plataforma, para este alcance. Las
  licencias por empresa quedan para cuando el producto se venda.
- Microsoft 365 es el primer buzón. Google Workspace queda después.
- El correo sale del buzón de la empresa, no de Amazon SES. AWS es el lugar
  previsto para desplegar, y todavía no se ha aplicado esa infraestructura.
- La autorización local usa el navegador con Authorization Code y PKCE.
  Security Defaults bloqueó el código de dispositivo.
- Los secretos viven solo en `.env`, que no se sube a GitHub.

## Qué se construyó

Monorepo TypeScript con aplicación web, API, worker, contratos, reglas de
negocio y esquema de base de datos. La web ya muestra el nombre Cauce. La
revisión automática de código, tipos, pruebas y compilación pasó en local.
La prueba real de aislamiento en PostgreSQL sigue pendiente porque en esta
máquina no hay Docker ni una base de prueba configurada.

## Microsoft

### Tenant y usuarios

El 22 de octubre de 2026 se revisó el centro de administración de Entra:

- Tenant: HCSoftware. Entra Connect aparece deshabilitado.
- Hay tres usuarios: Gerencial general, Juliana Cascavita y Santiago Moreno.
- La cuenta de Santiago está habilitada, es miembro del directorio y fue
  creada el 31 de julio de 2026.
- Licencia de Santiago: **Microsoft 365 Business Basic**, activa, asignada
  directamente, con 32 de 32 servicios habilitados. Incluye buzón de Exchange.
- Santiago también tiene roles administrativos. Se leyó con claridad el de
  administrador de Exchange. Más tarde confirmó que ya es administrador global.
- El programa de desarrolladores de Microsoft 365 aceptó el perfil, pero
  respondió que no califica para la suscripción E5 gratuita. No se abrió la
  prueba de pago de Microsoft 365 Empresa porque el tenant ya tenía buzón.

### Aplicación Cauce Sandbox

Registro de una sola organización, HCSoftware. La redirección usada por la
prueba local es `http://localhost:8400`, en la plataforma de aplicaciones
móviles y de escritorio. No se usa el flujo de concesión implícita.

Permisos delegados de Microsoft Graph configurados:

| Permiso | Para qué sirve | Consentimiento de administrador |
|---|---|---|
| `User.Read` | Iniciar sesión y leer el perfil | Concedido el 22 de octubre de 2026 |
| `email` | Ver la dirección de correo | Concedido el 22 de octubre de 2026 |
| `Mail.Read` | Leer el correo del usuario que inicia sesión | Concedido el 22 de octubre de 2026 |
| `Mail.Send` | Enviar correo como ese usuario | Concedido el 22 de octubre de 2026 |
| `Calendars.Read` | Leer el calendario de ese usuario | Concedido el 22 de octubre de 2026 |

La autorización del script también pide `openid`, `profile` y
`offline_access`. Esos alcances permiten identificar la sesión y guardar un
token renovable. No piden acceso a los buzones de toda la organización: actúan
en nombre de la cuenta que inicia sesión.

En `.env` están el identificador del tenant, el de la aplicación y el token
renovable. Falta el secreto de cliente. No hace falta para la prueba local con
PKCE; sí hará falta cuando la aplicación web inicie sesión en el despliegue.

### Intentos de autorización

1. El código de dispositivo llegó a Microsoft y fue bloqueado con el error
   `530035`. Security Defaults considera inseguro ese flujo. No se desactivó
   esa protección.
2. El inicio de sesión por navegador sí abrió Microsoft. La cuenta entró y
   recibió el mensaje de que hacía falta la aprobación del administrador. En
   ese momento Santiago no podía pulsar el consentimiento.
3. Después de conceder el consentimiento, `npm run auth:microsoft` guardó el
   token renovable en `.env`.
4. `npm run smoke:microsoft` respondió correctamente: buzón
   `Santiago.moreno@hcsoftware.ai`, lectura de bandeja disponible, cero eventos
   en los próximos siete días y ningún mensaje enviado.

## 2026-10-22 — autorización y lectura

La sesión de Santiago quedó autorizada para Cauce Sandbox. El token se renovó
sin mostrar su valor. Graph devolvió el perfil, permitió contar la bandeja y
abrió la vista de calendario. Después se envió un único mensaje, "Prueba técnica Cauce", a `santiago.moreno@jumpcube.io`. Graph respondió con aceptación y el mensaje quedó en Enviados a las 21:52 UTC. El envío de prueba volvió a quedar apagado. Santiago confirmó que llegó a la bandeja principal, no a Otros ni a correo no deseado.

## 2026-10-22 — chat de audiencia

El panel ya no inventa criterios con palabras sueltas. Cada mensaje va a
`POST /v1/assistant/conversation`. El asistente pregunta lo que falta y solo
entrega criterios completos para revisión. Aprobar guarda la solicitud; no
busca contactos. El asistente usa Gemini (`GEMINI_API_KEY`), no Claude. La clave ya está en
`.env`. `gemini-2.5-flash` respondió que ya no está disponible para cuentas
nuevas; la prueba real con `gemini-3.8-flash` pidió los datos que faltaban y
no devolvió criterios todavía. La API, al arrancar desde `apps/api`, no veía
el `.env` de la raíz. Eso ya quedó corregido y el chat responde.

## 2026-10-22 — plantillas por canal

Se puede pegar una plantilla o pedirla a Gemini con la misma clave. La
habilidad de tono distingue correo, LinkedIn y WhatsApp. Solo el correo se
aprueba para la prueba, y aprobarlo no envía el mensaje.

## 2026-10-22 — base de contactos

La carga propia usa seis columnas: nombre, apellido, correo, cargo y empresa
son obligatorios; dominio es opcional. La plantilla descargable sale de ese
mismo contrato e incluye dos filas de ejemplo. Un correo personal no se guarda
como dominio de empresa. La fila inválida se informa y no descarta el resto.
En el entorno local, la empresa de demostración arranca con
santiago.moreno@jumpcube.io y andrescabesilla@gmail.com. Cargar el archivo no
envía correo.

## 2026-10-22 — un correo de prueba

Se aprobó la plantilla «Prueba de correo» y se envió un solo mensaje desde el
buzón de Santiago Moreno en HCSoftware. Destinatario:
`santiago.moreno@jumpcube.io`. Asunto: «El primer contacto comercial en
Jumpcube». Graph aceptó el envío y el mensaje quedó en Enviados a las 01:45
UTC del 23 de octubre de 2026. Una segunda solicitud no generó otro mensaje.
`andrescabesilla@gmail.com` sigue en la base y no recibió correo. Ninguna
campaña quedó activa. Falta que Santiago confirme si llegó a la bandeja de
Jumpcube.

## 2026-10-24 — campaña con la base

La campaña «Base de prueba» quedó activa con la plantilla «Software de ventas
para sector industrial». Santiago Moreno y Andrés Cabesilla están en cola, un
correo cada uno. El tope es 40 al día, de lunes a viernes, entre las 8 y las
18. El sábado 24 de octubre el ciclo respondió cero envíos y el motivo fue
fin de semana. El grupo de control quedó en cero. Un CSV cargado después entra
en esa misma cola en el siguiente ciclo, sin activar otra vez. La cola vive en
memoria: si la API se reinicia, hay que activar de nuevo antes de cargar una
base real.

## 2026-10-24 — horario elegible

La campaña ahora guarda los días y la franja horaria. El valor inicial sigue
siendo de lunes a viernes, de 8:00 a 18:00. Si el horario elegido está abierto
en ese momento, la pantalla avisa que el correo puede salir enseguida. Ese
reloj vive en este equipo: apagar el computador o cerrar la aplicación detiene
la cola. Para que siga sola hace falta un servidor encendido, y eso todavía no
está desplegado. La base de prueba quedó otra vez en cola, sin envíos, porque
hoy es sábado y el sábado no está marcado.

## 2026-10-24 — columnas elegidas al cargar

Al cargar un archivo, la pantalla muestra sus títulos y deja elegir cuál columna es el nombre, el apellido, el correo, el teléfono, el cargo, la empresa y el dominio. Nombre, correo y empresa son necesarios. Si el nombre viene completo y el apellido no se usa, se separa. El teléfono queda guardado y no se usa para enviar. Una prueba con títulos en inglés actualizó los dos contactos de prueba y no creó filas nuevas. La campaña siguió en cola.

## Lo que sigue

1. Confirmar, desde el lunes, que la cola envió un correo a cada contacto de prueba.
2. Medir la licencia de Apollo: búsqueda, enriquecimiento y límites.
3. Repetir el recorrido de correo y calendario en Google Workspace.
4. Medir SPF, DKIM, DMARC y bandejas semilla. Un solo destinatario no cierra la entregabilidad.
5. Comparar latencia y costo de la región de AWS.

## Cómo anexar una entrada

```text
### AAAA-MM-DD

Qué se hizo, quién lo confirmó y cuál fue el resultado visible.
Si hubo un permiso nuevo, agregarlo también a la tabla de Microsoft.
No pegar secretos ni tokens.
```
