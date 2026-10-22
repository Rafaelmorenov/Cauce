# Configuración del sandbox de Google Workspace

## 1. Proyecto OAuth

En Google Cloud Console:

1. Crear un proyecto exclusivo para el sandbox.
2. Habilitar Gmail API y Google Calendar API.
3. Configurar pantalla de consentimiento como externa y añadir el usuario de
   Workspace a “usuarios de prueba”.
4. Crear un cliente OAuth de tipo aplicación web.
5. No publicar la aplicación todavía.

Scopes para el smoke test:

- `openid email profile`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

`gmail.readonly` es restringido. El sandbox con usuario de prueba no reemplaza
la verificación ni CASA para lanzamiento.

## 2. Credenciales locales

Copiar `.env.example` a `.env` y completar:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_TEST_RECIPIENT=
GOOGLE_SEND_TEST=false
```

El refresh token se puede obtener temporalmente con OAuth 2.0 Playground
usando las credenciales del proyecto (“Use your own OAuth credentials”) y los
scopes anteriores. No pegar credenciales en tickets, chat, capturas o Git.

## 3. Prueba

Primero sin enviar:

```bash
npm run smoke:google
```

Debe validar renovación, perfil, lectura mínima y calendario. Después cambiar
`GOOGLE_SEND_TEST=true`, usar un buzón semilla propio como destinatario y
repetir. Registrar ubicación en bandeja, spam o promociones; volver
inmediatamente a `false`.

## 4. Cierre

Guardar en `docs/phase-0/evidence.md`: fecha, cuenta de sandbox, scopes,
resultado y vínculo a evidencia sin secretos. Revocar el refresh token cuando
deje de usarse.
