/**
 * Servicio de prompts para el chatbot de WhatsApp ERP
 * Maneja la comunicación con Ollama para detección de intenciones y extracción de entidades
 */

const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

// Configuración del servicio
const CONFIG = {
    maxRetries: 3,
    retryDelay: 2000, // 2 segundos
    timeout: 3000000, // 30 segundos
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
 * Detecta las intenciones presentes en el mensaje del usuario
 * @param {string} message - Mensaje del usuario
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las intenciones detectadas
 */
async function detectIntentions(message, options = {}) {
    try {
        const systemPrompt = `Eres un especialista en análisis de intenciones para un chatbot de WhatsApp que ayuda con un sistema ERP empresarial.

Analiza el siguiente mensaje del usuario y determina TODAS las intenciones presentes.

INTENCIONES POSIBLES:
- saludo: El usuario está saludando o iniciando conversación
- despedida: El usuario se despide o termina la conversación
- interes_en_servicio: Muestra interés en el servicio ERP o quiere más información
- solicitud_prueba: Quiere una prueba, demo, acceso de prueba o crear cuenta
- confirmacion: Está confirmando algo, acepta una propuesta o dice que sí
- agradecimiento: Está agradeciendo por algo
- soporte_tecnico: Necesita ayuda técnica, reporta problemas o errores
- consulta_precio: Pregunta sobre precios, costos, planes o tarifas
- consulta_caracteristicas: Pregunta sobre funcionalidades, módulos o características
- queja: Expresa insatisfacción, problemas con el servicio o críticas
- cancelacion: Quiere cancelar, dar de baja o terminar el servicio

EJEMPLOS:
- "Hola, me interesa su ERP" → {"intents": ["saludo", "interes_en_servicio"]}
- "Quiero probar el sistema" → {"intents": ["solicitud_prueba"]}
- "usuario123 pass456" → {"intents": ["solicitud_prueba"]}
- "No puedo acceder al sistema" → {"intents": ["soporte_tecnico"]}
- "¿Cuánto cuesta?" → {"intents": ["consulta_precio"]}
- "Gracias, hasta luego" → {"intents": ["agradecimiento", "despedida"]}
- "Sí, mi nombre es Juan" → {"intents": ["confirmacion"]}
- "¿Qué módulos incluye?" → {"intents": ["consulta_caracteristicas"]}

IMPORTANTE: 
- Un mensaje puede tener MÚLTIPLES intenciones
- Responde ÚNICAMENTE con JSON válido
- Si no detectas ninguna intención clara, devuelve array vacío
- Usa EXACTAMENTE los nombres de intenciones listados arriba

Formato de respuesta requerido:
{"intents": ["intencion1", "intencion2"]}`;

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
 * Extrae entidades relevantes del mensaje del usuario
 * @param {string} message - Mensaje del usuario
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} - Objeto con las entidades extraídas
 */
async function extractEntities(message, options = {}) {
    try {
        const systemPrompt = `Eres un especialista en extracción de entidades para un chatbot empresarial de WhatsApp.

Extrae TODAS las entidades relevantes del mensaje del usuario.

ENTIDADES A BUSCAR:
- nombre: Nombre completo de la persona (ej: "Juan Pérez", "María González")
- email: Dirección de correo electrónico (ej: "juan@empresa.com")
- usuario: Nombre de usuario deseado para el sistema (ej: "jperez2023", "admin_user")
- clave: Contraseña propuesta (ej: "MiClave123!", "password456")
- empresa: Nombre de la empresa u organización (ej: "Tecnologías SA", "Mi Empresa")
- telefono: Número de teléfono (ej: "555-123-4567", "+1 234 567 8900")
- cargo: Puesto de trabajo o posición (ej: "Gerente", "Director de IT", "Contador")
- industria: Sector o industria (ej: "manufactura", "retail", "servicios")
- numero_empleados: Cantidad de empleados (ej: "50", "200 empleados")

EJEMPLOS:
- "Soy Juan Pérez de Empresa ABC" → {"nombre": "Juan Pérez", "empresa": "Empresa ABC"}
- "Mi email es juan@test.com" → {"email": "juan@test.com"}
- "usuario123 pass456" → {"usuario": "usuario123", "clave": "pass456"}
- "Soy gerente de ventas" → {"cargo": "gerente de ventas"}
- "Tenemos 150 empleados en manufactura" → {"numero_empleados": "150", "industria": "manufactura"}
- "Me llamo Ana García, soy directora de IT en TechCorp, mi email es ana@techcorp.com, teléfono 555-1234" → {"nombre": "Ana García", "cargo": "directora de IT", "empresa": "TechCorp", "email": "ana@techcorp.com", "telefono": "555-1234"}

IMPORTANTE:
- Solo incluye entidades que REALMENTE encuentres en el mensaje
- No inventes información que no esté presente
- Responde ÚNICAMENTE con JSON válido
- Si no encuentras entidades, devuelve objeto vacío {}
- Mantén los valores exactamente como aparecen en el mensaje

Formato de respuesta requerido:
{"entidad": "valor"}`;

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
 * Genera una respuesta contextual para el usuario
 * @param {string} message - Mensaje original del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} context - Contexto de la conversación
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<string>} - Respuesta generada
 */
async function generateResponse(message, intents, entities, context = {}, options = {}) {
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
- Usuario existente: ${context.hasUser ? 'Sí' : 'No'}
- Estado de conversación: ${context.conversationState || 'Ninguno'}

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

EJEMPLOS DE RESPUESTAS:
- Saludo: "¡Hola! Soy el asistente virtual de ERP Demo. ¿En qué puedo ayudarte hoy?"
- Interés: "Me alegra tu interés en ERP Demo. Nuestro sistema incluye gestión completa de inventario, facturación, contabilidad y más. ¿Te gustaría una prueba gratuita de 7 días?"
- Solicitud prueba: "Perfecto, puedo crear tu cuenta de prueba. Necesito tu nombre completo, email, y las credenciales que quieres usar. ¿Podrías proporcionarme estos datos?"

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
    extractEntities,
    generateResponse,
    parseIntentResponse,
    parseEntityResponse,
    testConnection,
    getModelInfo,
    CONFIG
};