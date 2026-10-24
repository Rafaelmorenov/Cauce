# Integraciones y permisos mínimos

Información revisada en octubre de 2026. Antes de cada lanzamiento se contrasta
de nuevo con documentación oficial.

## Apollo

- Una clave de plataforma durante MVP y piloto.
- Búsqueda de personas: no devuelve correo y actualmente no consume créditos.
- Enriquecimiento: lotes de hasta diez; no se solicitan teléfonos.
- Flujo obligatorio: vista previa, tope confirmado, aprobación registrada,
  trabajo en cola, libro de créditos por tenant.
- `429`: respetar `Retry-After`, no aumentar workers.
- La clave solo se obtiene del secreto de plataforma.

Checklist real pendiente: búsqueda, una página de organizaciones,
enriquecimiento de diez registros, créditos antes/después y respuesta 429.

## Google Workspace

Scopes mínimos previstos:

- Identidad: `openid email profile`.
- Envío: `gmail.send`.
- Lectura necesaria para clasificar: scope restringido de solo lectura.
- Calendario: lectura de eventos.

El acceso restringido almacenado o procesado por servidores requiere
verificación y evaluación CASA. El piloto usa usuarios de prueba hasta
completarla. Un token revocado pausa campañas y exige reconexión.

## Microsoft 365

Scopes delegados previstos: `User.Read`, `offline_access`, `Mail.Send`,
`Mail.Read`, `Calendars.Read`.

Para modo de aplicación empresarial se usa RBAC de Exchange limitado al buzón;
nunca `Mail.Send` de aplicación con alcance global. Los límites de Exchange no
son objetivos de campaña. Ante `429` o `503`, respetar `Retry-After`.

## Gemini

El chat de audiencia usa la API de Gemini, modelo `gemini-3.5-flash-lite` salvo que
`GEMINI_MODEL` indique otro. `POST /v1/assistant/conversation` obliga la función
`registrar_audiencia` y valida el turno con Zod. Si faltan país, tamaño, cargo,
sector o cantidad, pregunta y no propone criterios. Esa llamada no busca
contactos ni gasta créditos de Apollo. La plantilla usa la misma clave en
`POST /v1/assistant/template` y la habilidad de tono por canal. Guardarla o
aprobarla no envía correo; solo el canal correo puede aprobarse para la prueba. La clave vive en `GEMINI_API_KEY`. Una
clave de otro proveedor no sirve en esa variable. En el nivel gratuito, Google
puede usar los textos enviados para mejorar sus productos; no se escribe ahí
una base de contactos. Cada empresa tiene un tope de turnos en el proceso.

## HubSpot

OAuth de solo lectura para contactos, empresas y negocios ganados. La
atribución cruza primero por correo y luego por dominio. El identificador
externo evita duplicar un cierre importado por más de una fuente.
