# Evidencia de Fase 0

## Completado sin credenciales

- Contratos comunes Google/Microsoft para correo y calendario.
- Cliente Apollo con búsqueda y enriquecimiento máximo de diez.
- Cliente Gemini con salida validada y sin herramientas de costo.
- SQS con envelope, idempotencia, reintento por visibilidad y DLQ en Terraform.
- Prueba web → API de creación y aprobación de audiencia.
- Compilación de producción, lint y pruebas unitarias.

## Bloqueos externos

No se deben marcar como verificados sin cuentas reales:

- Créditos antes/después y `429` de la licencia propia de Apollo.
- Envío, lectura, calendario y renovación de token en Google Workspace.
- Apertura de verificación OAuth de Google y cotización CASA.
- SPF, DKIM, DMARC y ubicación real en bandejas semilla.
- Latencia y costo observados entre regiones AWS.
- Revisión jurídica de tratamiento de datos.

## Plantilla de medición

| Fecha | Proveedor | Cuenta/plan | Operación | Resultado | Créditos | Límite observado | Evidencia |
|---|---|---|---|---|---:|---|---|
| pendiente | Apollo | — | búsqueda personas | — | — | — | — |
| pendiente | Apollo | — | enriquecimiento 10 | — | — | — | — |
| pendiente | Google | Workspace | enviar/leer/calendario | — | — | — | — |
| 2026-10-22 | Microsoft | Developer Program | elegibilidad sandbox E5 | no califica; sin tenant | — | membresía sin suscripción | panel del programa |
| 2026-10-22 | Microsoft | Business Basic, HCSoftware | consentimiento de Cauce Sandbox | concedido por el administrador | — | permisos delegados de un usuario | docs/phase-0/bitacora.md |
| 2026-10-22 | Microsoft | Business Basic, HCSoftware | renovar token, leer buzón y calendario | correcto; sin envío | — | bandeja visible, 0 eventos en 7 días | docs/phase-0/bitacora.md |
| 2026-10-22 | Microsoft | Business Basic, HCSoftware | un envío de prueba | aceptado; bandeja principal | — | un destinatario propio | docs/phase-0/bitacora.md |

La Fase 0 no está cerrada hasta completar las filas y tomar una decisión explícita.
