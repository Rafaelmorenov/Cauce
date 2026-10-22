# ADR 0002: PostgreSQL compartido con Row-Level Security

- Estado: aceptada con condición
- Fecha: 2026-10-22

## Decisión

Modelo pool: cada tabla de negocio contiene `tenant_id`. PostgreSQL fuerza RLS.
La aplicación usa un rol que no posee tablas y no tiene `BYPASSRLS`.

Cada operación se ejecuta en una transacción:

```sql
BEGIN;
SELECT set_config('app.tenant_id', :tenant_id, true);
-- consultas del caso de uso
COMMIT;
```

El tercer argumento `true` hace el contexto local a la transacción. No se usa
`SET` de sesión, porque una conexión reutilizada podría conservar el tenant.

## Puerta pendiente

Antes de producción se debe ejecutar la prueba con PostgreSQL 16 real:

1. Crear tenants A y B con datos equivalentes.
2. Consultar como A y demostrar que B no aparece.
3. Intentar insertar `tenant_id` B bajo contexto A y esperar error.
4. Reutilizar la misma conexión para B y comprobar que no conserva A.
5. Repetir con el pool y, si se incorpora, RDS Proxy.

La ausencia de Docker en el equipo actual impide certificar localmente esta
puerta; no se considera validada por una prueba unitaria.
