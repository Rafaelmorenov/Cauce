# ADR 0001: monolito modular y procesamiento asíncrono

- Estado: aceptada
- Fecha: 2026-10-22

## Contexto

El producto tiene pocos usuarios interactivos por empresa y mucho trabajo en
segundo plano: prospección, envío, lectura de buzones y sincronización de CRM.
El equipo inicial no justifica operar varios sistemas distribuidos.

## Decisión

Un repositorio y un dominio compartido, desplegados como tres procesos
independientes: web, API sin estado y worker. Los límites internos siguen
capacidades de negocio. Los trabajos usan SQS y DLQ; PostgreSQL conserva la
fuente de verdad del envío programado.

## Consecuencias

- API y workers escalan horizontalmente sin reescribir el dominio.
- SQS entrega al menos una vez: todos los consumidores son idempotentes.
- Un módulo solo se extrae cuando métricas de carga, aislamiento o ritmo de
  despliegue lo demuestren.
- Kubernetes y microservicios quedan explícitamente diferidos.

## Evidencia para revisar

- Atraso por tarea de cada cola.
- Saturación de conexiones o CPU de PostgreSQL.
- Necesidad contractual de una base dedicada.
- Fallos que no puedan aislarse con workers separados.
