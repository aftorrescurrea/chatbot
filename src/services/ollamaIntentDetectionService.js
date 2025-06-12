/**
 * Servicio especializado en detección de intenciones usando Ollama
 * Optimizado para mejorar precisión y rendimiento
 */

const fetch = require('node-fetch');
const { logger } = require('../utils/logger');
const intentService = require('./intentService');
const { getNlpDetectionProfile } = require('../config/promptProfilesConfig');

// Configuración del servicio
const CONFIG = {
    model: process.env.OLLAMA_INTENT_MODEL || process.env.OLLAMA_MODEL || 'llama3:8b',
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
    maxRetries: 3,
    retryDelay: 2000,
    timeout: 30000,
    temperature: 0.1, // Temperatura baja para respuestas más deterministas
    topP: 0.9,
    topK: 50
};

/**
 * Pausa la ejecución por un tiempo determinado
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Crea un prompt optimizado para detección de intenciones
 * @param {string} message - Mensaje del usuario
 * @param {Object} nlpData - Datos de intenciones (supportedIntents, intentExamples, etc)
 * @param {Object} context - Contexto conversacional (opcional)
 * @returns {string} - Prompt optimizado
 */
function createOptimizedPrompt(message, nlpData, context = null) {
    try {
        // Intentar usar el perfil especializado de NLP si está disponible
        const nlpProfile = getNlpDetectionProfile();
        
        if (nlpProfile && nlpProfile.systemPrompt) {
            // Usar el prompt del perfil especializado, pero agregar la información específica de intenciones
            let prompt = nlpProfile.systemPrompt;
            
            // Agregar la lista de intenciones soportadas
            prompt += `\n\nINTENCIONES ESPECÍFICAS PARA ESTA SOLICITUD:\n${nlpData.supportedIntents.join('\n')}\n`;
            
            // Agregar ejemplos de intenciones si están disponibles
            if (nlpData.intentExamples && Object.keys(nlpData.intentExamples).length > 0) {
                prompt += `\nEJEMPLOS DE INTENCIONES ESPECÍFICAS:\n`;
                
                Object.entries(nlpData.intentExamples).slice(0, 10).forEach(([intent, examples]) => {
                    if (examples && examples.length > 0) {
                        const exampleText = examples.slice(0, 2).map(ex => `  "${ex}"`).join(', ');
                        prompt += `- ${intent}: ${exampleText}\n`;
                    }
                });
            }
            
            // Simplificar el formato de respuesta para este caso específico
            prompt += `\nPara esta tarea específica, SIMPLIFICA tu respuesta a: {"intents": ["intencion1", "intencion2"]}\n`;
            
            // Finalizar el prompt con el mensaje del usuario
            prompt += `\nMensaje del usuario: "${message}"\n\nRespuesta (solo JSON):`;
            
            return prompt;
        }
        
        // Si no está disponible el perfil especializado, usar el prompt base original
        const intentList = nlpData.supportedIntents
            .map(intent => {
                const examples = nlpData.intentExamples[intent];
                if (examples && examples.length > 0) {
                    // Limitar a 3 ejemplos por intención para mantener el prompt corto
                    const examplesList = examples.slice(0, 3).map(ex => `  - "${ex}"`).join('\n');
                    return `**${intent}**:\n${examplesList}`;
                }
                return `**${intent}**`;
            })
            .join('\n\n');

        // Construir prompt base
        let prompt = `Eres un especialista en detección de intenciones en mensajes. Tu tarea es identificar exactamente qué intenciones están presentes en el mensaje del usuario.

INSTRUCCIONES:
- Analiza cuidadosamente el mensaje del usuario
- Identifica TODAS las intenciones presentes
- Responde ÚNICAMENTE con un objeto JSON con el formato: {"intents": ["intencion1", "intencion2"]}
- No agregues explicaciones ni texto adicional

INTENCIONES DISPONIBLES:
${nlpData.supportedIntents.join('\n')}

EJEMPLOS DE INTENCIONES:
${intentList}

REGLAS:
- Un mensaje puede contener múltiples intenciones simultáneamente
- Si no estás seguro, no incluyas la intención
- Usa EXACTAMENTE los nombres de intenciones proporcionados
- Responde SOLO con JSON válido, nada más

`;

    // Agregar contexto conversacional si está disponible
    if (context) {
        prompt += `\nCONTEXTO CONVERSACIONAL:
- Tema actual: ${context.currentTopic || 'Ninguno'}
- Últimas intenciones: ${context.recentIntents ? JSON.stringify(context.recentIntents) : '[]'}
- Fuerza del contexto: ${context.contextStrength || 0}

CONSIDERA EL CONTEXTO:
- Si el mensaje es ambiguo, el tema actual puede ayudar a determinar la intención
- Si el usuario está confirmando algo, considera qué está confirmando según el contexto
`;

        // Agregar mensajes recientes si están disponibles
        if (context.recentMessages && context.recentMessages.length > 0) {
            prompt += `\nMENSAJES RECIENTES:
${context.recentMessages.map(m => `${m.isFromUser ? 'Usuario' : 'Bot'}: "${m.message}"`).join('\n')}
`;
        }
    }

        // Finalizar el prompt
        prompt += `\nMensaje del usuario: "${message}"

Respuesta (solo JSON):`;

        return prompt;
    } catch (error) {
        logger.error(`Error al crear prompt optimizado: ${error.message}`);
        
        // Prompt de fallback simple en caso de error
        return `Detecta intenciones en este mensaje: "${message}"\nResponde con formato JSON: {"intents": ["intent1", "intent2"]}`;
    }
}

/**
 * Detecta intenciones en un mensaje usando Ollama
 * @param {string} message - Mensaje del usuario
 * @param {Object} context - Contexto conversacional (opcional)
 * @returns {Promise<Object>} - Objeto con intenciones detectadas
 */
async function detectIntentions(message, context = null) {
    try {
        // Obtener datos de intenciones de la base de datos
        const nlpData = await intentService.getIntentsForNLP();
        
        // Crear prompt optimizado
        const prompt = createOptimizedPrompt(message, nlpData, context);
        
        // Enviar solicitud a Ollama
        const result = await queryOllama(prompt);
        
        // Parsear resultado
        return parseIntentResponse(result, nlpData);
    } catch (error) {
        logger.error(`Error en detección de intenciones con Ollama: ${error.message}`);
        return { intents: [] };
    }
}

/**
 * Envía una consulta a Ollama
 * @param {string} prompt - Prompt completo a enviar
 * @returns {Promise<string>} - Respuesta de Ollama
 */
async function queryOllama(prompt) {
    const maxRetries = CONFIG.maxRetries;
    
    // Intentar obtener configuración del perfil NLP
    let temperature = CONFIG.temperature;
    let model = CONFIG.model;
    
    try {
        const nlpProfile = getNlpDetectionProfile();
        if (nlpProfile) {
            if (nlpProfile.temperature) temperature = nlpProfile.temperature;
            if (nlpProfile.model) model = nlpProfile.model;
            logger.debug(`Usando configuración de perfil NLP: modelo=${model}, temperatura=${temperature}`);
        }
    } catch (error) {
        logger.debug(`Usando configuración predeterminada: ${error.message}`);
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.debug(`Intento ${attempt}/${maxRetries} de consulta a Ollama`);
            
            const requestBody = {
                model: model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: temperature,
                    top_p: CONFIG.topP,
                    top_k: CONFIG.topK,
                    // Detener generación al encontrar estos tokens
                    stop: ['\nUsuario:', '\nUser:', '```']
                }
            };
            
            logger.debug(`Enviando request a: ${CONFIG.apiUrl}/api/generate`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
            
            const response = await fetch(`${CONFIG.apiUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            return data.response || '';
            
        } catch (error) {
            logger.error(`Error en intento ${attempt}/${maxRetries}: ${error.message}`);
            
            // Si es el último intento, propagar el error
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Esperar antes del siguiente intento con backoff exponencial
            const delay = CONFIG.retryDelay * Math.pow(2, attempt - 1);
            logger.info(`Esperando ${delay}ms antes del siguiente intento...`);
            await sleep(delay);
        }
    }
    
    throw new Error('Se agotaron todos los intentos de conexión con Ollama');
}

/**
 * Parsea la respuesta del modelo para extraer intenciones
 * @param {string} response - Respuesta del modelo
 * @param {Object} nlpData - Datos de intenciones de la base de datos
 * @returns {Object} - Objeto con intenciones detectadas
 */
function parseIntentResponse(response, nlpData) {
    try {
        // Buscar JSON en la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const jsonResponse = JSON.parse(jsonMatch[0]);
            
            if (jsonResponse.intents && Array.isArray(jsonResponse.intents)) {
                // Filtrar intenciones válidas
                const validIntents = jsonResponse.intents.filter(intent => 
                    nlpData.supportedIntents.includes(intent)
                );
                
                return { 
                    intents: validIntents,
                    rawResponse: response
                };
            }
        }
        
        // Si no se puede parsear correctamente, buscar menciones de intenciones en el texto
        const intents = [];
        nlpData.supportedIntents.forEach(intent => {
            if (response.includes(`"${intent}"`) || response.includes(`'${intent}'`)) {
                intents.push(intent);
            }
        });
        
        return { 
            intents: intents,
            rawResponse: response,
            parseError: !jsonMatch
        };
    } catch (error) {
        logger.error(`Error al parsear respuesta de intenciones: ${error.message}`);
        
        // Intento de recuperación básico: buscar menciones de intenciones en el texto
        const intents = [];
        if (nlpData && nlpData.supportedIntents) {
            nlpData.supportedIntents.forEach(intent => {
                if (response.includes(`"${intent}"`) || response.includes(`'${intent}'`)) {
                    intents.push(intent);
                }
            });
        }
        
        return { 
            intents: intents, 
            rawResponse: response,
            parseError: true
        };
    }
}

/**
 * Post-procesa los resultados de detección de intenciones usando patrones de la base de datos
 * @param {string} message - Mensaje original del usuario
 * @param {Object} result - Resultado de la detección de intenciones
 * @param {Object} nlpData - Datos de intenciones de la base de datos
 * @returns {Object} - Resultado procesado
 */
function postProcessIntentDetection(message, result, nlpData) {
    if (!result || !message || !nlpData) return result;
    
    // Crear una copia del resultado para no modificar el original
    const processedResult = { ...result };
    if (!processedResult.intents) processedResult.intents = [];
    
    // Convertir mensaje a minúsculas para comparación
    const messageLower = message.toLowerCase().trim();
    
    // Aplicar detección basada en patrones de la base de datos
    if (nlpData.detectionPatterns) {
        Object.entries(nlpData.detectionPatterns).forEach(([intentName, patterns]) => {
            // Si la intención ya está detectada, no hacer nada
            if (processedResult.intents.includes(intentName)) return;
            
            // Verificar si el mensaje coincide con algún patrón
            const matchesPattern = patterns.some(pattern =>
                messageLower.includes(pattern.toLowerCase()));
            
            if (matchesPattern) {
                logger.info(`Detección basada en patrones: Añadiendo '${intentName}' al mensaje "${message}"`);
                processedResult.intents.push(intentName);
            }
        });
    }
    
    // Aplicar relaciones entre intenciones
    if (nlpData.intentRelationships) {
        // Hacer una copia de las intenciones detectadas para no modificarlas durante la iteración
        const detectedIntents = [...processedResult.intents];
        
        detectedIntents.forEach(detectedIntent => {
            const relationships = nlpData.intentRelationships[detectedIntent];
            
            if (relationships && Array.isArray(relationships)) {
                relationships.forEach(relation => {
                    // Verificar si ya está incluida la intención relacionada
                    if (processedResult.intents.includes(relation.intent)) return;
                    
                    let shouldAdd = false;
                    
                    if (relation.condition === 'always') {
                        shouldAdd = true;
                    } else if (relation.condition === 'contains' && relation.keywords) {
                        // Verificar si el mensaje contiene alguna de las palabras clave
                        shouldAdd = relation.keywords.some(keyword =>
                            messageLower.includes(keyword.toLowerCase()));
                    }
                    
                    if (shouldAdd) {
                        logger.info(`Relación de intenciones: Añadiendo '${relation.intent}' basado en '${detectedIntent}'`);
                        processedResult.intents.push(relation.intent);
                    }
                });
            }
        });
    }
    
    return processedResult;
}

/**
 * Verifica la conexión con Ollama
 * @returns {Promise<boolean>} - True si la conexión es exitosa
 */
async function testConnection() {
    try {
        // Usar un prompt simple para verificar conexión
        const response = await queryOllama("Responde exactamente con '{}' y nada más.");
        logger.info(`Test de conexión exitoso. Respuesta: ${response}`);
        return true;
    } catch (error) {
        logger.error(`Test de conexión fallido: ${error.message}`);
        return false;
    }
}

/**
 * Obtiene información sobre el modelo configurado
 * @returns {Promise<Object>} - Información del modelo
 */
async function getModelInfo() {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: CONFIG.model })
        });

        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }

        const data = await response.json();
        return {
            model: data.model || CONFIG.model,
            modified: data.modified || 'unknown',
            size: data.size || 'unknown',
            quantization: data.quantization || 'unknown',
            format: data.format || 'unknown'
        };
    } catch (error) {
        logger.error(`Error al obtener información del modelo: ${error.message}`);
        return {
            model: CONFIG.model,
            error: error.message
        };
    }
}

module.exports = {
    CONFIG,
    detectIntentions,
    testConnection,
    getModelInfo,
    createOptimizedPrompt,
    postProcessIntentDetection
};