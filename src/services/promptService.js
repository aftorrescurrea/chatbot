/**
 * Servicio de prompts mejorado para el chatbot de WhatsApp ERP
 * Incluye capacidades contextuales para mejor comprensión conversacional
 */

const fetch = require('node-fetch');
const { logger } = require('../utils/logger');
const { renderTemplate } = require('../utils/promptTemplates');

// Configuración del servicio
const CONFIG = {
    maxRetries: 3,
    retryDelay: 2000, // 2 segundos
    timeout: 30000, // 30 segundos
    temperature: 0.2,
    topP: 0.9,
    topK: 40
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
 * Consulta al modelo LLM usando la API de generate de Ollama
 * @param {Object} promptData - Datos del prompt
 * @param {string} promptData.systemPrompt - Instrucciones del sistema
 * @param {string} promptData.userPrompt - Mensaje del usuario
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<string>} - Respuesta del modelo
 */
async function queryModel(promptData, options = {}) {
    const maxRetries = options.maxRetries || CONFIG.maxRetries;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.debug(`Intento ${attempt}/${maxRetries} de consulta al modelo`);
            
            // Combinar system prompt y user prompt para API de generate
            const fullPrompt = promptData.systemPrompt 
                ? `${promptData.systemPrompt}\n\nUsuario: ${promptData.userPrompt}\nAsistente:`
                : promptData.userPrompt;
            
            const requestBody = {
                model: process.env.OLLAMA_MODEL || 'llama3:8b',
                prompt: fullPrompt,
                stream: false,
                options: {
                    temperature: options.temperature || CONFIG.temperature,
                    top_p: CONFIG.topP,
                    top_k: CONFIG.topK,
                    stop: ['\nUsuario:', '\nUser:']
                }
            };
            
            logger.debug(`Enviando request a: ${process.env.OLLAMA_API_URL}/generate`);
            
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
            
            // Si es el último intento o no es un error recuperable
            if (attempt === maxRetries || (!isModelLoadingError(error.message) && !error.name === 'AbortError')) {
                if (error.name === 'AbortError') {
                    throw new Error(`Timeout: La respuesta del modelo excedió el tiempo límite de ${CONFIG.timeout}ms`);
                }
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
 * Detecta las intenciones presentes en el mensaje del usuario (sin contexto)
 * @param {string} message - Mensaje del usuario
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las intenciones detectadas
 */
async function detectIntentions(message, templateName = 'intent-detection', variables = {}, options = {}) {
    try {
        const systemPrompt = renderTemplate(
            require('../utils/promptTemplates').baseTemplates[templateName] || 
            require('../utils/promptTemplates').baseTemplates['intent-detection'],
            variables
        );

        const response = await queryModel({
            systemPrompt,
            userPrompt: message
        }, options);
        
        return parseIntentResponse(response);
    } catch (error) {
        logger.error(`Error al detectar intenciones: ${error.message}`);
        return { intents: [] };
    }
}

/**
 * Detecta intenciones considerando el contexto conversacional
 * @param {string} message - Mensaje del usuario
 * @param {Object} context - Contexto conversacional
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las intenciones detectadas
 */
async function detectIntentionsWithContext(message, context, templateName = 'contextual-intent-detection', variables = {}, options = {}) {
    try {
        // Plantilla contextual para detección de intenciones
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

{{#if context.recentMessages}}
Últimos mensajes de la conversación:
{{#each context.recentMessages}}
{{#if this.isFromUser}}Usuario{{else}}Bot{{/if}}: "{{this.message}}"
{{/each}}
{{/if}}

{{#if context.recentIntents}}
Intenciones recientes: {{JSON.stringify context.recentIntents}}
{{/if}}

{{#if context.topicHistory}}
Temas previos: {{JSON.stringify context.topicHistory}}
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

### EJEMPLOS CONTEXTUALES ###

Ejemplo 1 - Continuidad:
Contexto: Usuario pidió información sobre el ERP, tema actual: service_interest
Usuario: "Me interesa, ¿cómo puedo probarlo?"
Análisis: Continúa tema actual + nueva intención solicitud_prueba
Respuesta: {"intents": ["interes_en_servicio", "solicitud_prueba"]}

Ejemplo 2 - Confirmación contextual:
Contexto: Bot preguntó "¿Tu nombre es Juan Pérez?", usuario conocido: Juan Pérez
Usuario: "Sí"
Análisis: Confirmación del nombre en contexto
Respuesta: {"intents": ["confirmacion"]}

Ejemplo 3 - Cambio de tema:
Contexto: Usuario estaba pidiendo prueba, tema actual: trial_request
Usuario: "Antes de eso, ¿cuánto cuesta?"
Análisis: Cambio a consulta de precio
Respuesta: {"intents": ["consulta_precio"]}

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

        const response = await queryModel({
            systemPrompt,
            userPrompt: message
        }, options);
        
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
 * Extrae entidades relevantes del mensaje del usuario (sin contexto)
 * @param {string} message - Mensaje del usuario
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las entidades extraídas
 */
async function extractEntities(message, templateName = 'entity-extraction', variables = {}, options = {}) {
    try {
        const systemPrompt = renderTemplate(
            require('../utils/promptTemplates').baseTemplates[templateName] || 
            require('../utils/promptTemplates').baseTemplates['entity-extraction'],
            variables
        );

        const response = await queryModel({
            systemPrompt,
            userPrompt: message
        }, options);
        
        return parseEntityResponse(response);
    } catch (error) {
        logger.error(`Error al extraer entidades: ${error.message}`);
        return {};
    }
}

/**
 * Extrae entidades considerando el contexto conversacional
 * @param {string} message - Mensaje del usuario
 * @param {Object} context - Contexto conversacional
 * @param {string} templateName - Nombre de la plantilla a usar
 * @param {Object} variables - Variables para la plantilla
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las entidades extraídas
 */
async function extractEntitiesWithContext(message, context, templateName = 'contextual-entity-extraction', variables = {}, options = {}) {
    try {
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

{{#if context.recentMessages}}
Últimos mensajes de la conversación:
{{#each context.recentMessages}}
{{#if this.isFromUser}}Usuario{{else}}Bot{{/if}}: "{{this.message}}"
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

### EJEMPLOS CONTEXTUALES ###

Ejemplo 1 - Nueva información:
Contexto conocido: nombre="Juan Pérez"
Usuario: "Mi email es juan@empresa.com"
Extraer: {"email": "juan@empresa.com"}

Ejemplo 2 - Confirmación sin nueva info:
Contexto conocido: nombre="Juan Pérez"
Usuario: "Sí, ese es mi nombre"
Extraer: {} (no hay entidades nuevas)

Ejemplo 3 - Corrección:
Contexto conocido: nombre="Juan Pérez"
Usuario: "Perdón, mi nombre es Juan Carlos Pérez"
Extraer: {"nombre": "Juan Carlos Pérez"}

Ejemplo 4 - Credenciales juntas:
Usuario: "usuario123 MiClave456!"
Extraer: {"usuario": "usuario123", "clave": "MiClave456!"}

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

        const response = await queryModel({
            systemPrompt,
            userPrompt: message
        }, options);
        
        const result = parseEntityResponse(response);
        
        return result;
    } catch (error) {
        logger.error(`Error al extraer entidades con contexto: ${error.message}`);
        // Fallback a extracción sin contexto
        return await extractEntities(message, 'entity-extraction', variables, options);
    }
}

/**
 * Genera una respuesta contextual para el usuario
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
        const systemPrompt = `Eres un asistente virtual profesional de WhatsApp para un sistema ERP empresarial llamado "ERP Demo".

Tu trabajo es ayudar a los usuarios con:
- Información sobre el servicio ERP
- Crear cuentas de prueba gratuitas (7 días)
- Resolver dudas técnicas básicas
- Proporcionar información de contacto para soporte avanzado

CONTEXTO ACTUAL:
- Mensaje del usuario: "${message}"
- Intenciones detectadas: ${JSON.stringify(intents)}
- Entidades extraídas: ${JSON.stringify(entities)}
- Usuario existente: ${userData ? `${userData.name} (${userData.email})` : 'No registrado'}
- Estado de conversación: ${conversationContext.conversationState || 'Ninguno'}
- Tema actual: ${conversationContext.currentTopic || 'General'}

${userData ? `
INFORMACIÓN DEL USUARIO:
- Nombre: ${userData.name}
- Email: ${userData.email}
- Empresa: ${userData.company || 'No especificada'}
- Cargo: ${userData.position || 'No especificado'}
` : ''}

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
- Si el usuario confirma información personal, agradece y continúa

EJEMPLOS DE RESPUESTAS:
- Saludo: "${userData ? `¡Hola ${userData.name}!` : '¡Hola!'} Soy el asistente virtual de ERP Demo. ¿En qué puedo ayudarte hoy?"
- Interés: "Me alegra tu interés en ERP Demo${userData && userData.company ? ` para ${userData.company}` : ''}. Nuestro sistema incluye gestión completa de inventario, facturación, contabilidad y más. ¿Te gustaría una prueba gratuita de 7 días?"
- Solicitud prueba: "Perfecto${userData ? `, ${userData.name}` : ''}. Puedo crear tu cuenta de prueba. ${userData && userData.email ? 'Ya tengo tu información de contacto.' : 'Necesito tu nombre completo y email.'} ¿Qué nombre de usuario y contraseña te gustaría usar?"

Responde de manera natural al mensaje del usuario considerando toda la información proporcionada.`;

        const response = await queryModel({
            systemPrompt,
            userPrompt: `Genera una respuesta apropiada para este contexto.`
        }, {
            ...options,
            temperature: 0.7 // Temperatura más alta para respuestas más creativas
        });
        
        return response.trim();
    } catch (error) {
        logger.error(`Error al generar respuesta: ${error.message}`);
        return "Lo siento, estoy teniendo problemas técnicos en este momento. Por favor, intenta de nuevo más tarde o contacta a nuestro equipo de soporte.";
    }
}

/**
 * Obtiene las intenciones relacionadas con un tema específico
 * @param {string} topic - Tema actual
 * @returns {Array} - Intenciones relacionadas
 */
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
        'general': ['saludo', 'despedida', 'interes_en_servicio', 'solicitud_prueba', 'confirmacion', 'agradecimiento', 'soporte_tecnico', 'consulta_precio', 'consulta_caracteristicas', 'queja', 'cancelacion']
    };
    
    return topicIntentMapping[topic] || [];
}

/**
 * Parsea la respuesta del modelo para extraer intenciones
 * @param {string} response - Respuesta del modelo
 * @returns {Object} - Objeto con intenciones detectadas
 */
function parseIntentResponse(response) {
    try {
        // Buscar JSON en la respuesta
        const jsonMatch = response.match(/\{[^}]*"intents"[^}]*\}/);
        if (!jsonMatch) {
            logger.debug(`No se encontró JSON válido en respuesta de intenciones: ${response}`);
            return { intents: [] };
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validar que intents sea un array
        if (!Array.isArray(parsed.intents)) {
            logger.warn(`Intents no es un array: ${JSON.stringify(parsed)}`);
            return { intents: [] };
        }
        
        // Filtrar intenciones válidas
        const validIntents = [
            'saludo', 'despedida', 'interes_en_servicio', 'solicitud_prueba', 
            'confirmacion', 'agradecimiento', 'soporte_tecnico', 'consulta_precio', 
            'consulta_caracteristicas', 'queja', 'cancelacion'
        ];
        
        const filteredIntents = parsed.intents.filter(intent => 
            validIntents.includes(intent)
        );
        
        return { intents: filteredIntents };
    } catch (error) {
        logger.debug(`Error parseando intenciones: ${error.message}`);
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
        // Si la respuesta indica explícitamente que no hay entidades
        if (response.toLowerCase().includes('no se encontraron entidades') || 
            response.toLowerCase().includes('no hay entidades') ||
            response.toLowerCase().includes('no entities found') ||
            response.toLowerCase().includes('objeto vacío')) {
            return {};
        }
        
        // Buscar JSON en la respuesta
        const jsonMatch = response.match(/\{[^}]*\}/);
        if (!jsonMatch) {
            logger.debug(`No se encontró JSON válido en respuesta de entidades: ${response}`);
            return {};
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validar que sea un objeto
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            logger.debug(`Respuesta de entidades no es un objeto válido: ${typeof parsed}`);
            return {};
        }
        
        // Filtrar solo entidades válidas y limpiar valores
        const validEntities = [
            'nombre', 'email', 'usuario', 'clave', 'empresa', 
            'telefono', 'cargo', 'industria', 'numero_empleados'
        ];
        
        const filtered = {};
        
        for (const [key, value] of Object.entries(parsed)) {
            if (validEntities.includes(key) && value && typeof value === 'string') {
                const cleanValue = value.trim();
                if (cleanValue.length > 0) {
                    filtered[key] = cleanValue;
                }
            }
        }
        
        return filtered;
    } catch (error) {
        logger.debug(`Error parseando entidades (normal si no hay entidades): ${error.message}`);
        return {};
    }
}

/**
 * Prueba la conexión con el servicio de Ollama
 * @returns {Promise<boolean>} - true si la conexión es exitosa
 */
async function testConnection() {
    try {
        logger.info('🔄 Probando conexión con Ollama...');
        
        const response = await queryModel({
            systemPrompt: 'Responde con exactamente estas palabras: "Conexión exitosa"',
            userPrompt: 'Hola'
        }, {
            maxRetries: 1,
            timeout: 10000
        });
        
        if (response.toLowerCase().includes('conexión exitosa')) {
            logger.info(`✅ Conexión con Ollama exitosa: ${response.trim()}`);
            return true;
        } else {
            logger.warn(`⚠️ Respuesta inesperada de Ollama: ${response}`);
            return false;
        }
    } catch (error) {
        logger.error(`❌ Error en prueba de conexión: ${error.message}`);
        return false;
    }
}

/**
 * Obtiene información sobre el modelo actual
 * @returns {Promise<Object>} - Información del modelo
 */
async function getModelInfo() {
    try {
        const response = await fetch(`${process.env.OLLAMA_API_URL}/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: process.env.OLLAMA_MODEL || 'llama3:8b' })
        });
        
        if (response.ok) {
            const data = await response.json();
            return {
                model: data.model,
                size: data.size,
                parameters: data.parameters,
                template: data.template
            };
        } else {
            throw new Error(`Error HTTP ${response.status}`);
        }
    } catch (error) {
        logger.error(`Error obteniendo información del modelo: ${error.message}`);
        return null;
    }
}

// Exportar todas las funciones
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
    getIntentsForTopic,
    CONFIG
};