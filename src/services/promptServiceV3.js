/**
 * Servicio de prompts v3 con soporte para perfiles dinámicos según intenciones
 * Extiende promptServiceV2 con la capacidad de usar diferentes prompts según el tipo de solicitud
 */

const fetch = require('node-fetch');
const { logger } = require('../utils/logger');
const { renderTemplate } = require('../utils/promptTemplates');
const { getPromptProfileForIntents } = require('../config/promptProfilesConfig');

// Importar configuración base de promptServiceV2
const promptServiceV2 = require('./promptServiceV2');

// Configuración del servicio
const CONFIG = {
    ...promptServiceV2.CONFIG,
    // Activar uso de perfiles por defecto
    usePromptProfiles: true,
    // Factor de aumento de tokens según el perfil
    tokenMultiplier: {
        support: 1.5,   // Más tokens para soporte técnico (respuestas detalladas)
        credit: 1.2,    // Tokens extra para temas de crédito (precisión)
        general: 1.0,   // Baseline para general
        tutorial: 1.7   // Muchos tokens para tutoriales (paso a paso)
    }
};

/**
 * Consulta al modelo usando perfiles dinámicos según intenciones
 * @param {Array} messages - Array de mensajes con roles
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<string>} - Respuesta del modelo
 */
async function queryModelWithProfile(messages, options = {}) {
    try {
        // Si hay intenciones detectadas, seleccionar el perfil adecuado
        const detectedIntents = options.detectedIntents || [];
        const profile = options.profile || getPromptProfileForIntents(detectedIntents);
        
        logger.debug(`Usando perfil de prompt: ${profile.intentCategories[0] || 'default'}`);
        
        // Aplicar configuración específica del perfil
        const profileOptions = {
            ...options,
            temperature: profile.temperature || CONFIG.temperature,
            // Ajustar max_tokens según el perfil
            max_tokens: options.max_tokens ? 
                Math.ceil(options.max_tokens * (CONFIG.tokenMultiplier[profile.intentCategories[0]] || 1.0)) : 
                undefined
        };
        
        // Si hay un system message, reemplazarlo con el del perfil
        if (profile.systemPrompt && messages.length > 0 && messages[0].role === 'system') {
            messages[0].content = profile.systemPrompt;
        }
        
        // Usar el método de promptServiceV2
        return await promptServiceV2.queryModel(messages, profileOptions);
    } catch (error) {
        logger.error(`Error en queryModelWithProfile: ${error.message}`);
        // Fallback al método estándar
        return await promptServiceV2.queryModel(messages, options);
    }
}

/**
 * Detecta las intenciones usando perfiles dinámicos
 * @param {string} message - Mensaje del usuario
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las intenciones detectadas
 */
async function detectIntentions(message, templateName = 'intent-detection', variables = {}, options = {}) {
    // Usar implementación estándar para detección de intenciones
    // No usamos perfil aquí porque estamos detectando intenciones
    return await promptServiceV2.detectIntentions(message, templateName, variables, options);
}

/**
 * Detecta intenciones con contexto usando la implementación estándar
 * @param {string} message - Mensaje del usuario
 * @param {Object} context - Contexto conversacional
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las intenciones detectadas
 */
async function detectIntentionsWithContext(message, context, templateName = 'contextual-intent-detection', variables = {}, options = {}) {
    // Usar implementación estándar para detección de intenciones con contexto
    return await promptServiceV2.detectIntentionsWithContext(message, context, templateName, variables, options);
}

/**
 * Extrae entidades usando la implementación estándar
 * @param {string} message - Mensaje del usuario
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las entidades extraídas
 */
async function extractEntities(message, templateName = 'entity-extraction', variables = {}, options = {}) {
    // Usar implementación estándar para extracción de entidades
    return await promptServiceV2.extractEntities(message, templateName, variables, options);
}

/**
 * Extrae entidades con contexto usando la implementación estándar
 * @param {string} message - Mensaje del usuario
 * @param {Object} context - Contexto conversacional
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las entidades extraídas
 */
async function extractEntitiesWithContext(message, context, templateName = 'contextual-entity-extraction', variables = {}, options = {}) {
    // Usar implementación estándar para extracción de entidades con contexto
    return await promptServiceV2.extractEntitiesWithContext(message, context, templateName, variables, options);
}

/**
 * Genera una respuesta contextual usando perfiles según intenciones
 * @param {string} message - Mensaje original del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Información del usuario
 * @param {Object} conversationContext - Contexto de la conversación
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<string>} - Respuesta generada
 */
async function generateResponse(message, intents, entities, userData = null, conversationContext = {}, options = {}) {
    try {
        // Si no está activado el uso de perfiles, usar implementación estándar
        if (!CONFIG.usePromptProfiles) {
            return await promptServiceV2.generateResponse(message, intents, entities, userData, conversationContext, options);
        }
        
        const messages = [];
        
        // Seleccionar el perfil basado en intenciones
        const profile = getPromptProfileForIntents(intents);
        
        // Mensaje del sistema con instrucciones del perfil
        const systemMessage = {
            role: "system",
            content: profile.systemPrompt
        };
        
        messages.push(systemMessage);
        
        // Si hay historial de conversación, incluir algunos mensajes relevantes
        if (conversationContext.recentMessages && conversationContext.recentMessages.length > 0) {
            // Incluir los últimos 2-3 intercambios para mantener contexto
            const recentMessages = conversationContext.recentMessages.slice(-6);
            recentMessages.forEach(msg => {
                messages.push({
                    role: msg.isFromUser ? "user" : "assistant",
                    content: msg.message
                });
            });
        }
        
        // Mensaje del usuario con información adicional
        let contextInfo = '';
        
        if (Object.keys(entities).length > 0) {
            contextInfo += '\\nEntidades detectadas: ' + JSON.stringify(entities);
        }
        
        if (userData) {
            contextInfo += '\\nDatos de usuario: ' + JSON.stringify({
                nombre: userData.name,
                email: userData.email,
                empresa: userData.company,
                cargo: userData.position
            });
        }
        
        if (conversationContext.currentTopic) {
            contextInfo += '\\nTema actual: ' + conversationContext.currentTopic;
        }
        
        const userMessage = {
            role: "user",
            content: message + (contextInfo ? `\n\n[CONTEXTO INTERNO: ${contextInfo}]` : '')
        };
        
        messages.push(userMessage);
        
        // Usar el método con perfil
        const response = await queryModelWithProfile(messages, {
            temperature: profile.temperature || 0.7,
            detectedIntents: intents,
            profile: profile
        });
        
        return response.trim();
    } catch (error) {
        logger.error(`Error al generar respuesta con perfil: ${error.message}`);
        // Fallback a la implementación estándar
        return await promptServiceV2.generateResponse(message, intents, entities, userData, conversationContext, options);
    }
}

/**
 * Genera una respuesta específica para un flujo de crédito
 * @param {string} message - Mensaje original del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} creditData - Información crediticia relevante
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {Promise<string>} - Respuesta generada
 */
async function generateCreditResponse(message, intents, entities, creditData = {}, conversationContext = {}) {
    try {
        const messages = [];
        
        // Usar el perfil de crédito
        const creditProfile = require('../config/promptProfilesConfig').promptProfiles.credit;
        
        // Mensaje del sistema
        messages.push({
            role: "system",
            content: creditProfile.systemPrompt
        });
        
        // Historial reciente si existe
        if (conversationContext.recentMessages && conversationContext.recentMessages.length > 0) {
            const recentMessages = conversationContext.recentMessages.slice(-4);
            recentMessages.forEach(msg => {
                messages.push({
                    role: msg.isFromUser ? "user" : "assistant",
                    content: msg.message
                });
            });
        }
        
        // Crear mensaje enriquecido con datos de crédito
        let creditContext = '';
        
        if (Object.keys(creditData).length > 0) {
            creditContext += '\\nDatos de crédito: ' + JSON.stringify(creditData);
        }
        
        if (Object.keys(entities).length > 0) {
            creditContext += '\\nEntidades detectadas: ' + JSON.stringify(entities);
        }
        
        // Mensaje del usuario
        messages.push({
            role: "user",
            content: message + (creditContext ? `\n\n[CONTEXTO FINANCIERO: ${creditContext}]` : '')
        });
        
        // Opciones específicas para respuestas de crédito
        const options = {
            temperature: 0.2,  // Baja temperatura para respuestas precisas
            detectedIntents: intents,
            profile: creditProfile
        };
        
        const response = await queryModelWithProfile(messages, options);
        
        return response.trim();
    } catch (error) {
        logger.error(`Error al generar respuesta de crédito: ${error.message}`);
        return "Lo siento, no puedo procesar información de crédito en este momento. Por favor, intenta más tarde o contacta a un asesor.";
    }
}

/**
 * Verifica la conexión con el servicio
 * @returns {Promise<Object>} - Estado de la conexión
 */
async function testConnection() {
    try {
        const result = await promptServiceV2.testConnection();
        // Asegurarse de que devuelve un objeto con status
        return {
            status: result?.status || 'OK',
            model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
            timestamp: new Date().toISOString(),
            version: 'v3'
        };
    } catch (error) {
        logger.error(`Error al probar conexión: ${error.message}`);
        return {
            status: 'ERROR',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Obtiene información del modelo
 * @returns {Promise<Object>} - Información del modelo
 */
async function getModelInfo() {
    return await promptServiceV2.getModelInfo();
}

module.exports = {
    CONFIG,
    detectIntentions,
    detectIntentionsWithContext,
    extractEntities,
    extractEntitiesWithContext,
    generateResponse,
    generateCreditResponse,
    queryModel: queryModelWithProfile,
    testConnection,
    getModelInfo
};