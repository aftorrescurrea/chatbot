/**
 * Servicio de prompts mejorado v2 - Versión estable
 * Usa la estructura mejorada pero con la API generate por defecto para mayor estabilidad
 */

const fetch = require('node-fetch');
const { logger } = require('../utils/logger');
const { renderTemplate } = require('../utils/promptTemplates');

// Configuración del servicio
const CONFIG = {
    maxRetries: 3,
    retryDelay: 2000, // 2 segundos
    timeout: 600000, // 5 minutos
    temperature: 0.2,
    topP: 0.9,
    topK: 40,
    // Por defecto usar generate para estabilidad, cambiar a true para probar chat
    useChatAPI: true
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
 * Verifica si el error es debido a que el modelo se está cargando
 * @param {string} errorMessage - Mensaje de error
 * @returns {boolean}
 */
function isModelLoadingError(errorMessage) {
    return errorMessage.includes('llm server loading model') || 
           errorMessage.includes('model loading') ||
           errorMessage.includes('server loading') ||
           errorMessage.includes('loading');
}

/**
 * Consulta al modelo usando la API de generate con formato mejorado
 * @param {Object} promptData - Datos del prompt
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<string>} - Respuesta del modelo
 */
async function queryModelGenerate(promptData, options = {}) {
    const maxRetries = options.maxRetries || CONFIG.maxRetries;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.debug(`Intento ${attempt}/${maxRetries} de consulta al modelo (generate API)`);
            
            let fullPrompt = '';
            
            // Si vienen mensajes en formato de chat, convertirlos
            if (Array.isArray(promptData)) {
                const systemMessage = promptData.find(m => m.role === 'system');
                const conversationParts = [];
                
                if (systemMessage) {
                    conversationParts.push(`Sistema: ${systemMessage.content}`);
                }
                
                // Incluir historial de conversación si existe
                promptData.forEach(msg => {
                    if (msg.role === 'user') {
                        conversationParts.push(`Usuario: ${msg.content}`);
                    } else if (msg.role === 'assistant' && msg !== systemMessage) {
                        conversationParts.push(`Asistente: ${msg.content}`);
                    }
                });
                
                fullPrompt = conversationParts.join('\n\n') + '\nAsistente:';
            } else {
                // Formato antiguo
                fullPrompt = promptData.systemPrompt 
                    ? `Sistema: ${promptData.systemPrompt}\n\nUsuario: ${promptData.userPrompt}\nAsistente:`
                    : promptData.userPrompt;
            }
            
            const requestBody = {
                model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
                prompt: fullPrompt,
                stream: false,
                options: {
                    temperature: options.temperature || CONFIG.temperature,
                    top_p: CONFIG.topP,
                    top_k: CONFIG.topK,
                    stop: ['\nUsuario:', '\nUser:', '\nSistema:']
                }
            };
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
            
            const response = await fetch(`${process.env.OLLAMA_API_URL}/generate`, {
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
                const error = new Error(`Error HTTP ${response.status}: ${errorText}`);
                
                // Si es error de modelo cargando y no es el último intento
                if (isModelLoadingError(errorText) && attempt < maxRetries) {
                    logger.warn(`Modelo cargando, esperando ${CONFIG.retryDelay * attempt}ms antes del siguiente intento...`);
                    await sleep(CONFIG.retryDelay * attempt);
                    continue;
                }
                
                throw error;
            }
            
            const data = await response.json();
            return data.response || '';
            
        } catch (error) {
            logger.error(`Error en intento ${attempt}/${maxRetries}: ${error.message}`);
            
            if (attempt === maxRetries || (!isModelLoadingError(error.message) && error.name !== 'AbortError')) {
                if (error.name === 'AbortError') {
                    throw new Error(`Timeout: La respuesta del modelo excedió el tiempo límite de ${CONFIG.timeout}ms`);
                }
                throw error;
            }
            
            const delay = CONFIG.retryDelay * Math.pow(2, attempt - 1);
            logger.info(`Esperando ${delay}ms antes del siguiente intento...`);
            await sleep(delay);
        }
    }
    
    throw new Error('Se agotaron todos los intentos de conexión con Ollama');
}

/**
 * Consulta al modelo - interfaz unificada
 * @param {Object|Array} promptData - Datos del prompt o array de mensajes
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<string>} - Respuesta del modelo
 */
async function queryModel(promptData, options = {}) {
    return await queryModelGenerate(promptData, options);
}

/**
 * Detecta las intenciones usando el formato mejorado
 * @param {string} message - Mensaje del usuario
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las intenciones detectadas
 */
async function detectIntentions(message, templateName = 'intent-detection', variables = {}, options = {}) {
    try {
        const systemContent = renderTemplate(
            require('../utils/promptTemplates').baseTemplates[templateName] || 
            require('../utils/promptTemplates').baseTemplates['intent-detection'],
            variables
        );

        const messages = [
            {
                role: "system",
                content: systemContent
            },
            {
                role: "user",
                content: message
            }
        ];

        const response = await queryModel(messages, options);
        
        return parseIntentResponse(response);
    } catch (error) {
        logger.error(`Error al detectar intenciones: ${error.message}`);
        return { intents: [] };
    }
}

/**
 * Detecta intenciones con contexto conversacional
 * @param {string} message - Mensaje del usuario
 * @param {Object} context - Contexto conversacional
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las intenciones detectadas
 */
async function detectIntentionsWithContext(message, context, templateName = 'contextual-intent-detection', variables = {}, options = {}) {
    try {
        // Construir el historial de mensajes incluyendo el contexto
        const messages = [];
        
        // Plantilla contextual mejorada
        const contextualTemplate = `
Eres un especialista en análisis de intenciones para un chatbot de WhatsApp que ayuda con un sistema {{serviceType}} empresarial.

### CONTEXTO CONVERSACIONAL ###
{{#if context.userProfile.isRegistered}}
Usuario registrado: {{context.userProfile.name}} ({{context.userProfile.email}})
{{#if context.userProfile.company}}Empresa: {{context.userProfile.company}}{{/if}}
{{#if context.userProfile.position}}Cargo: {{context.userProfile.position}}{{/if}}
{{else}}
Usuario no registrado
{{/if}}

{{#if context.knownEntities}}
Información conocida del usuario:
{{#each context.knownEntities}}
- {{@key}}: {{this}}
{{/each}}
{{/if}}

{{#if context.currentTopic}}
Tema actual de conversación: {{context.currentTopic}}
Fuerza del contexto: {{context.contextStrength}}
{{/if}}

### INSTRUCCIONES ###
Analiza el mensaje actual del usuario considerando TODO el contexto conversacional.

1. Identifica TODAS las intenciones presentes en el mensaje.
2. Considera si el usuario continúa con el tema actual o cambia de tema.
3. Si hay ambigüedad, prioriza la coherencia contextual.
4. Si el usuario confirma algo, considera qué está confirmando según el contexto.

INTENCIONES POSIBLES:
{{#each supportedIntents}}
- {{this}}
{{/each}}

### IMPORTANTE ###
- Considera SIEMPRE el contexto conversacional
- Si el usuario dice "sí", "correcto", "exacto" → probablemente es confirmación
- Si continúa el tema actual, incluye intenciones relacionadas
- Si cambia de tema abruptamente, detecta la nueva intención principal
- Un mensaje puede tener MÚLTIPLES intenciones simultáneamente

Formato de respuesta requerido:
{"intents": ["intencion1", "intencion2"]}`;

        const systemPrompt = renderTemplate(contextualTemplate, {
            ...variables,
            context: context
        });
        
        messages.push({
            role: "system",
            content: systemPrompt
        });
        
        // Agregar mensajes recientes del contexto si existen
        if (context.recentMessages && context.recentMessages.length > 0) {
            // Limitar a los últimos 4 mensajes para no sobrecargar
            const recentMessages = context.recentMessages.slice(-4);
            recentMessages.forEach(msg => {
                messages.push({
                    role: msg.isFromUser ? "user" : "assistant",
                    content: msg.message
                });
            });
        }
        
        // Agregar el mensaje actual del usuario
        messages.push({
            role: "user",
            content: message
        });

        const response = await queryModel(messages, options);
        
        const result = parseIntentResponse(response);
        
        // Agregar información contextual al resultado
        return {
            ...result,
            contextUsed: true,
            topicContinuity: context.currentTopic ? 
                result.intents.some(intent => getIntentsForTopic(context.currentTopic).includes(intent)) : 
                false
        };
    } catch (error) {
        logger.error(`Error al detectar intenciones con contexto: ${error.message}`);
        // Fallback a detección sin contexto
        return await detectIntentions(message, 'intent-detection', variables, options);
    }
}

/**
 * Extrae entidades
 * @param {string} message - Mensaje del usuario
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las entidades extraídas
 */
async function extractEntities(message, templateName = 'entity-extraction', variables = {}, options = {}) {
    try {
        const systemContent = renderTemplate(
            require('../utils/promptTemplates').baseTemplates[templateName] || 
            require('../utils/promptTemplates').baseTemplates['entity-extraction'],
            variables
        );

        const messages = [
            {
                role: "system",
                content: systemContent
            },
            {
                role: "user",
                content: message
            }
        ];

        const response = await queryModel(messages, options);
        
        return parseEntityResponse(response);
    } catch (error) {
        logger.error(`Error al extraer entidades: ${error.message}`);
        return {};
    }
}

/**
 * Extrae entidades con contexto
 * @param {string} message - Mensaje del usuario
 * @param {Object} context - Contexto conversacional
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las entidades extraídas
 */
async function extractEntitiesWithContext(message, context, templateName = 'contextual-entity-extraction', variables = {}, options = {}) {
    try {
        const messages = [];
        
        // Plantilla contextual para extracción de entidades
        const contextualTemplate = `
Eres un especialista en extracción de entidades para un chatbot empresarial de WhatsApp.

### CONTEXTO CONVERSACIONAL ###
{{#if context.userProfile.isRegistered}}
Usuario registrado: {{context.userProfile.name}} ({{context.userProfile.email}})
{{#if context.userProfile.company}}Empresa: {{context.userProfile.company}}{{/if}}
{{#if context.userProfile.position}}Cargo: {{context.userProfile.position}}{{/if}}
{{else}}
Usuario no registrado
{{/if}}

{{#if context.knownEntities}}
Entidades ya conocidas del usuario:
{{#each context.knownEntities}}
- {{@key}}: {{this}}
{{/each}}
{{/if}}

### INSTRUCCIONES ###
Extrae SOLO las entidades nuevas o actualizadas presentes en el mensaje actual.

ENTIDADES A BUSCAR:
{{#each supportedEntities}}
- {{this}}
{{/each}}

### REGLAS ESPECIALES ###
1. NO repitas entidades que ya están en el contexto a menos que el usuario las esté corrigiendo
2. Si el usuario dice "mi nombre es..." pero ya conocemos su nombre, considéralo como corrección
3. Si el usuario confirma información ("sí", "correcto"), NO extraigas entidades a menos que agregue información nueva
4. Prioriza información explícita sobre implícita
5. Si hay ambigüedad, no asumas

### IMPORTANTE ###
- Solo incluye entidades que REALMENTE encuentres en el mensaje actual
- No inventes información que no esté presente
- Considera el contexto para evitar duplicar información conocida
- Responde ÚNICAMENTE con JSON válido

Formato de respuesta requerido:
{"entidad": "valor"}`;

        const systemPrompt = renderTemplate(contextualTemplate, {
            ...variables,
            context: context
        });
        
        messages.push({
            role: "system",
            content: systemPrompt
        });
        
        // Agregar algunos mensajes recientes para contexto
        if (context.recentMessages && context.recentMessages.length > 0) {
            const recentMessages = context.recentMessages.slice(-4);
            recentMessages.forEach(msg => {
                messages.push({
                    role: msg.isFromUser ? "user" : "assistant",
                    content: msg.message
                });
            });
        }
        
        // Mensaje actual
        messages.push({
            role: "user",
            content: message
        });

        const response = await queryModel(messages, options);
        
        return parseEntityResponse(response);
    } catch (error) {
        logger.error(`Error al extraer entidades con contexto: ${error.message}`);
        // Fallback a extracción sin contexto
        return await extractEntities(message, 'entity-extraction', variables, options);
    }
}

/**
 * Genera una respuesta contextual
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
        const messages = [];
        
        // Mensaje del sistema con instrucciones y contexto
        const systemMessage = {
            role: "system",
            content: `Eres un asistente virtual profesional de WhatsApp para un sistema ERP empresarial llamado "ERP Demo".

Tu trabajo es ayudar a los usuarios con:
- Información sobre el servicio ERP
- Crear cuentas de prueba gratuitas (7 días)
- Resolver dudas técnicas básicas
- Proporcionar información de contacto para soporte avanzado

CARACTERÍSTICAS DEL ERP:
- Gestión de inventario
- Facturación electrónica
- Contabilidad integrada
- Recursos humanos
- Informes en tiempo real
- Integración con bancos
- Múltiples usuarios y permisos

INSTRUCCIONES:
1. Responde de forma amigable y profesional
2. Sé conciso pero informativo (máximo 3-4 oraciones)
3. Si el usuario solicita una prueba, guíalo para obtener: nombre, email, usuario deseado y contraseña
4. Para soporte técnico, solicita más detalles y proporciona contacto: soporte@erp-demo.ejemplo.com
5. Para precios, menciona que depende del número de usuarios y módulos, y que contacten a ventas@erp-demo.ejemplo.com
6. Si falta información para crear cuenta, pregunta específicamente por lo que falta
7. Usa un tono profesional pero cercano
8. No uses emojis excesivos (máximo 1-2 por mensaje)
9. Si conoces información del usuario, úsala apropiadamente en tu respuesta

MANEJO DE CONFIRMACIONES:
- Si el usuario confirma ("sí", "correcto", "exacto") y hay un flujo activo, continúa el proceso
- Si el usuario confirma información personal, agradece y continúa`
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
        
        // Mensaje del usuario con contexto adicional
        const userMessage = {
            role: "user",
            content: `[CONTEXTO]
Intenciones detectadas: ${JSON.stringify(intents)}
Entidades extraídas: ${JSON.stringify(entities)}
${userData ? `Usuario: ${userData.name} (${userData.email})` : 'Usuario no registrado'}
Estado: ${conversationContext.conversationState || 'Ninguno'}
Tema: ${conversationContext.currentTopic || 'General'}

[MENSAJE DEL USUARIO]
${message}

Por favor responde de manera apropiada considerando toda la información proporcionada.`
        };
        
        messages.push(userMessage);

        const response = await queryModel(messages, {
            ...options,
            temperature: 0.7 // Temperatura más alta para respuestas más creativas
        });
        
        return response.trim();
    } catch (error) {
        logger.error(`Error al generar respuesta: ${error.message}`);
        return "Lo siento, estoy teniendo problemas técnicos en este momento. Por favor, intenta de nuevo más tarde o contacta a nuestro equipo de soporte.";
    }
}

// Funciones auxiliares
function getIntentsForTopic(topic) {
    const topicIntentMapping = {
        'trial_request': ['solicitud_prueba', 'confirmacion', 'interes_en_servicio'],
        'technical_support': ['soporte_tecnico', 'queja'],
        'pricing_inquiry': ['consulta_precio', 'interes_en_servicio'],
        'features_inquiry': ['consulta_caracteristicas', 'interes_en_servicio'],
        'complaint': ['queja', 'soporte_tecnico', 'cancelacion'],
        'cancellation': ['cancelacion', 'queja'],
        'service_interest': ['interes_en_servicio', 'consulta_caracteristicas', 'consulta_precio'],
        'greeting': ['saludo', 'interes_en_servicio'],
        'farewell': ['despedida', 'agradecimiento'],
        'gratitude': ['agradecimiento', 'despedida'],
        'confirmation': ['confirmacion'],
        'general': []
    };
    
    return topicIntentMapping[topic] || [];
}

function parseIntentResponse(response) {
    try {
        // Buscar JSON en la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validar que las intenciones sean válidas
            const validIntents = [
                'saludo', 'despedida', 'interes_en_servicio', 'solicitud_prueba',
                'confirmacion', 'agradecimiento', 'soporte_tecnico', 'consulta_precio',
                'consulta_caracteristicas', 'queja', 'cancelacion'
            ];
            
            if (parsed.intents && Array.isArray(parsed.intents)) {
                parsed.intents = parsed.intents.filter(intent => validIntents.includes(intent));
            }
            
            return parsed;
        }
        
        return { intents: [] };
    } catch (error) {
        logger.error(`Error parseando respuesta de intenciones: ${error.message}`);
        return { intents: [] };
    }
}

function parseEntityResponse(response) {
    try {
        // Buscar JSON en la respuesta
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validar y limpiar entidades
            const validEntities = [
                'nombre', 'email', 'telefono', 'empresa', 'cargo',
                'usuario', 'clave', 'fecha', 'numero_empleados', 'industria'
            ];
            
            const cleanedEntities = {};
            for (const [key, value] of Object.entries(parsed)) {
                if (validEntities.includes(key) && value && value.toString().trim() !== '') {
                    cleanedEntities[key] = value.toString().trim();
                }
            }
            
            return cleanedEntities;
        }
        
        return {};
    } catch (error) {
        logger.error(`Error parseando respuesta de entidades: ${error.message}`);
        return {};
    }
}

async function testConnection() {
    try {
        logger.info('Probando conexión con Ollama...');
        
        const response = await queryModel({
            systemPrompt: "Eres un asistente de prueba. Responde con 'OK' si recibes este mensaje.",
            userPrompt: "Test"
        }, { maxRetries: 1 });
        
        const success = response.toLowerCase().includes('ok');
        logger.info(`Prueba de conexión: ${success ? 'EXITOSA' : 'FALLIDA'}`);
        
        return success;
    } catch (error) {
        logger.error(`Error en prueba de conexión: ${error.message}`);
        return false;
    }
}

async function getModelInfo() {
    try {
        const response = await fetch(`${process.env.OLLAMA_API_URL}/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: process.env.OLLAMA_MODEL || 'qwen2.5:14b' })
        });
        
        if (response.ok) {
            const data = await response.json();
            return {
                model: data.model || process.env.OLLAMA_MODEL,
                details: data.details || {},
                parameters: data.parameters || {}
            };
        }
        
        return null;
    } catch (error) {
        logger.error(`Error obteniendo información del modelo: ${error.message}`);
        return null;
    }
}

// Exportar funciones
module.exports = {
    queryModel,
    detectIntentions,
    detectIntentionsWithContext,
    extractEntities,
    extractEntitiesWithContext,
    generateResponse,
    parseIntentResponse,
    parseEntityResponse,
    testConnection,
    getModelInfo,
    CONFIG
};