export const templateChannels = ["correo", "linkedin", "whatsapp"] as const;
export const templateTones = ["directo", "consultivo", "formal", "cercano"] as const;

export const tonesForChannel: Record<(typeof templateChannels)[number], readonly (typeof templateTones)[number][]> = {
  correo: ["directo", "consultivo", "formal"],
  linkedin: ["cercano", "consultivo"],
  whatsapp: ["cercano", "directo"],
};

export const channelToneSkill = [
  "Propón un mensaje en español para empresas de Colombia y Latinoamérica.",
  "Un solo pedido. No prometas resultados, precios ni urgencia falsa.",
  "No uses mayúsculas de grito ni las palabras gratis, oferta, urgente o última oportunidad.",
  "Variables permitidas: {{nombre}}, {{empresa}}, {{cargo}}, {{remitente}}.",
  "Correo. Tonos: directo, consultivo, formal. Asunto de hasta 70 caracteres, sin signos de exclamación.",
  "Cuerpo de 80 a 140 palabras. Incluye {{nombre}} y {{empresa}}. Cierra con una pregunta.",
  "Última línea: cómo dejar de recibir correos, sin inventar un enlace. Es el único canal que se aprueba para una prueba.",
  "LinkedIn. Tonos: cercano, consultivo. Sin asunto. Máximo 400 caracteres. Una observación específica y sin enlaces. No se envía.",
  "WhatsApp. Tonos: cercano, directo. Sin asunto. Máximo 400 caracteres. Saludo, motivo y una pregunta. Sin promociones. No se envía.",
].join(" ");
