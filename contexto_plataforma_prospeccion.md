# Contexto para planear la construcción: plataforma de prospección y ventas

> Documento de traspaso. Reúne todo lo definido hasta ahora sobre la plataforma para que otra IA (tú) analice la idea y planee su construcción.

---

## 0. Instrucciones para la IA que recibe este documento

Tu tarea es **analizar este contexto y planear la construcción** de la plataforma. No te limites a aceptar lo que está aquí:

1. **Analiza críticamente.** La sección de arquitectura y tecnologías (sección 9) es una **propuesta inicial**, no una decisión tomada. Evalúala, cuestiónala y propón cambios si encuentras algo mejor, explicando por qué.
2. **Verifica los datos de terceros.** Límites de API, planes, precios, permisos y reglas de Apollo, Microsoft, Google, Anthropic, WhatsApp y los CRM cambian con frecuencia. Todo lo que aquí aparece sobre proveedores debe confirmarse contra su documentación oficial vigente antes de diseñar sobre ello.
3. **Separa hechos de supuestos.** Las estimaciones de horas y los números de retorno de este documento son supuestos, no mediciones.
4. **Pregunta antes de asumir.** Si algo es ambiguo o falta, haz una lista de preguntas para el dueño del proyecto en vez de inventar la respuesta. Hay una lista de decisiones abiertas en la sección 12.
5. **Entrega un plan accionable** (ver sección 14 para el formato esperado).

---

## 1. Quién y para qué

- **Dueño de la idea:** Rafael Moreno. Desarrolla esta plataforma como **idea de negocio propia**. Planea presentarla primero a un **socio** y luego venderla a **empresas**.
- **Contexto de origen:** ya se han hecho campañas reales de prospección automatizada con Google Sheets, Google Apps Script y Gmail (envío automático de correos, detección de respuestas, rebotes y avisos automáticos, y lectura de calendario para detectar reuniones). La plataforma busca unir esas piezas en un producto para cualquier empresa.
- **Compatibilidad obligatoria:** la plataforma debe construirse **para Google Workspace y para Microsoft 365 desde el inicio**: correo, calendario e inicio de sesión deben funcionar con ambos. Ninguno de los dos es opcional ni queda para después.
- **Mercado:** empresas B2B de Colombia y Latinoamérica. Producto en **español**.

---

## 2. La idea en una frase

Una plataforma que convierte una conversación en ventas: la empresa cuenta en un chat a quién quiere venderle, y la plataforma le trae los contactos, le arma los mensajes, los envía, detecta las reuniones agendadas y **mide las ventas que se generan**.

**El fin no son las reuniones, son las ventas.** El retorno (ROI) se calcula con las ventas atribuibles a las campañas.

### Las tres necesidades del primer lanzamiento (MVP)

| Si la empresa... | La plataforma... |
|---|---|
| No tiene contactos | Se los trae (prospección con Apollo desde un chat) |
| No tiene plantillas | Se las arma (sugerencias del chat, con su tono, por canal) |
| No quiere encargarse del envío | Lo hace por ella (envío automático o operado por nosotros, con su aprobación) |

Cada parte se puede usar por separado o en conjunto: **autoservicio** o **hecho por nosotros**.

---

## 3. Usuarios y roles

- **Usuarios de la empresa cliente** (varios por empresa), con roles. Ejemplos: administrador, quien carga bases o pide prospección, quien aprueba plantillas, quien solo consulta informes, vendedores que registran resultados de reuniones.
- **Operador del proveedor** (Rafael y su equipo): ve las solicitudes de todas las empresas, puede operar campañas por ellas (modo "hecho por nosotros"), da soporte.
- **Contactos prospectados:** no son usuarios; son las personas a quienes se escribe.

---

## 4. Recorrido principal (flujo del MVP)

1. **Chat.** La empresa escribe a quién quiere llegar. Puede nombrar empresas ("empresas como Avianca y Homecenter") o describir un perfil ("gerentes de operaciones de retail en Colombia"). El chat pregunta lo que falte: país, tamaño de empresa, cargos, exclusiones y cuántos contactos necesita.
2. **De la conversación a criterios.** El chat convierte la conversación en criterios de búsqueda estructurados. Si hubo empresas de ejemplo, deduce sus rasgos (sector, tamaño, país) y propone empresas parecidas. **Esa deducción la hace la IA, no Apollo**, y debe mostrarse para revisión.
3. **Vista previa y aprobación 1.** La empresa ve los criterios y cuántas empresas y contactos coinciden, y fija un **tope de contactos**. Nada que consuma créditos ocurre sin esta confirmación.
4. **Prospección en segundo plano.** Se buscan empresas, se encuentran personas con los cargos pedidos, se obtienen y verifican correos, se eliminan duplicados. Resultado: base con nombre, cargo, empresa, correo y estado de verificación. La empresa puede revisar y excluir registros.
5. **Plantillas.** La empresa sube las suyas o el chat le propone variantes por canal y tono, con variables (nombre, empresa, cargo...). Siempre las aprueba.
6. **Correos de prueba y aprobación 2.** Antes de cualquier envío masivo se envían correos de prueba para contrastarlos. El envío masivo solo se activa tras aprobarlos.
7. **Envío automático.** Desde el buzón de la empresa, en horario laboral, en lotes con pausas, con tope diario y lote ajustable. Secuencia de varios toques: los siguientes salen solo a quienes no respondieron.
8. **Respuestas.** Se leen y clasifican (respuesta real, rebote, aviso automático, baja) con reglas primero e IA después.
9. **Reuniones.** Se lee el calendario y se cruza con los contactos para saber quién agendó, con fecha y estado.
10. **Ventas y ROI.** Se obtienen del CRM de la empresa o de una carga de clientes cerrados, y se calcula el retorno por campaña.

---

## 5. Requisitos funcionales por módulo

### 5.1 Chat de público objetivo
- Conversación guiada en español; solo sobre prospección (no es un chat general).
- Salida estructurada: criterios validados contra los valores que acepta el proveedor de datos (cargos, nivel jerárquico, ubicación, rango de empleados, industria o palabras clave, empresas incluidas/excluidas, cantidad).
- Muestra un resumen editable y pide confirmación explícita.
- Nunca dispara acciones que consuman créditos sin confirmación.
- Tope de conversaciones o de uso de IA por empresa al mes.

### 5.2 Prospección y base de contactos
- Orquestación por trabajos en cola: búsqueda de empresas, búsqueda de personas, obtención de correos, verificación.
- Respeto de límites de la API (cola, reintentos con espera, control de concurrencia).
- Control de créditos: estimación antes de ejecutar, tope por solicitud y por mes, registro de consumo.
- Deduplicación (por correo, y por persona/empresa), exclusión de clientes actuales o contactos ya existentes.
- Estados por contacto (nuevo, verificado, excluido, contactado, respondió, reunión, venta, baja).
- Carga alternativa de bases propias (CSV/Excel) con mapeo de columnas y validación.
- Exportación de la base.

### 5.3 Plantillas
- Biblioteca por canal y por campaña, con versiones.
- Variables con vista previa usando datos reales y alertas (variable faltante, largo excedido).
- Sugerencias del chat (varias variantes, tono configurable). Aprobación obligatoria.
- Preparado para multicanal (correo ahora; WhatsApp después, con plantillas aprobadas por la plataforma de WhatsApp).

### 5.4 Campañas y motor de envío
- Secuencias de varios toques con días de espera configurables.
- Horario laboral por zona horaria, tope diario, **lote ajustable** (cuántos por tanda y cada cuánto), pausas con variación aleatoria.
- Calentamiento gradual para dominios nuevos.
- Correos de prueba obligatorios antes del envío masivo.
- Activar, pausar o detener por campaña o en general (efecto en el siguiente ciclo).
- Idempotencia: nunca enviar dos veces el mismo toque al mismo contacto.
- Lista de supresión global por empresa (bajas, rebotes duros, quejas).
- Detener la secuencia cuando el contacto responde.
- Los toques siguientes deben ir en el mismo hilo cuando corresponda (cabeceras de respuesta).
- Enlace o mecanismo de baja en cada correo.

### 5.5 Respuestas
- Lectura del buzón (avisos de cambios o sondeo periódico).
- Clasificación en dos capas: **reglas** para rebotes y respuestas automáticas (cabeceras como Auto-Submitted, remitentes tipo mailer-daemon/postmaster, asuntos típicos), luego **IA** para el resto, con nivel de confianza; baja confianza va a revisión humana.
- Aprendizaje de la experiencia previa: en Gmail, las respuestas automáticas a veces llegan en hilos separados del correo original, así que no basta con mirar el hilo; hay que buscar también por remitente.

### 5.6 Agenda y reuniones
- Lectura del calendario donde llegan las reuniones (incluidas páginas de reserva).
- Cruce de invitados con contactos por correo; respaldo por dominio cuando la persona agenda con otro correo.
- Estados de reunión (agendada, realizada, cancelada).
- Recordatorio al responsable después de la reunión para registrar el resultado.

### 5.7 Ventas, atribución y ROI
Tres fuentes, combinables:
1. **Conexión con el CRM** de la empresa (HubSpot, Salesforce, Dynamics 365, Pipedrive u otros): leer negocios ganados y cruzarlos con contactos por correo o dominio. Permite saber quién vendió, qué campaña originó la venta y el tiempo de cierre.
2. **Carga de clientes cerrados** (CSV: empresa, fecha, valor, opcionalmente NIT) para empresas sin CRM o como respaldo.
3. **Registro tras la reunión** (venta, en negociación, perdida, valor).

Reglas de atribución (configurables por empresa):
- Venta atribuible: empresa contactada por la plataforma que cierra dentro de una **ventana** acordada (ej. 90 o 180 días).
- **Originada vs influenciada**: si ya estaba en conversación antes de la campaña, se marca como influenciada.
- Valor exacto o rango.
- **Grupo de control**: reservar al azar un porcentaje de la base (ej. 10 %) al que no se escribe, para medir el aporte incremental real.

Cálculo: ROI = (margen generado por las ventas − costo mensual) ÷ costo mensual.

### 5.8 Informes y panel
- Embudo: contactos → respuestas → reuniones → ventas → retorno.
- Por campaña, por vendedor, por sector y por cargo contactado; tiempo de cierre.
- Registro (log) de cada acción. Informes descargables y envío programado por correo.

### 5.9 Usuarios, roles y operación
- Multiempresa con aislamiento estricto de datos.
- Roles y permisos por empresa; registro de actividad (auditoría).
- Panel del operador para el modo "hecho por nosotros" y soporte.

---

## 6. Requisitos no funcionales

- **Google y Microsoft:** toda función que use correo, calendario o inicio de sesión debe funcionar igual con Google Workspace y con Microsoft 365. Diseña una capa común (por ejemplo, un conector de buzón y uno de calendario con una implementación para cada proveedor) para que el resto de la plataforma no dependa de cuál use cada empresa.
- **Seguridad:** cifrado en reposo y en tránsito; claves de API y tokens de los clientes cifrados en un gestor de secretos; mínimo privilegio en los permisos de correo y calendario.
- **Privacidad y datos:** solo datos de contacto profesional; baja en cada correo; acuerdo de tratamiento de datos con cada empresa; el contenido de las respuestas pasa por un modelo de IA y la empresa debe aceptarlo expresamente. Revisar la normativa de protección de datos aplicable (Colombia y demás países objetivo).
- **Multiempresa:** aislamiento por empresa en base de datos y en almacenamiento.
- **Confiabilidad:** trabajos en cola con reintentos, idempotencia, recuperación ante caídas de proveedores.
- **Observabilidad:** logs estructurados, trazas, alertas (rebotes altos, quejas, fallos de envío, tokens vencidos).
- **Idioma y zona horaria:** español; horarios según la zona de cada empresa.
- **Costo:** los créditos de Apollo y el uso de IA corren con las claves de cada empresa (a confirmar, ver sección 12).

---

## 7. Integraciones (todo debe verificarse con documentación vigente)

| Integración | Uso | Notas conocidas a verificar |
|---|---|---|
| **Apollo (API)** | Búsqueda de empresas y personas, obtención y verificación de correos | Algunos endpoints consumen créditos; los límites de uso varían por plan y endpoint. Las fuentes consultadas no coinciden sobre si el acceso a la API está en todos los planes o solo en los de pago, ni sobre qué búsquedas consumen créditos. Revisar también los términos sobre uso de datos para terceros. |
| **Microsoft Graph** | Envío y lectura de correo, lectura de calendario | Requiere registrar la app en Entra ID y consentimiento del administrador. El permiso de aplicación para enviar correo, por defecto, permite enviar desde cualquier buzón del tenant; debe restringirse a un buzón con RBAC para aplicaciones en Exchange Online. Límites de envío por buzón (del orden de 10.000 destinatarios/día y 30 mensajes/minuto) y límites a destinatarios externos a nivel de tenant; Microsoft indica que Exchange Online no es para envíos masivos. |
| **Gmail API / Google Calendar** | Envío y lectura de correo, lectura de calendario, para empresas con Google Workspace | Los permisos de lectura de Gmail son restringidos. Como la plataforma servirá a varias empresas, hay que planear desde el inicio la verificación de la app por parte de Google y la evaluación de seguridad que exige; puede tomar tiempo y debe entrar en el cronograma. |
| **Claude API (Anthropic)** | Chat de público objetivo, sugerencia de plantillas, clasificación de respuestas | La clave de API la provee cada empresa. Usar salidas estructuradas y herramientas (tool use). Alternativa: Claude vía Amazon Bedrock si se aloja en AWS. |
| **CRM** | Lectura de negocios ganados para atribución | HubSpot, Salesforce, Dynamics 365, Pipedrive. Empezar por uno. |
| **Carga de archivos** | Bases propias y clientes cerrados | CSV/Excel con mapeo de columnas. |

**Fuera de alcance:** LinkedIn. No se automatiza el envío de mensajes en LinkedIn (lo prohíben sus términos) y no se leen perfiles por enlace: en una prueba, LinkedIn bloqueó el acceso automatizado a un perfil.

---

## 8. Experiencia y diseño

- **Chat primero:** la primera experiencia es una conversación, no un formulario.
- **Aprobaciones visibles** en los dos momentos críticos (antes de gastar créditos y antes de enviar).
- **Panel orientado a ventas:** el embudo hasta ventas y el ROI son la pantalla principal, no los correos enviados.
- **Estética sobria y profesional:** en las propuestas se usó tipografía serif para títulos y sans para cuerpo, una paleta de tinta oscura con un acento bronce y líneas finas. Puede servir de punto de partida para la identidad visual.
- **Pantallas mínimas sugeridas:** chat de prospección, base de contactos, plantillas, campañas (con estados y controles), bandeja de respuestas, reuniones, ventas y ROI, informes, conexiones (correo, calendario, CRM, claves), usuarios y roles, panel del operador.

---

## 9. Propuesta inicial de arquitectura y tecnologías (para evaluar)

> Esto es una sugerencia de partida. Analízala, compárala con alternativas y decide.

### 9.1 Visión general
- **Aplicación web** (frontend) + **API** (backend) + **trabajadores en segundo plano** (prospección, envío, lectura de respuestas, calendario, sincronización de CRM) + **base de datos relacional** + **cola de trabajos** + **almacenamiento de archivos** + **gestor de secretos**.

### 9.2 Frontend
- Next.js (React) con TypeScript.
- Tailwind CSS y una librería de componentes accesible (por ejemplo shadcn/ui).
- Chat con respuestas en streaming.
- Gráficos para el embudo y el ROI.

### 9.3 Backend
- **Opción A (sugerida):** TypeScript de punta a punta (Node.js con NestJS o Fastify), para compartir tipos con el frontend.
- **Opción B:** Python (FastAPI) si se prioriza el ecosistema de datos e IA.
- ORM con migraciones (por ejemplo Prisma o Drizzle en TS; SQLAlchemy en Python).

### 9.4 Datos y colas
- **PostgreSQL** como base principal, con aislamiento por empresa (columna de empresa en cada tabla + Row-Level Security).
- **Cola de trabajos:** BullMQ sobre Redis, o servicios gestionados (Amazon SQS + EventBridge Scheduler).
- **Archivos:** almacenamiento de objetos (S3 o equivalente) para cargas CSV y exportaciones.

### 9.5 Autenticación y permisos
- Inicio de sesión con cuentas corporativas (Microsoft Entra ID y Google) mediante OIDC.
- Roles y permisos propios de la plataforma.
- Tokens OAuth de buzones, calendarios y CRM cifrados en un gestor de secretos.

### 9.6 Infraestructura
- **AWS (sugerido):** contenedores en ECS Fargate o App Runner, RDS PostgreSQL, ElastiCache Redis, S3, Secrets Manager/KMS, CloudWatch.
- **Azure (alternativa)** si se prefiere por cercanía con Microsoft; la elección de nube no debe afectar la compatibilidad con Google.
- Infraestructura como código (Terraform o CDK), entornos separados (desarrollo, pruebas, producción), CI/CD.
- Observabilidad con OpenTelemetry y un servicio de errores (por ejemplo Sentry).

### 9.7 Diseño del agente de chat
- Claude con herramientas definidas, por ejemplo: proponer criterios, vista previa de búsqueda (sin costo o con costo mínimo), confirmar y lanzar prospección, sugerir plantillas.
- La IA **no ejecuta acciones con costo**: el lanzamiento real lo dispara la confirmación del usuario en la interfaz.
- Salidas estructuradas validadas contra el esquema de criterios.
- Límites de uso por empresa y registro de conversaciones.

### 9.8 Modelo de datos inicial (borrador)
`empresas` (tenants), `usuarios`, `roles`, `conexiones` (correo, calendario, CRM, Apollo, IA), `solicitudes_prospeccion` (conversación → criterios, estado, tope, créditos estimados/consumidos), `organizaciones`, `contactos`, `listas`, `plantillas` y `versiones_plantilla`, `campanas`, `pasos_secuencia`, `envios` (mensaje, toque, estado, ids del proveedor), `eventos` (respuesta, rebote, aviso automático, baja, queja), `supresiones`, `reuniones`, `ventas` (fuente: CRM/carga/registro; valor; originada/influenciada), `atribuciones`, `grupo_control`, `consumo` (créditos e IA), `auditoria`.

---

## 10. Ruta de construcción sugerida (para que la refines)

**Fase 0. Pruebas técnicas (antes de comprometer fechas)**
- Apollo: confirmar plan, acceso a API, endpoints, límites y créditos por operación con una cuenta real.
- Microsoft Graph: en un tenant de pruebas, enviar, leer respuestas y leer calendario desde un buzón restringido con RBAC.
- Google: en un Workspace de pruebas, enviar, leer respuestas y leer calendario con la Gmail API y la Calendar API; iniciar desde ya el proceso de verificación de la app con Google.
- Entregabilidad: dominio secundario con SPF, DKIM y DMARC; plan de calentamiento.
- Prototipo del chat: de una conversación a criterios estructurados válidos.

**Fase 1. Base**: multiempresa, autenticación con Google y Microsoft, roles, conexiones y secretos, capa común de correo y calendario con sus dos implementaciones, modelo de datos, CI/CD.

**Fase 2. Prospección**: chat, vista previa, aprobación 1, trabajos de prospección, base de contactos, carga de bases propias.

**Fase 3. Plantillas y envío**: biblioteca, sugerencias, correos de prueba, aprobación 2, motor de envío con lotes, pausas, topes, supresión y secuencias.

**Fase 4. Respuestas y agenda**: lectura, clasificación (reglas + IA), revisión humana, calendario.

**Fase 5. Ventas y ROI**: carga de clientes cerrados, registro tras reunión, primera integración de CRM, atribución, grupo de control, panel de embudo y ROI.

**Fase 6. Piloto**: 2 o 3 empresas, un ciclo completo de campañas, endurecimiento, observabilidad, documentación y capacitación.

**Después del MVP (hoja de ruta)**
- **WhatsApp:** toques por WhatsApp con la misma base y campañas. Requiere cuenta de empresa en la plataforma de WhatsApp, plantillas de mensaje aprobadas y aceptación previa de la persona; revisar reglas vigentes.
- **Bot de llamadas:** primer contacto telefónico y agenda de reuniones; requiere revisar normativa y consentimiento.
- Más CRM y, opcionalmente, conexión con facturación.

---

## 11. Estimaciones y referencias comerciales previas (supuestos)

- **Esfuerzo estimado del MVP:** entre 285 y 515 horas de desarrollo, más unas 20 a 40 horas por cada CRM. Estimación inicial sin medir; reestímala por fases.
- **Ejemplo de ROI usado con el socio (supuestos):** 2.000 contactos/mes; entre 0,5 % y 1,5 % agendan; entre 10 % y 20 % de las reuniones cierran; ticket de COP 15 M; margen de 30 %; costo mensual total de COP 2 M. El piloto debe reemplazar estos supuestos por datos reales.
- **Referencias de precio en discusión:** suscripción del orden de COP 750.000/mes (a revisar con el alcance final); prospección hecha por el proveedor a COP 400.000 por bloque de 80 empresas (unos 480 contactos); cupo de unas 5.000 cuentas/mes.
- **Modelo de negocio:** suscripción mensual + configuración inicial + servicios (prospección, plantillas, operación del envío) + módulos futuros (WhatsApp, llamadas). Licencia de uso, no venta del código.

---

## 12. Decisiones abiertas (pregúntalas o propón una recomendación)

1. ¿La cuenta y los créditos de Apollo son de cada empresa (su propia clave) o del proveedor con un tope mensual? Afecta costos, términos de uso y diseño.
2. ¿Alojamiento en AWS o Azure? ¿Una sola instalación multiempresa o despliegues dedicados para empresas que lo exijan?
3. ¿Cuál es la estrategia para que Google y Microsoft avancen en paralelo sin duplicar lógica, y cómo encaja la verificación de Google en el cronograma?
4. ¿Qué CRM se integra primero?
5. ¿Avisos de cambios (webhooks) o sondeo periódico para leer respuestas en el MVP?
6. ¿Cómo opera el modo "hecho por nosotros": el operador entra al espacio de la empresa con permisos delegados y auditoría?
7. ¿Qué nivel de detalle de ventas compartirán las empresas (valor exacto o rango)?
8. ¿Ventana de atribución por defecto y porcentaje del grupo de control?
9. ¿Precios finales y límites de uso por plan?

---

## 13. Riesgos principales

| Riesgo | Mitigación prevista |
|---|---|
| Correos en spam / daño de reputación | Dominio aparte, calentamiento, lotes con pausas, topes, correos de prueba, supresión, monitoreo de rebotes y quejas |
| Dependencia de Apollo (precios, términos, API) | Capa de abstracción del proveedor de datos para poder cambiarlo |
| Permisos de TI de cada empresa (Google y Microsoft) | Permisos mínimos, restringidos a un buzón; documentación clara para el área de TI |
| Verificación de la app por parte de Google | Iniciarla en la Fase 0 y contemplar sus tiempos en el plan |
| Normativa de datos | Solo datos B2B, bajas, acuerdo de tratamiento de datos, aceptación del uso de IA |
| Errores de la IA (criterios o clasificación) | Aprobaciones humanas, salidas estructuradas, confianza y revisión manual |
| Medición de ventas incompleta | CRM + carga de clientes cerrados + registro tras reunión; reporte obligatorio en el piloto |
| Competencia de herramientas existentes | Diferenciación: recorrido completo, chat en español, modo "hecho por nosotros", medición de ventas |

---

## 14. Lo que esperamos de ti (formato del plan)

Entrega, en este orden:

1. **Resumen de tu entendimiento** del producto y del MVP, y lo que cambiarías.
2. **Preguntas abiertas** priorizadas (las que bloquean y las que no).
3. **Arquitectura recomendada**, con un diagrama en texto (por ejemplo Mermaid) y la justificación de cada decisión frente a sus alternativas (formato de registros de decisión).
4. **Modelo de datos** detallado (tablas, relaciones, índices clave, aislamiento por empresa).
5. **Diseño de integraciones**: Apollo, Microsoft Graph, Google, Claude, CRM, con permisos, límites verificados y manejo de errores.
6. **Diseño del motor de envío y de la atribución de ventas**, con sus reglas.
7. **Plan por fases** con épicas, historias de usuario y criterios de aceptación, dependencias y orden recomendado.
8. **Estimación** por fase (rango), riesgos y plan de pruebas (incluida la prueba de entregabilidad).
9. **Primeros pasos concretos** para la Fase 0.

Si alguna parte de este documento te parece equivocada o riesgosa, dilo explícitamente.
