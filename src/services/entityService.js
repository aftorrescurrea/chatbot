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
        return {};
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
- nombre: El nombre completo del usuario. Busca patrones como "Me llamo [nombre]", "Soy [nombre]", o simplemente nombres propios que aparezcan en el mensaje. Presta especial atención a nombres y apellidos que aparezcan juntos.
- email: La dirección de correo electrónico del usuario
- empresa: El nombre de la empresa del usuario (si se menciona)
- cargo: El cargo o puesto del usuario (si se menciona)

IMPORTANTE: Para la detección de nombres, ten en cuenta lo siguiente:
1. Si el usuario dice explícitamente su nombre (ej: "Me llamo Juan Pérez", "Soy María González"), extrae el nombre completo.
2. Si el usuario menciona un nombre propio que parece ser el suyo, extráelo.
3. Si el mensaje contiene una pregunta como "¿Cuál es mi nombre?", NO extraigas ningún nombre, ya que el usuario está preguntando, no proporcionando su nombre.
4. Si el mensaje contiene frases como "tienen demo", "tienen sistema", etc., NO extraigas "tienen" como nombre.
5. Si el usuario responde con su nombre seguido de una pregunta (ej: "Juan Pérez, ¿tienen demo?"), extrae SOLO el nombre (Juan Pérez) e ignora la pregunta.
6. Distingue entre nombres propios y palabras comunes que podrían parecer nombres.
7. Si el mensaje contiene una coma seguida de una pregunta, considera que el texto antes de la coma podría ser el nombre.

Responde ÚNICAMENTE con el formato JSON:
{
  "nombre": "valor_extraído_o_null",
  "email": "valor_extraído_o_null",
  "empresa": "valor_extraído_o_null",
  "cargo": "valor_extraído_o_null"
}

Si alguna entidad no está presente en el mensaje, asigna null a esa propiedad.
`;
};

/**
 * Parsea la respuesta del modelo para extraer las entidades
 * @param {string} response - Respuesta del modelo
 * @returns {Object} - Objeto con las entidades extraídas
 */
/**
 * Limpia el nombre para eliminar posibles preguntas o texto adicional
 * @param {string} name - Nombre a limpiar
 * @returns {string} - Nombre limpio
 */
const cleanName = (name) => {
    if (!name) return null;
    
    // Patrones comunes de preguntas o texto adicional después del nombre
    const patterns = [
        /,?\s*tienen demo\??$/i,
        /,?\s*tienen sistema\??$/i,
        /,?\s*tienen servicio\??$/i,
        /,?\s*\w+\?$/i,  // Patrón general para ", palabra?"
        /\s+\?\s*$/,     // Signo de interrogación al final
        /\s+tienen\s+\w+$/i  // "tienen" seguido de una palabra al final
    ];
    
    let cleanedName = name.trim();
    
    for (const pattern of patterns) {
        cleanedName = cleanedName.replace(pattern, '');
    }
    
    // Verificar si el nombre limpio es una pregunta sobre el nombre
    const isNameQuestion = /^(cual|cuál|como|cómo)(\s+es)?(\s+mi)?(\s+nombre)?(\?)?$/i.test(cleanedName);
    if (isNameQuestion) {
        return null; // No es un nombre, es una pregunta sobre el nombre
    }
    
    return cleanedName.trim();
};

const parseEntityResponse = (response) => {
    try {
        // Extraer el JSON de la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No se encontró un formato JSON válido en la respuesta');
        }
        
        const jsonResponse = JSON.parse(jsonMatch[0]);
        
        // Verificar si el mensaje es una pregunta sobre el nombre
        const isNameQuestion = jsonResponse.nombre &&
            (/^(cual|cuál|como|cómo)(\s+es)?(\s+mi)?(\s+nombre)(\?)?$/i.test(jsonResponse.nombre) ||
             /^mi nombre$/i.test(jsonResponse.nombre));
        
        // Si es una pregunta sobre el nombre, no extraer nombre
        if (isNameQuestion) {
            logger.info(`Detectada pregunta sobre el nombre: "${jsonResponse.nombre}" - No se extraerá como entidad`);
            jsonResponse.nombre = null;
        }
        
        // Limpiar el nombre si existe
        const nombreLimpio = jsonResponse.nombre ? cleanName(jsonResponse.nombre) : null;
        
        // Asegurarse de que todas las propiedades esperadas estén presentes
        const entities = {
            nombre: nombreLimpio,
            email: jsonResponse.email || null,
            empresa: jsonResponse.empresa || null,
            cargo: jsonResponse.cargo || null
        };
        
        // Registrar la limpieza del nombre si hubo cambios
        if (jsonResponse.nombre && nombreLimpio !== jsonResponse.nombre) {
            logger.info(`Nombre limpiado en parseEntityResponse: "${jsonResponse.nombre}" -> "${nombreLimpio}"`);
        }
        
        return entities;
    } catch (error) {
        logger.error(`Error al parsear respuesta de entidades: ${error.message}`);
        return {};
    }
};

module.exports = { extractEntities };