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

## Anthropic

Tres tareas: criterios estructurados, variantes de plantilla y clasificación
posterior a reglas. Todas las salidas se validan contra Zod. Baja confianza
requiere revisión humana. No se envía la base completa ni se usan datos de
Apollo para entrenar modelos.

## HubSpot

OAuth de solo lectura para contactos, empresas y negocios ganados. La
atribución cruza primero por correo y luego por dominio. El identificador
externo evita duplicar un cierre importado por más de una fuente.
