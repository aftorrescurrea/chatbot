/**
 * Servicio de procesamiento de lenguaje natural contextual mejorado
 * Detecta intenciones y extrae entidades considerando el contexto conversacional
 */

const { logger } = require('../utils/logger');
const { intentConfig } = require('../config/promptConfig');
const promptService = require('./promptService');
const { getContextForPrompt } = require('./MemoryService');

/**
 * Detecta las intenciones del mensaje del usuario considerando el contexto conversacional
 * @param {string} message - Mensaje del usuario
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} options - Opciones adicionales para la detección de intenciones
 * @returns {Object} - Objeto con las intenciones detectadas y contexto
 */
const detectIntentsWithContext = async (message, phoneNumber, options = {}) => {
    try {
        // Obtener contexto conversacional
        const context = await getContextForPrompt(phoneNumber);
        
        // Verificar si el mensaje es una pregunta fuera de contexto
        if (isOffTopicQuestion(message)) {
            logger.info(`Pregunta fuera de contexto detectada: "${message}"`);
            return {
                intents: [],
                contextUsed: true,
                topicContinuity: false,
                isOffTopic: true,
                originalMessage: message
            };
        }
        
        // Configurar variables específicas para este prompt contextual
        const variables = {
            supportedIntents: options.supportedIntents || intentConfig.supportedIntents,
            intentExamples: options.intentExamples || intentConfig.intentExamples,
            conversationExamples: options.conversationExamples || intentConfig.conversationExamples,
            serviceType: options.serviceType || 'ERP',
            context: context
        };

        // Usar el servicio de prompts contextual para detectar intenciones
        const result = await promptService.detectIntentionsWithContext(
            message, 
            context, 
            'contextual-intent-detection', 
            variables
        );
        
        // Validar las intenciones detectadas contra el contexto
        const validatedResult = validateIntentsAgainstContext(result, context, message);
        
        return {
            ...validatedResult,
            context: context,
            contextStrength: context.contextStrength
        };
    } catch (error) {
        logger.error(`Error al detectar intenciones con contexto: ${error.message}`);
        // Fallback al método sin contexto
        return await detectIntentsBasic(message, options);
    }
};

/**
 * Verifica si una pregunta está fuera del contexto del negocio
 * @param {string} message - Mensaje del usuario
 * @returns {boolean} - Si la pregunta está fuera de contexto
 */
const isOffTopicQuestion = (message) => {
    const messageLower = message.toLowerCase().trim();
    
    // Patrones de preguntas claramente fuera de contexto
    const offTopicPatterns = [
        // Preguntas sobre colores, astronomía, geografía general
        /de qu[eé] color/,
        /qu[eé] color/,
        /la luna/,
        /el sol/,
        /las estrellas/,
        /el cielo/,
        
        // Preguntas sobre animales
        /los animales/,
        /los perros/,
        /los gatos/,
        
        // Preguntas matemáticas básicas sin contexto empresarial
        /cu[aá]nto es \d+ \+ \d+/,
        /cu[aá]nto es \d+ - \d+/,
        /cu[aá]nto es \d+ \* \d+/,
        /cu[aá]nto es \d+ \/ \d+/,
        
        // Preguntas de conocimiento general sin relación
        /capital de/,
        /presidente de/,
        /historia de/,
        /cuando fue/,
        /en qu[eé] a[ñn]o/,
        
        // Preguntas personales sin contexto empresarial
        /cu[aá]ntos a[ñn]os tienes/,
        /d[oó]nde vives/,
        /tienes familia/,
        /te gusta/,
        
        // Preguntas de entretenimiento
        /cu[eé]ntame un chiste/,
        /una historia/,
        /recomienda una pel[ií]cula/,
        /qu[eé] m[uú]sica/,
        
        // Saludos casuales sin intención clara
        /qu[eé] tal el clima/,
        /c[oó]mo est[aá] el d[ií]a/,
        
        // Preguntas existenciales o filosóficas
        /cu[aá]l es el sentido/,
        /por qu[eé] existimos/,
        /qu[eé] es la vida/
    ];
    
    // Verificar si el mensaje coincide con algún patrón
    const isOffTopic = offTopicPatterns.some(pattern => pattern.test(messageLower));
    
    // Verificaciones adicionales
    if (isOffTopic) {
        return true;
    }
    
    // Verificar preguntas muy cortas sin contexto empresarial
    if (messageLower.length < 10) {
        const businessKeywords = [
            'erp', 'sistema', 'empresa', 'negocio', 'inventario', 'factura', 'contabilidad',
            'prueba', 'demo', 'cuenta', 'usuario', 'precio', 'costo', 'soporte', 'ayuda'
        ];
        
        const hasBusinessContext = businessKeywords.some(keyword => 
            messageLower.includes(keyword)
        );
        
        if (!hasBusinessContext && messageLower.includes('?')) {
            return true;
        }
    }
    
    return false;
};

/**
 * Valida las intenciones detectadas contra el contexto conversacional
 * @param {Object} result - Resultado de detección de intenciones
 * @param {Object} context - Contexto conversacional
 * @param {string} message - Mensaje original
 * @returns {Object} - Resultado validado
 */
const validateIntentsAgainstContext = (result, context, message) => {
    if (!result.intents || result.intents.length === 0) {
        return result;
    }
    
    const messageLower = message.toLowerCase();
    const validatedIntents = [];
    
    for (const intent of result.intents) {
        let isValid = true;
        
        // Validar intención 'consulta_caracteristicas' 
        if (intent === 'consulta_caracteristicas') {
            const hasFeatureKeywords = [
                'caracter', 'funciona', 'modulo', 'sistema', 'que hace', 'que tiene',
                'incluye', 'capacidad', 'herramienta', 'opciones', 'servicio'
            ].some(keyword => messageLower.includes(keyword));
            
            // Si no tiene palabras clave relacionadas con características del sistema
            if (!hasFeatureKeywords) {
                logger.debug(`Intención 'consulta_caracteristicas' invalidada para: "${message}"`);
                isValid = false;
            }
        }
        
        // Validar intención 'saludo' para usuarios conocidos
        if (intent === 'saludo' && context.userProfile && context.userProfile.isRegistered) {
            const isSimpleGreeting = ['hola', 'buenos dias', 'buenas tardes', 'saludos'].some(
                greeting => messageLower === greeting || messageLower.startsWith(greeting + ' ')
            );
            
            // Si no es un saludo simple y el usuario ya está en conversación
            if (!isSimpleGreeting && context.recentMessages && context.recentMessages.length > 2) {
                logger.debug(`Intención 'saludo' invalidada para usuario conocido: "${message}"`);
                isValid = false;
            }
        }
        
        if (isValid) {
            validatedIntents.push(intent);
        }
    }
    
    return {
        ...result,
        intents: validatedIntents,
        originalIntents: result.intents,
        wasValidated: validatedIntents.length !== result.intents.length
    };
};

/**
 * Extrae entidades considerando el contexto conversacional y entidades conocidas
 * @param {string} message - Mensaje del usuario
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} options - Opciones adicionales para la extracción de entidades
 * @returns {Object} - Objeto con las entidades extraídas
 */
const extractEntitiesWithContext = async (message, phoneNumber, options = {}) => {
    try {
        // Obtener contexto conversacional
        const context = await getContextForPrompt(phoneNumber);
        
        // Configurar variables específicas para este prompt contextual
        const variables = {
            supportedEntities: options.supportedEntities || ['nombre', 'email', 'usuario', 'clave', 'empresa', 'telefono', 'cargo', 'industria', 'numero_empleados'],
            serviceType: options.serviceType || 'ERP',
            context: context
        };

        // Usar el servicio de prompts contextual para extraer entidades
        const extractedEntities = await promptService.extractEntitiesWithContext(
            message, 
            context, 
            'contextual-entity-extraction', 
            variables
        );
        
        // Combinar con entidades conocidas del contexto cuando sea apropiado
        const contextualEntities = enrichEntitiesWithContext(extractedEntities, context, message);
        
        return contextualEntities;
    } catch (error) {
        logger.error(`Error al extraer entidades con contexto: ${error.message}`);
        // Fallback al método sin contexto
        return await extractEntitiesBasic(message, options);
    }
};

/**
 * Enriquece las entidades extraídas con información del contexto
 * @param {Object} extractedEntities - Entidades extraídas del mensaje actual
 * @param {Object} context - Contexto conversacional
 * @param {string} message - Mensaje original
 * @returns {Object} - Entidades enriquecidas
 */
const enrichEntitiesWithContext = (extractedEntities, context, message) => {
    const enrichedEntities = { ...extractedEntities };
    
    // Solo enriquecer si no se detectaron entidades conflictivas en el mensaje actual
    const knownEntities = context.knownEntities || {};
    
    // Enriquecer nombre si no se detectó en el mensaje pero está en contexto
    if (!enrichedEntities.nombre && knownEntities.nombre) {
        // Solo agregar si el mensaje sugiere que necesitamos el nombre
        if (shouldInferEntity(message, 'nombre')) {
            enrichedEntities.nombre = knownEntities.nombre;
            logger.debug(`Nombre inferido del contexto: ${knownEntities.nombre}`);
        }
    }
    
    // Enriquecer email si no se detectó en el mensaje pero está en contexto
    if (!enrichedEntities.email && knownEntities.email) {
        if (shouldInferEntity(message, 'email')) {
            enrichedEntities.email = knownEntities.email;
            logger.debug(`Email inferido del contexto: ${knownEntities.email}`);
        }
    }
    
    // Enriquecer empresa if no se detectó en el mensaje pero está en contexto
    if (!enrichedEntities.empresa && knownEntities.empresa) {
        if (shouldInferEntity(message, 'empresa')) {
            enrichedEntities.empresa = knownEntities.empresa;
            logger.debug(`Empresa inferida del contexto: ${knownEntities.empresa}`);
        }
    }
    
    // Enriquecer cargo si no se detectó en el mensaje pero está en contexto
    if (!enrichedEntities.cargo && knownEntities.cargo) {
        if (shouldInferEntity(message, 'cargo')) {
            enrichedEntities.cargo = knownEntities.cargo;
            logger.debug(`Cargo inferido del contexto: ${knownEntities.cargo}`);
        }
    }
    
    return enrichedEntities;
};

/**
 * Determina si se debe inferir una entidad del contexto basándose en el mensaje
 * @param {string} message - Mensaje del usuario
 * @param {string} entityType - Tipo de entidad a considerar
 * @returns {boolean} - Si se debe inferir la entidad
 */
const shouldInferEntity = (message, entityType) => {
    const messageLower = message.toLowerCase();
    
    // Patrones que sugieren que el usuario se está refiriendo a sí mismo
    const selfReferencePatterns = [
        'mi ', 'mis ', 'yo ', 'soy ', 'estoy ', 'necesito ', 'quiero ', 'me ', 'tengo '
    ];
    
    // Patrones que sugieren continuidad de conversación
    const continuityPatterns = [
        'sí', 'si', 'claro', 'correcto', 'exacto', 'perfecto', 'ok', 'vale', 
        'confirmo', 'así es', 'efectivamente'
    ];
    
    // Patrones que sugieren solicitud de acción
    const actionPatterns = [
        'crear', 'generar', 'hacer', 'proceder', 'continuar', 'seguir', 'avanzar'
    ];
    
    const hasSelfReference = selfReferencePatterns.some(pattern => messageLower.includes(pattern));
    const hasContinuity = continuityPatterns.some(pattern => messageLower.includes(pattern));
    const hasAction = actionPatterns.some(pattern => messageLower.includes(pattern));
    
    // Lógica específica por tipo de entidad
    switch (entityType) {
        case 'nombre':
            return hasSelfReference || hasContinuity || hasAction;
        case 'email':
            return hasSelfReference || hasContinuity || hasAction;
        case 'empresa':
            return hasSelfReference || messageLower.includes('empresa') || messageLower.includes('compañía');
        case 'cargo':
            return hasSelfReference || messageLower.includes('trabajo') || messageLower.includes('puesto');
        default:
            return hasContinuity || hasAction;
    }
};

/**
 * Analiza la coherencia contextual del mensaje
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} context - Contexto conversacional
 * @returns {Object} - Análisis de coherencia
 */
const analyzeContextualCoherence = (message, intents, context) => {
    const analysis = {
        isCoherent: true,
        coherenceScore: 1.0,
        contextualClues: [],
        topicContinuity: true,
        suggestions: []
    };
    
    try {
        // Analizar continuidad de tema
        if (context.currentTopic && intents.length > 0) {
            const currentTopicIntents = getIntentsForTopic(context.currentTopic);
            const hasRelatedIntent = intents.some(intent => currentTopicIntents.includes(intent));
            
            if (!hasRelatedIntent) {
                analysis.topicContinuity = false;
                analysis.coherenceScore -= 0.3;
                analysis.contextualClues.push('Cambio de tema detectado');
            }
        }
        
        // Verificar si es una pregunta fuera de contexto
        if (isOffTopicQuestion(message)) {
            analysis.isCoherent = false;
            analysis.coherenceScore = 0.1;
            analysis.contextualClues.push('Pregunta fuera del contexto empresarial');
            analysis.suggestions.push('Redirigir a funcionalidades del sistema');
        }
        
        // Analizar patrones de conversación
        if (context.recentIntents && context.recentIntents.length > 0) {
            const hasRepeatedIntent = intents.some(intent => 
                context.recentIntents.slice(0, 3).includes(intent)
            );
            
            if (hasRepeatedIntent) {
                analysis.contextualClues.push('Intención repetida - posible frustración o énfasis');
            }
        }
        
        // Determinar coherencia general
        analysis.isCoherent = analysis.coherenceScore > 0.5;
        
        return analysis;
    } catch (error) {
        logger.error(`Error en análisis de coherencia contextual: ${error.message}`);
        return analysis;
    }
};

/**
 * Obtiene las intenciones relacionadas con un tema específico
 * @param {string} topic - Tema actual
 * @returns {Array} - Intenciones relacionadas
 */
const getIntentsForTopic = (topic) => {
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
        'general': intentConfig.supportedIntents // Todas las intenciones son válidas
    };
    
    return topicIntentMapping[topic] || [];
};

/**
 * Detecta intenciones sin contexto (método de fallback)
 * @param {string} message - Mensaje del usuario
 * @param {Object} options - Opciones adicionales
 * @returns {Object} - Intenciones detectadas
 */
const detectIntentsBasic = async (message, options = {}) => {
    try {
        const variables = {
            supportedIntents: options.supportedIntents || intentConfig.supportedIntents,
            intentExamples: options.intentExamples || intentConfig.intentExamples,
            conversationExamples: options.conversationExamples || intentConfig.conversationExamples,
            serviceType: options.serviceType || 'ERP'
        };

        return await promptService.detectIntentions(message, 'intent-detection', variables);
    } catch (error) {
        logger.error(`Error en detección básica de intenciones: ${error.message}`);
        return { intents: [] };
    }
};

/**
 * Extrae entidades sin contexto (método de fallback)
 * @param {string} message - Mensaje del usuario
 * @param {Object} options - Opciones adicionales
 * @returns {Object} - Entidades extraídas
 */
const extractEntitiesBasic = async (message, options = {}) => {
    try {
        const variables = {
            supportedEntities: options.supportedEntities || ['nombre', 'email', 'usuario', 'clave', 'empresa', 'telefono', 'cargo', 'industria', 'numero_empleados'],
            serviceType: options.serviceType || 'ERP'
        };

        return await promptService.extractEntities(message, 'entity-extraction', variables);
    } catch (error) {
        logger.error(`Error en extracción básica de entidades: ${error.message}`);
        return {};
    }
};

/**
 * Determina la intención principal considerando el contexto
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} context - Contexto conversacional
 * @returns {string|null} - Intención principal contextual
 */
const getPrimaryIntentWithContext = (intents, context) => {
    if (!intents || intents.length === 0) {
        return null;
    }

    // Si hay contexto de tema actual, priorizar intenciones relacionadas
    if (context.currentTopic) {
        const topicIntents = getIntentsForTopic(context.currentTopic);
        const contextualIntent = intents.find(intent => topicIntents.includes(intent));
        
        if (contextualIntent) {
            logger.debug(`Intención contextual seleccionada: ${contextualIntent} para tema: ${context.currentTopic}`);
            return contextualIntent;
        }
    }

    // Si hay múltiples intenciones, considerar el contexto conversacional
    if (intents.length > 1) {
        // Si hay confirmacion + solicitud_prueba, priorizar solicitud_prueba
        if (intents.includes('confirmacion') && intents.includes('solicitud_prueba')) {
            return 'solicitud_prueba';
        }
        
        // Si hay confirmacion + interes_en_servicio en contexto de servicio, interpretar como solicitud_prueba
        if (intents.includes('confirmacion') && intents.includes('interes_en_servicio') && 
            context.currentTopic === 'service_interest') {
            return 'solicitud_prueba';
        }
        
        // Si solo hay confirmacion pero el contexto reciente incluye solicitud de prueba
        if (intents.includes('confirmacion')) {
            const recentIntents = context.recentIntents || [];
            if (recentIntents.includes('interes_en_servicio') || recentIntents.includes('solicitud_prueba')) {
                return 'solicitud_prueba';
            }
        }
    }

    // Priorizar por importancia general
    const priorities = {
        'solicitud_prueba': 1,
        'soporte_tecnico': 2,
        'queja': 3,
        'cancelacion': 4,
        'consulta_precio': 5,
        'consulta_caracteristicas': 6,
        'interes_en_servicio': 7,
        'confirmacion': 8,
        'agradecimiento': 9,
        'saludo': 10,
        'despedida': 11
    };

    const orderedIntents = [...intents].sort((a, b) => {
        const priorityA = priorities[a] || 100;
        const priorityB = priorities[b] || 100;
        return priorityA - priorityB;
    });

    return orderedIntents[0];
};

/**
 * Detecta cambios de contexto en la conversación
 * @param {Array} currentIntents - Intenciones actuales
 * @param {Object} context - Contexto conversacional
 * @returns {Object} - Información sobre cambio de contexto
 */
const detectContextChange = (currentIntents, context) => {
    const change = {
        hasChanged: false,
        previousTopic: context.currentTopic,
        suggestedTopic: null,
        confidence: 0,
        reason: null
    };

    if (!currentIntents || currentIntents.length === 0) {
        return change;
    }

    // Determinar nuevo tema basado en intenciones
    const newTopic = determineTopicFromIntents(currentIntents);
    
    // Comparar con tema actual
    if (context.currentTopic && context.currentTopic !== newTopic) {
        change.hasChanged = true;
        change.suggestedTopic = newTopic;
        change.confidence = calculateTopicChangeConfidence(currentIntents, context);
        change.reason = `Cambio de ${context.currentTopic} a ${newTopic}`;
        
        logger.info(`Cambio de contexto detectado: ${change.reason} (confianza: ${change.confidence})`);
    } else if (!context.currentTopic && newTopic !== 'general') {
        change.hasChanged = true;
        change.suggestedTopic = newTopic;
        change.confidence = 0.8;
        change.reason = `Establecimiento de nuevo tema: ${newTopic}`;
    }

    return change;
};

/**
 * Calcula la confianza del cambio de tema
 * @param {Array} intents - Intenciones actuales
 * @param {Object} context - Contexto conversacional
 * @returns {number} - Confianza (0-1)
 */
const calculateTopicChangeConfidence = (intents, context) => {
    let confidence = 0.5; // Base
    
    // Aumentar confianza si hay intenciones fuertes de cambio
    const strongChangeIntents = ['solicitud_prueba', 'soporte_tecnico', 'queja', 'cancelacion'];
    if (intents.some(intent => strongChangeIntents.includes(intent))) {
        confidence += 0.3;
    }
    
    // Reducir confianza si el tema actual es fuerte
    if (context.contextStrength > 0.7) {
        confidence -= 0.2;
    }
    
    // Aumentar confianza si hay múltiples intenciones del nuevo tema
    const newTopic = determineTopicFromIntents(intents);
    const newTopicIntents = getIntentsForTopic(newTopic);
    const matchingIntents = intents.filter(intent => newTopicIntents.includes(intent));
    
    if (matchingIntents.length > 1) {
        confidence += 0.2;
    }
    
    return Math.min(Math.max(confidence, 0), 1);
};

/**
 * Determina el tema principal basado en las intenciones
 * @param {Array} intents - Intenciones detectadas
 * @returns {string} - Tema principal
 */
const determineTopicFromIntents = (intents) => {
    if (!intents || intents.length === 0) return 'general';
    
    const topicMapping = {
        'solicitud_prueba': 'trial_request',
        'soporte_tecnico': 'technical_support',
        'consulta_precio': 'pricing_inquiry',
        'consulta_caracteristicas': 'features_inquiry',
        'queja': 'complaint',
        'cancelacion': 'cancellation',
        'interes_en_servicio': 'service_interest',
        'saludo': 'greeting',
        'despedida': 'farewell',
        'agradecimiento': 'gratitude',
        'confirmacion': 'confirmation'
    };
    
    // Priorizar por importancia del tema
    const priorityOrder = [
        'solicitud_prueba', 'soporte_tecnico', 'queja', 'cancelacion',
        'consulta_precio', 'consulta_caracteristicas', 'interes_en_servicio',
        'confirmacion', 'agradecimiento', 'saludo', 'despedida'
    ];
    
    for (const intent of priorityOrder) {
        if (intents.includes(intent)) {
            return topicMapping[intent] || 'general';
        }
    }
    
    return 'general';
};

const { hybridEntityExtraction } = require('./credentialExtractor');

/**
 * NUEVA FUNCIÓN: Extrae entidades con fallback de patrones
 * Reemplaza la función extractEntitiesWithContext existente
 */
const extractEntitiesWithContextImproved = async (message, phoneNumber, options = {}) => {
    try {
        logger.debug(`🔄 Extrayendo entidades mejoradas de: "${message}"`);
        
        // Función original de Ollama
        const originalExtractor = async (msg) => {
            return await extractEntitiesWithContext(msg, phoneNumber, options);
        };
        
        // Usar extracción híbrida
        const entities = await hybridEntityExtraction(message, originalExtractor);
        
        logger.info(`✅ Entidades extraídas (mejoradas): ${JSON.stringify(entities)}`);
        return entities;
        
    } catch (error) {
        logger.error(`❌ Error en extracción mejorada: ${error.message}`);
        // Fallback: usar solo patrones
        const { extractCredentialsRobust } = require('./credentialExtractor');
        return extractCredentialsRobust(message);
    }
};

module.exports = {
    // ... todas las exportaciones existentes
    extractEntitiesWithContextImproved,  // AGREGAR ESTA LÍNEA
    detectIntentsWithContext,
    extractEntitiesWithContext,
    enrichEntitiesWithContext,
    analyzeContextualCoherence,
    getPrimaryIntentWithContext,
    detectContextChange,
    determineTopicFromIntents,
    calculateTopicChangeConfidence,
    isOffTopicQuestion,
    validateIntentsAgainstContext,
    detectIntentsBasic,
    extractEntitiesBasic
};