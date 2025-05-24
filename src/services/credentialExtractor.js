// src/services/credentialExtractor.js
const { logger } = require('../utils/logger');

/**
 * Extrae credenciales usando patrones robustos
 * @param {string} message - Mensaje del usuario
 * @returns {Object} - Credenciales extraídas
 */
const extractCredentialsRobust = (message) => {
    try {
        const cleanMessage = message.trim();
        logger.debug(`Extrayendo credenciales de: "${cleanMessage}"`);
        
        // Patrón 1: Dos palabras separadas por espacio
        const twoWordsPattern = /^(\w+)\s+(\S+)$/;
        const twoWordsMatch = cleanMessage.match(twoWordsPattern);
        
        if (twoWordsMatch) {
            const [, usuario, clave] = twoWordsMatch;
            
            // Validar que no sean palabras comunes
            const commonWords = ['hola', 'si', 'no', 'gracias', 'ok', 'bien', 'perfecto', 'claro'];
            if (!commonWords.includes(usuario.toLowerCase()) && 
                !commonWords.includes(clave.toLowerCase()) &&
                usuario.length >= 3 && clave.length >= 3) {
                
                logger.info(`✅ Credenciales extraídas: usuario="${usuario}", clave="${clave}"`);
                return { usuario, clave };
            }
        }

        // Patrón 2: Solo una palabra (asumir usuario)
        const singleWordPattern = /^(\w+)$/;
        const singleWordMatch = cleanMessage.match(singleWordPattern);
        
        if (singleWordMatch && cleanMessage.length >= 3 && cleanMessage.length <= 20) {
            const commonWords = ['hola', 'si', 'no', 'gracias', 'ok', 'bien', 'perfecto', 'claro'];
            if (!commonWords.includes(cleanMessage.toLowerCase())) {
                logger.info(`✅ Usuario extraído: "${cleanMessage}"`);
                return { usuario: cleanMessage };
            }
        }

        logger.debug(`❌ No se pudieron extraer credenciales de: "${message}"`);
        return {};
        
    } catch (error) {
        logger.error(`Error extrayendo credenciales: ${error.message}`);
        return {};
    }
};

/**
 * Combina extracción de Ollama con patrones de fallback
 * @param {string} message - Mensaje del usuario
 * @param {Function} ollamaExtractor - Función original de Ollama
 * @returns {Promise<Object>} - Entidades combinadas
 */
const hybridEntityExtraction = async (message, ollamaExtractor) => {
    try {
        logger.debug(`🔄 Iniciando extracción híbrida para: "${message}"`);
        
        // Paso 1: Intentar con Ollama
        let ollamaEntities = {};
        try {
            ollamaEntities = await ollamaExtractor(message);
            logger.debug(`🤖 Ollama extrajo: ${JSON.stringify(ollamaEntities)}`);
        } catch (error) {
            logger.warn(`⚠️ Ollama falló: ${error.message}`);
        }

        // Paso 2: Si Ollama no extrajo credenciales, usar patrones
        let finalEntities = { ...ollamaEntities };
        
        if (!finalEntities.usuario && !finalEntities.clave) {
            const patternEntities = extractCredentialsRobust(message);
            if (Object.keys(patternEntities).length > 0) {
                logger.info(`🎯 Usando patrones como fallback: ${JSON.stringify(patternEntities)}`);
                finalEntities = { ...finalEntities, ...patternEntities };
            }
        }

        logger.info(`✅ Entidades finales: ${JSON.stringify(finalEntities)}`);
        return finalEntities;
        
    } catch (error) {
        logger.error(`❌ Error en extracción híbrida: ${error.message}`);
        return {};
    }
};

module.exports = {
    extractCredentialsRobust,
    hybridEntityExtraction
};