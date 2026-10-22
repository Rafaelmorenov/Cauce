# Cauce — plataforma de prospección y ventas

Monorepo TypeScript para convertir una audiencia B2B en campañas, respuestas,
reuniones, ventas atribuidas y ROI.

## Estado

La base implementa contratos de proveedores, reglas críticas de dominio, esquema
PostgreSQL multiempresa, API NestJS, worker SQS y una aplicación Next.js. Las
llamadas reales a Google, Microsoft, Apollo, Anthropic y HubSpot requieren las
credenciales del entorno y pruebas en cuentas de sandbox.

## Inicio local

Requisitos: Node.js 22+ y PostgreSQL 16 para persistencia real.

```bash
cp .env.example .env
npm install
npm run dev:api
npm run dev
```

Web: `http://localhost:3000`. API: `http://localhost:3001/health`.

En desarrollo, la API acepta `x-tenant-id` y `x-role`. En producción esos
encabezados no autentican: se exige JWT firmado. Nunca use este modo de
desarrollo en un entorno público.

## Verificación

```bash
npm run check
```

Las pruebas unitarias no llaman servicios externos. Las pruebas de integración
con PostgreSQL y proveedores se habilitan al suministrar sus credenciales.

## Estructura

- `apps/web`: experiencia web en español.
- `apps/api`: API y adaptadores de Google, Microsoft, Apollo y SQS.
- `apps/worker`: consumidor idempotente de trabajos.
- `packages/contracts`: esquemas Zod compartidos.
- `packages/domain`: reglas puras de negocio.
- `packages/db`: esquema Drizzle, contexto de tenant y RLS.
- `infra`: infraestructura AWS con Terraform.
- `docs`: decisiones, integraciones y procedimientos operativos.

## Reglas de seguridad

- Nunca se ejecuta enriquecimiento sin aprobación registrada.
- Nunca se activa una campaña sin aprobar primero el correo de prueba.
- Todas las operaciones de empresa se ejecutan dentro de una transacción con
  `SET LOCAL app.tenant_id`.
- Los trabajos y envíos tienen claves de idempotencia.
- Los secretos no se registran ni se incluyen en respuestas.
