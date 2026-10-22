# Runbook de operación

## Cola con mensajes en DLQ

1. Identificar cola, tenant, tipo e idempotency key.
2. Corregir la causa; no editar el mensaje para ocultar un error.
3. Confirmar si `processed_jobs` ya contiene la clave.
4. Reprocesar hacia la cola fuente.
5. Verificar resultado de negocio y cerrar el incidente.

## Token vencido o revocado

1. Marcar conexión `requires_reconnect`.
2. Pausar campañas de ese buzón antes del siguiente ciclo.
3. Avisar a administradores de la empresa sin incluir el token.
4. Completar OAuth y realizar un correo de prueba.
5. Reanudar solo con aprobación humana.

## Rebotes altos

1. Pausar automáticamente al superar el umbral configurado.
2. Añadir rebotes duros a supresión.
3. Revisar autenticación SPF, DKIM y DMARC, fuente y verificación de la base.
4. No compensar aumentando volumen ni cambiando de buzón.
5. Reanudar con lote reducido y aprobación.

## Campaña detenida

La parada actúa en el siguiente ciclo. Los envíos ya tomados terminan o vencen;
los pendientes permanecen cancelados. Comprobar que ningún toque siguiente se
programe durante la detención.

## Restauración de base

1. Declarar incidente y congelar escrituras.
2. Restaurar a instancia nueva desde el punto conocido.
3. Ejecutar migraciones y pruebas de RLS.
4. Comparar conteos de tenants, campañas, envíos y supresiones.
5. Cambiar conexión, hacer smoke test y reabrir escrituras.
