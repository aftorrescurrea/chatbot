const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

/**
 * Extrae entidades relevantes del mensaje del usuario utilizando Ollama
 * @param {string} message - Mensaje del usuario
 * @returns {Object} - Objeto con las entidades extraídas
 */
const extractEntities = async (message) => {
    try {
        const response = await fetch(`${process.env.OLLAMA_API_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.OLLAMA_MODEL,
                prompt: createEntityExtractionPrompt(message),
                stream: false
            }),
        });

        if (!response.ok) {
            throw new Error(`Error en la API de Ollama: ${response.statusText}`);
        }

        const data = await response.json();
        return parseEntityResponse(data.response);
    } catch (error) {
        logger.error(`Error al extraer entidades: ${error.message}`);
        // Devolver un objeto vacío en caso de error
        return {
            nombre: null,
            usuario: null,
            clave: null
        };
    }
};

/**
 * Crea el prompt para la extracción de entidades
 * @param {string} message - Mensaje del usuario
 * @returns {string} - Prompt para el modelo
 */
const createEntityExtractionPrompt = (message) => {
    return `
Analiza el siguiente mensaje de un usuario de WhatsApp y extrae las entidades relevantes.

Mensaje: "${message}"

Entidades a extraer:
- nombre: El nombre completo de la persona.
- usuario: El nombre de usuario o identificador que menciona el usuario.
- clave: La contraseña o clave que menciona el usuario.

EJEMPLOS CLAVE:
1. "Mi nombre es Juan Pérez" -> [{"nombre": "Juan Pérez"}]
2. "Mi usuario será jperez" -> [{"usuario": "jperez"}]
3. "Mi clave es abc123" -> [{"clave": "abc123"}]
4. "andres2 4587" -> [{"usuario": "andres2"}, {"clave": "4587"}]

REGLAS IMPORTANTES:
1. Si el mensaje contiene dos palabras separadas y la segunda parece ser numérica o una posible contraseña, interpreta la primera como "usuario" y la segunda como "clave".
2. Devuelve un array vacío si no encuentras ninguna entidad.
3. Incluye solo las entidades que encuentres, no incluyas entidades con valores nulos.

Responde ÚNICAMENTE con un array de objetos en formato JSON:
[]
o
[{"nombre": "valor"}, {"usuario": "valor"}, {"clave": "valor"}]

Solo incluye las entidades que realmente encontraste.
`;
};

/**
 * Parsea la respuesta del modelo para extraer las entidades
 * @param {string} response - Respuesta del modelo
 * @returns {Array} - Array de entidades extraídas
 */

const parseEntityResponse = (response) => {
    try {
        // Extraer el JSON de la respuesta
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            logger.error(`No se encontró un formato JSON de array válido en la respuesta: ${response}`);
            return [];
        }
        
        const entities = JSON.parse(jsonMatch[0]);
        
        // Validar que sea un array
        if (!Array.isArray(entities)) {
            logger.error(`La respuesta no es un array: ${response}`);
            return [];
        }
        
        return entities;
    } catch (error) {
        logger.error(`Error al parsear respuesta de entidades: ${error.message}`);
        logger.error(`Respuesta original: ${response}`);
        return [];
    }
};

module.exports = { extractEntities };