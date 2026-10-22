# Sandbox de Microsoft 365

Microsoft es el primer proveedor de correo y calendario. AWS aloja la
plataforma; el correo sale del buzón de Microsoft 365, no de Amazon SES.

## 1. Tenant y buzón

Hace falta un tenant de Microsoft 365 con Exchange Online y un usuario con
buzón. Hay dos rutas:

1. **Sandbox E5 de desarrollador:** gratuito, 25 licencias y hasta 90 días,
   renovable con actividad válida. Desde 2026 solo está disponible para cuentas
   elegibles: Visual Studio Professional/Enterprise estándar, ciertos niveles
   de Microsoft AI Cloud Partner/ISV Success, o soporte Premier/Unified. Se
   comprueba iniciando sesión en el panel del Developer Program.

   Comprobado el 22 de octubre de 2026 con la cuenta del panel
   (`developer.microsoft.com/en-us/microsoft-365/profile`). El programa aceptó
   el perfil y mostró: “You don't current qualify for a Microsoft 365 Developer
   Program sandbox subscription.” No hay botón para crear el tenant E5. Esta
   ruta queda descartada para el sandbox actual.
2. **Prueba de Microsoft 365 Empresa:** 30 días y hasta 25 usuarios. Incluye
   Exchange en los planes Empresa Básico, Estándar y Premium. Requiere método
   de pago y se convierte automáticamente en suscripción de pago si no se
   desactiva la renovación antes de terminar.

Una cuenta gratuita de Microsoft Entra sin licencia de Microsoft 365 sirve para
probar identidad, pero no tiene buzón Exchange y no sirve para este smoke test.

El usuario debe poder iniciar sesión y conceder permisos. Anota el identificador
del tenant en Entra ID, Información general.

## 2. Registro de aplicación

En [Entra admin center](https://entra.microsoft.com), Registros de aplicaciones,
nuevo registro:

- Nombre: `Cauce Sandbox`.
- Tipos de cuenta: solo este directorio organizativo.
- URI de redirección: dejarlo vacío por ahora.

Después, en Autenticación:

- Permitir flujos de cliente público: Sí.

En Permisos de API, agregar permisos delegados de Microsoft Graph:

- `openid`, `profile`, `email`, `offline_access`
- `User.Read`
- `Mail.Send`
- `Mail.Read`
- `Calendars.Read`

Conceder consentimiento de administrador para el tenant.

En Certificados y secretos, crear un secreto de cliente. Se usa en el despliegue
web; el flujo de código de dispositivo del sandbox usa el identificador de la
aplicación.

## 3. Configuración local

Crear `.env` desde `.env.example` y completar:

```text
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

No escribas estos valores en el chat. Luego ejecuta:

```bash
npm run auth:microsoft
```

Abre la dirección indicada, introduce el código y acepta los permisos. El
script guarda el refresh token en `.env`.

## 4. Prueba

Sin enviar correo:

```bash
npm run smoke:microsoft
```

Comprueba renovación del token, buzón, lectura mínima y calendario. Para un
único mensaje técnico, completa `MICROSOFT_TEST_RECIPIENT` con otro buzón tuyo,
cambia `MICROSOFT_SEND_TEST=true`, ejecuta de nuevo y vuelve a dejarlo en
`false`. Registra si cayó en bandeja principal, otros o correo no deseado.

## 5. AWS

El despliegue usa la infraestructura de `infra/terraform`: ECS Fargate, RDS
PostgreSQL, SQS, S3 y KMS en la región elegida. Antes de aplicarla hacen falta
cuenta AWS, VPC, subredes privadas y los security groups de las tareas. Esa
infraestructura no sustituye este sandbox: primero se demuestra el buzón.
