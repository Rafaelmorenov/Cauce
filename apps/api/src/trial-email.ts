export const trialEmail = {
  name: "Prueba de correo",
  channel: "correo" as const,
  tone: "consultivo" as const,
  subject: "El primer contacto comercial en {{empresa}}",
  body: [
    "Hola {{nombre}},",
    "",
    "Estoy revisando cómo las empresas ordenan el primer contacto comercial. En {{empresa}} me interesa saber quién decide si vale la pena escribirle a un cliente nuevo y qué información tienen antes de ese correo.",
    "",
    "Desde HCSoftware estoy probando Cauce. Una persona define la audiencia, aprueba el texto y solo entonces sale un mensaje desde su propio buzón. Este correo es esa prueba. No es una campaña y no busca una compra.",
    "",
    "¿Tendrías quince minutos esta semana para decirme si ese recorrido encaja con la forma de trabajar de {{empresa}}?",
    "",
    "Si prefieres no recibir más mensajes de esta prueba, responde a este correo y no volveré a escribir.",
  ].join("\n"),
};

export const trialSubject = "El primer contacto comercial en Jumpcube";

export const industrialEmail = {
  name: "Software de ventas para sector industrial",
  channel: "correo" as const,
  tone: "formal" as const,
  subject: "Optimización de procesos comerciales en {{empresa}}",
  body: [
    "Estimado/a {{nombre}},",
    "",
    "En el sector industrial, los ciclos comerciales suelen ser complejos y involucran múltiples tomadores de decisiones en {{empresa}}. Muchas organizaciones enfrentan desafíos para alinear sus equipos técnicos y comerciales durante el proceso de venta.",
    "",
    "En Cauce desarrollamos tecnología diseñada para optimizar la gestión de ventas B2B, facilitando el seguimiento de oportunidades complejas y mejorando la visibilidad del pipeline comercial.",
    "",
    "¿Considera que los procesos actuales de ventas en su organización están preparados para escalar este año?",
    "",
    "Para dejar de recibir estas comunicaciones, responda con la palabra baja.",
    "",
    "Atentamente,",
    "{{remitente}}",
  ].join("\n"),
};
