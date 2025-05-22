/**
 * Servicio para la gestión y construcción de prompts
 * Centraliza la lógica de construcción de prompts para diferentes propósitos
 */

const fetch = require('node-fetch');
const { logger } = require('../utils/logger');
const { generalConfig } = require('../config/promptConfig');
const { loadTemplate, renderTemplate } = require('../utils/promptTemplates');

/**
 * Envía un prompt al modelo LLM y obtiene la respuesta
 * @param {Object} promptData - Datos del prompt a enviar
 * @param {string} promptData.systemPrompt - Instrucciones del sistema para el modelo
 * @param {string} promptData.userPrompt - Mensaje del usuario
 * @param {string} promptData.assistantPrompt - Mensaje previo del asistente (opcional)
 * @param {Object} options - Opciones adicionales para la llamada a la API
 * @returns {Promise<string>} - Respuesta del modelo
 */
async function queryModel(promptData, options = {}) {
    try {
        // Preparar los mensajes en formato compatible con Ollama
        const messages = [
            { role: 'system', content: promptData.systemPrompt }
        ];

        // Agregar historial de conversación si existe
        if (promptData.conversationHistory && promptData.conversationHistory.length > 0) {
            messages.push(...promptData.conversationHistory);
        }

        // Agregar mensaje del asistente si existe
        if (promptData.assistantPrompt) {
            messages.push({ role: 'assistant', content: promptData.assistantPrompt });
        }

        // Agregar mensaje del usuario
        messages.push({ role: 'user', content: promptData.userPrompt });

        // Configurar los parámetros del modelo
        const modelParams = {
            model: options.model || generalConfig.model,
            messages: messages,
            stream: false,
            temperature: options.temperature !== undefined ? options.temperature : generalConfig.temperature,
            max_tokens: options.maxTokens || generalConfig.maxTokens
        };

        logger.debug(`Enviando prompt a Ollama: ${JSON.stringify(modelParams)}`);

        // Enviar el prompt a la API de Ollama
        const response = await fetch(`${process.env.OLLAMA_API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(modelParams),
            timeout: (options.maxResponseTime || generalConfig.maxResponseTime) * 1000
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error en la API de Ollama: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        return data.message.content;
    } catch (error) {
        logger.error(`Error al consultar el modelo LLM: ${error.message}`);
        // Si es un error de timeout, proporcionar un mensaje específico
        if (error.type === 'request-timeout' || error.message.includes('timeout')) {
            throw new Error(`La respuesta del modelo LLM excedió el tiempo límite de ${options.maxResponseTime || generalConfig.maxResponseTime} segundos.`);
        }
        throw error;
    }
}

/**
 * Construye y envía un prompt para detectar intenciones
 * @param {string} message - Mensaje del usuario
 * @param {string} templateName - Nombre de la plantilla a utilizar (opcional)
 * @param {Object} variables - Variables para renderizar la plantilla (opcional)
 * @returns {Promise<Object>} - Respuesta del modelo con intenciones detectadas
 */
async function detectIntentions(message, templateName = 'intent-detection', variables = {}) {
    try {
        // Cargar la plantilla base para detección de intenciones
        const template = loadTemplate(templateName);
        
        // Renderizar la plantilla con las variables proporcionadas y el mensaje del usuario
        const systemPrompt = renderTemplate(template, {
            ...variables,
            message
        });

        // Construir el mensaje del usuario (simplemente el mensaje original)
        const userPrompt = message;

        // Enviar el prompt al modelo
        const response = await queryModel({
            systemPrompt,
            userPrompt
        }, {
            temperature: 0.1 // Temperatura baja para resultados más predecibles
        });

        // Analizar la respuesta para extraer las intenciones detectadas
        return parseIntentResponse(response);
    } catch (error) {
        logger.error(`Error al detectar intenciones: ${error.message}`);
        // En caso de error, devolver un objeto vacío con intenciones
        return { intents: [] };
    }
}

/**
 * Construye y envía un prompt para extraer entidades
 * @param {string} message - Mensaje del usuario
 * @param {string} templateName - Nombre de la plantilla a utilizar (opcional)
 * @param {Object} variables - Variables para renderizar la plantilla (opcional)
 * @returns {Promise<Object>} - Respuesta del modelo con entidades extraídas
 */
async function extractEntities(message, templateName = 'entity-extraction', variables = {}) {
    try {
        // Cargar la plantilla base para extracción de entidades
        const template = loadTemplate(templateName);
        
        // Renderizar la plantilla con las variables proporcionadas y el mensaje del usuario
        const systemPrompt = renderTemplate(template, {
            ...variables,
            message
        });

        // Construir el mensaje del usuario (simplemente el mensaje original)
        const userPrompt = message;

        // Enviar el prompt al modelo
        const response = await queryModel({
            systemPrompt,
            userPrompt
        }, {
            temperature: 0.1 // Temperatura baja para resultados más predecibles
        });

        // Analizar la respuesta para extraer las entidades
        return parseEntityResponse(response);
    } catch (error) {
        logger.error(`Error al extraer entidades: ${error.message}`);
        // En caso de error, devolver un objeto vacío
        return {};
    }
}

/**
 * Construye y envía un prompt para generar una respuesta para el usuario final
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @param {Object} conversationContext - Contexto de la conversación
 * @param {string} templateName - Nombre de la plantilla a utilizar (opcional)
 * @returns {Promise<string>} - Respuesta generada para el usuario
 */
async function generateResponse(message, intents, entities, userData, conversationContext, templateName = 'user-response') {
    try {
        // Cargar la plantilla base para generación de respuestas
        const template = loadTemplate(templateName);
        
        // Renderizar la plantilla con todos los datos relevantes
        const systemPrompt = renderTemplate(template, {
            message,
            intents,
            entities,
            userData,
            context: conversationContext,
            serviceMetadata: generalConfig.serviceMetadata
        });

        // Construir el mensaje del usuario (incluyendo el contexto de la conversación)
        const userPrompt = `${message}\n\nContexto: ${JSON.stringify({
            intents, 
            entities,
            userData: userData ? {
                name: userData.name,
                registrationDate: userData.registrationDate,
                lastActivity: userData.lastActivity
            } : null,
            conversationState: conversationContext.conversationState
        })}`;

        // Enviar el prompt al modelo
        const response = await queryModel({
            systemPrompt,
            userPrompt,
            // Incluir histórico de conversación si está disponible
            conversationHistory: conversationContext.conversationHistory
        }, {
            temperature: 0.7 // Temperatura más alta para respuestas más creativas
        });

        return response;
    } catch (error) {
        logger.error(`Error al generar respuesta: ${error.message}`);
        // En caso de error, devolver una respuesta genérica
        return "Lo siento, estoy teniendo problemas para procesar tu solicitud en este momento. Por favor, intenta de nuevo más tarde.";
    }
}

/**
 * Parsea la respuesta del modelo para extraer intenciones
 * @param {string} response - Respuesta del modelo
 * @returns {Object} - Objeto con intenciones detectadas
 */
function parseIntentResponse(response) {
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
}

/**
 * Parsea la respuesta del modelo para extraer entidades
 * @param {string} response - Respuesta del modelo
 * @returns {Object} - Objeto con entidades extraídas
 */
function parseEntityResponse(response) {
    try {
        // Extraer el JSON de la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.error(`No se encontró un formato JSON válido en la respuesta: ${response}`);
            return {};
        }
        
        const entities = JSON.parse(jsonMatch[0]);
        
        // Validar que sea un objeto
        if (typeof entities !== 'object' || entities === null) {
            logger.error(`La respuesta no es un objeto: ${response}`);
            return {};
        }
        
        return entities;
    } catch (error) {
        logger.error(`Error al parsear respuesta de entidades: ${error.message}`);
        logger.error(`Respuesta original: ${response}`);
        return {};
    }
}

/**
 * Evalúa la calidad de la respuesta del modelo
 * @param {string} response - Respuesta del modelo
 * @param {Object} expectedFormat - Formato esperado de la respuesta
 * @returns {boolean} - Indica si la respuesta cumple con el formato esperado
 */
function validateResponse(response, expectedFormat) {
    // Esta función puede implementarse para validar respuestas del modelo
    // y asegurar que cumplan con el formato esperado
    return true;
}

// Exportar funciones
module.exports = {
    queryModel,
    detectIntentions,
    extractEntities,
    generateResponse,
    parseIntentResponse,
    parseEntityResponse,
    validateResponse
};