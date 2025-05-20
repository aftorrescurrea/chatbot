const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

/**
 * Detecta la intención del mensaje del usuario utilizando Ollama
 * @param {string} message - Mensaje del usuario
 * @returns {Object} - Objeto con la intención detectada y su confianza
 */
const detectIntent = async (message) => {
    try {
        const response = await fetch(`${process.env.OLLAMA_API_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.OLLAMA_MODEL,
                prompt: createIntentPrompt(message),
                stream: false
            }),
        });

        if (!response.ok) {
            throw new Error(`Error en la API de Ollama: ${response.statusText}`);
        }

        const data = await response.json();
        return parseIntentResponse(data.response);
    } catch (error) {
        logger.error(`Error al detectar intención: ${error.message}`);
        // Devolver una intención por defecto en caso de error
        return { name: 'desconocida', confidence: 0 };
    }
};

/**
 * Crea el prompt para la detección de intenciones
 * @param {string} message - Mensaje del usuario
 * @returns {string} - Prompt para el modelo
 */
const createIntentPrompt = (message) => {
    return `
Analiza el siguiente mensaje de un usuario de WhatsApp y determina su intención.

Mensaje: "${message}"

Posibles intenciones:
- solicitar_prueba_erp: El usuario quiere probar el sistema ERP
- solicitar_acceso_crm: El usuario quiere probar el sistema CRM
- solicitar_acceso_bi: El usuario quiere probar la plataforma de Business Intelligence
- solicitar_servicio: El usuario quiere probar algún servicio sin especificar cuál
- quiero_probar_servicio: El usuario expresa interés en probar un servicio
- saludar: El usuario está saludando o iniciando la conversación
- ayuda: El usuario está pidiendo ayuda o información
- informacion_servicios: El usuario quiere información sobre los servicios
- cuentame_mas: El usuario quiere saber más detalles
- hablar_con_asesor: El usuario quiere hablar con un asesor humano
- necesito_persona: El usuario necesita asistencia humana
- pregunta_sistema: El usuario está haciendo preguntas sobre el sistema o cómo usarlo
- pregunta_personal: El usuario está haciendo preguntas personales al bot
- pregunta_fuera_contexto: El usuario está haciendo preguntas no relacionadas con los servicios
- desconocida: No se puede determinar la intención

IMPORTANTE: Analiza cuidadosamente el contexto del mensaje. Si el usuario está haciendo una pregunta como "¿Cómo ingreso?" o "¿Cuál es mi nombre?", clasifícala como "pregunta_sistema" o "pregunta_personal" respectivamente, no como "desconocida".

Responde ÚNICAMENTE con el formato JSON:
{
  "intent": "nombre_de_la_intencion",
  "confidence": valor_entre_0_y_1
}
`;
};

/**
 * Parsea la respuesta del modelo para extraer la intención
 * @param {string} response - Respuesta del modelo
 * @returns {Object} - Objeto con la intención detectada y su confianza
 */
const parseIntentResponse = (response) => {
    try {
        // Extraer el JSON de la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No se encontró un formato JSON válido en la respuesta');
        }
        
        const jsonResponse = JSON.parse(jsonMatch[0]);
        
        return {
            name: jsonResponse.intent,
            confidence: jsonResponse.confidence
        };
    } catch (error) {
        logger.error(`Error al parsear respuesta de intención: ${error.message}`);
        return { name: 'desconocida', confidence: 0 };
    }
};

module.exports = { detectIntent };