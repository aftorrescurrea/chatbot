const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

/**
 * Detecta las intenciones del mensaje del usuario utilizando Ollama
 * @param {string} message - Mensaje del usuario
 * @returns {Object} - Objeto con las intenciones detectadas
 */
const detectIntents = async (message) => {
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
        logger.error(`Error al detectar intenciones: ${error.message}`);
        // Devolver un array vacío de intenciones en caso de error
        return { intents: [] };
    }
};

/**
 * Crea el prompt para la detección de intenciones
 * @param {string} message - Mensaje del usuario
 * @returns {string} - Prompt para el modelo
 */
const createIntentPrompt = (message) => {
    return `
Analiza el siguiente mensaje de un usuario de WhatsApp y determina todas las intenciones que contiene.

Mensaje: "${message}"

Posibles intenciones:
- saludo: El usuario está saludando o iniciando la conversación
- interes en el servicio: El usuario expresa interés en probar o conocer el servicio
- confirmacion: El usuario está confirmando o aceptando algo
- inicio de prueba: El usuario está solicitando comenzar una prueba o proporcionando credenciales
- agradecimiento: El usuario está agradeciendo por algo
- soporte tecnico: El usuario está solicitando ayuda técnica

EJEMPLOS CLAVE:
1. "hola" -> ["saludo"]
2. "hola, estoy interesado en la aplicación" -> ["saludo", "interes en el servicio"]
3. "andres2 4587" -> ["inicio de prueba"]  (Este es un formato de usuario y contraseña)
4. "gracias por la ayuda" -> ["agradecimiento"]
5. "tengo problemas para acceder" -> ["soporte tecnico"]

IMPORTANTE: 
1. Un mensaje puede contener VARIAS intenciones al mismo tiempo
2. Si el mensaje contiene lo que parece ser un nombre de usuario y una contraseña (como "andres2 4587"), considéralo como "inicio de prueba"
3. Usa EXACTAMENTE los nombres de intenciones como están escritos arriba

Responde ÚNICAMENTE con el formato JSON:
{
  "intents": ["intencion1", "intencion2", ...]
}
`;
};

/**
 * Parsea la respuesta del modelo para extraer las intenciones
 * @param {string} response - Respuesta del modelo
 * @returns {Object} - Objeto con las intenciones detectadas
 */
const parseIntentResponse = (response) => {
    try {
        // Extraer el JSON de la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No se encontró un formato JSON válido en la respuesta');
        }
        
        const jsonResponse = JSON.parse(jsonMatch[0]);
        
        // Asegurarse de que intents sea siempre un array
        if (!Array.isArray(jsonResponse.intents)) {
            return { intents: [] };
        }
        
        return { intents: jsonResponse.intents };
    } catch (error) {
        logger.error(`Error al parsear respuesta de intención: ${error.message}`);
        return { intents: [] };
    }
};

module.exports = { detectIntents };