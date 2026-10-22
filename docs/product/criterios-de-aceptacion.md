# Criterios transversales de aceptación

## Aprobaciones

- La conversación nunca llama enriquecimiento.
- La prospección paga comienza únicamente con solicitud `aprobada`.
- Una campaña no se activa sin correo de prueba aprobado.
- Cada aprobación registra actor y fecha.

## Multiempresa

- Un identificador suministrado por el cliente no decide el tenant; lo decide la
  identidad autenticada.
- Un rol lector no modifica campañas.
- Toda tabla de negocio tiene `tenant_id`, índice correspondiente y RLS.
- Logs y métricas incluyen tenant, pero nunca secretos ni cuerpos completos.

## Envío

- Un enrollment y paso producen como máximo un envío.
- Baja, queja, rebote duro, respuesta o grupo de control bloquean el siguiente
  toque.
- Variables ausentes bloquean el mensaje.
- Horario, días hábiles, calentamiento y topes se evalúan antes de tomarlo.

## Atribución

- Cierre anterior a campaña: influenciada.
- Cierre fuera de ventana: no atribuible.
- Grupo de control: no aumenta ROI.
- Sin margen configurado no se muestra un ROI inventado.

## Definición de hecho

Código, prueba, documentación, métrica, alerta y procedimiento de reversión.
Una integración externa además necesita prueba en sandbox y captura de sus
límites observados.
