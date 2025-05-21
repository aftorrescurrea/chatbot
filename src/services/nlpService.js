/**
 * Servicio de procesamiento de lenguaje natural
 * Detecta intenciones en los mensajes de los usuarios
 */

const { logger } = require('../utils/logger');
const { intentConfig } = require('../config/promptConfig');
const promptService = require('./promptService');

/**
 * Detecta las intenciones del mensaje del usuario utilizando el servicio de prompts
 * @param {string} message - Mensaje del usuario
 * @param {Object} options - Opciones adicionales para la detección de intenciones
 * @returns {Object} - Objeto con las intenciones detectadas
 */
const detectIntents = async (message, options = {}) => {
    try {
        // Configurar variables específicas para este prompt
        const variables = {
            supportedIntents: options.supportedIntents || intentConfig.supportedIntents,
            intentExamples: options.intentExamples || intentConfig.intentExamples,
            conversationExamples: options.conversationExamples || intentConfig.conversationExamples,
            serviceType: options.serviceType || 'ERP'
        };

        // Usar el servicio de prompts para detectar intenciones
        return await promptService.detectIntentions(message, 'intent-detection', variables);
    } catch (error) {
        logger.error(`Error al detectar intenciones: ${error.message}`);
        // Devolver un array vacío de intenciones en caso de error
        return { intents: [] };
    }
};

/**
 * Ordena las intenciones por prioridad
 * @param {Array} intents - Array de intenciones detectadas
 * @returns {Array} - Array de intenciones ordenadas por prioridad
 */
const prioritizeIntents = (intents) => {
    // Definir prioridad para las intenciones (menor número = mayor prioridad)
    const priorities = {
        'solicitud_prueba': 1,
        'soporte_tecnico': 2,
        'consulta_precio': 3,
        'consulta_caracteristicas': 4,
        'interes_en_servicio': 5,
        'queja': 6,
        'cancelacion': 7,
        'confirmacion': 8,
        'agradecimiento': 9,
        'saludo': 10,
        'despedida': 11
    };

    // Ordenar por prioridad
    return [...intents].sort((a, b) => {
        const priorityA = priorities[a] || 100;
        const priorityB = priorities[b] || 100;
        return priorityA - priorityB;
    });
};

/**
 * Determina la intención principal del mensaje
 * @param {Array} intents - Array de intenciones detectadas
 * @returns {string|null} - Intención principal o null si no hay intenciones
 */
const getPrimaryIntent = (intents) => {
    if (!intents || intents.length === 0) {
        return null;
    }

    const orderedIntents = prioritizeIntents(intents);
    return orderedIntents[0];
};

/**
 * Analiza el sentimiento del mensaje del usuario
 * @param {string} message - Mensaje del usuario
 * @returns {Promise<Object>} - Objeto con el sentimiento detectado
 */
const analyzeSentiment = async (message) => {
    try {
        // Usar el servicio de prompts para analizar sentimiento
        const response = await promptService.queryModel({
            systemPrompt: promptService.loadTemplate('sentiment-analysis'),
            userPrompt: message
        }, {
            temperature: 0.1
        });

        // Extraer el JSON de la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No se encontró un formato JSON válido en la respuesta');
        }
        
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        logger.error(`Error al analizar sentimiento: ${error.message}`);
        // Devolver un sentimiento neutral por defecto
        return { sentiment: 'neutral', intensity: 'baja' };
    }
};

// Exportar funciones
module.exports = {
    detectIntents,
    prioritizeIntents,
    getPrimaryIntent,
    analyzeSentiment
};