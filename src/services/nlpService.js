/**
 * Versión de nlpService con soporte para migración gradual
 * Usa la configuración centralizada para cambiar entre v1 y v2
 */

const { logger } = require('../utils/logger');
const { promptService } = require('../config/migrationConfig'); // Usa la versión configurada
const { getContextForPrompt } = require('./MemoryService');
const intentService = require('./intentService');
const entityService = require('./entityService');

// Copiar todas las funciones del nlpService original
// pero usando el promptService desde migrationConfig

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
        
        // Obtener intenciones desde la base de datos
        const nlpIntents = await intentService.getIntentsForNLP();
        
        // Configurar variables específicas para este prompt contextual
        const variables = {
            supportedIntents: options.supportedIntents || nlpIntents.supportedIntents,
            intentExamples: options.intentExamples || nlpIntents.intentExamples,
            conversationExamples: options.conversationExamples || nlpIntents.conversationExamples,
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
        
        // Post-procesamiento usando patrones y relaciones de la base de datos
        const processedResult = postProcessIntentDetection(message, result, nlpIntents);
        
        return {
            ...processedResult,
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
        
        // Obtener entidades desde la base de datos
        const nlpEntities = await entityService.getEntitiesForNLP();
        
        // Configurar variables específicas para este prompt contextual
        const variables = {
            supportedEntities: options.supportedEntities || nlpEntities.supportedEntities,
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
    
    // Enriquecer empresa si no se detectó en el mensaje pero está en contexto
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
 * Detecta intenciones sin contexto (método de fallback)
 * @param {string} message - Mensaje del usuario
 * @param {Object} options - Opciones adicionales
 * @returns {Object} - Intenciones detectadas
 */
const detectIntentsBasic = async (message, options = {}) => {
    try {
        // Obtener intenciones desde la base de datos
        const nlpIntents = await intentService.getIntentsForNLP();
        
        const variables = {
            supportedIntents: options.supportedIntents || nlpIntents.supportedIntents,
            intentExamples: options.intentExamples || nlpIntents.intentExamples,
            conversationExamples: options.conversationExamples || nlpIntents.conversationExamples,
            serviceType: options.serviceType || 'ERP'
        };

        const result = await promptService.detectIntentions(message, 'intent-detection', variables);
        
        // Aplicar el mismo post-procesamiento basado en datos
        return postProcessIntentDetection(message, result, nlpIntents);
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
        // Obtener entidades desde la base de datos
        const nlpEntities = await entityService.getEntitiesForNLP();
        
        const variables = {
            supportedEntities: options.supportedEntities || nlpEntities.supportedEntities,
            serviceType: options.serviceType || 'ERP'
        };

        return await promptService.extractEntities(message, 'entity-extraction', variables);
    } catch (error) {
        logger.error(`Error en extracción básica de entidades: ${error.message}`);
        return {};
    }
};

// Copiar el resto de las funciones del nlpService original...
const analyzeContextualCoherence = async (message, intents, context) => {
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
            const currentTopicIntents = await getIntentsForTopic(context.currentTopic);
            const hasRelatedIntent = intents.some(intent => currentTopicIntents.includes(intent));
            
            if (!hasRelatedIntent) {
                analysis.topicContinuity = false;
                analysis.coherenceScore -= 0.3;
                analysis.contextualClues.push('Cambio de tema detectado');
            }
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

const getIntentsForTopic = async (topic) => {
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
        'general': null
    };
    
    if (topic === 'general' || !topicIntentMapping[topic]) {
        try {
            const nlpIntents = await intentService.getIntentsForNLP();
            return nlpIntents.supportedIntents;
        } catch (error) {
            logger.error(`Error obteniendo intenciones de BD: ${error.message}`);
            return [];
        }
    }
    
    return topicIntentMapping[topic] || [];
};

const getPrimaryIntentWithContext = async (intents, context) => {
    if (!intents || intents.length === 0) {
        return null;
    }

    // Si hay contexto de tema actual, priorizar intenciones relacionadas
    if (context.currentTopic) {
        const topicIntents = await getIntentsForTopic(context.currentTopic);
        const contextualIntent = intents.find(intent => topicIntents.includes(intent));
        
        if (contextualIntent) {
            logger.debug(`Intención contextual seleccionada: ${contextualIntent} para tema: ${context.currentTopic}`);
            return contextualIntent;
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

const detectContextChange = async (currentIntents, context) => {
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
        change.confidence = await calculateTopicChangeConfidence(currentIntents, context);
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

const calculateTopicChangeConfidence = async (intents, context) => {
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
    const newTopicIntents = await getIntentsForTopic(newTopic);
    const matchingIntents = intents.filter(intent => newTopicIntents.includes(intent));
    
    if (matchingIntents.length > 1) {
        confidence += 0.2;
    }
    
    return Math.min(Math.max(confidence, 0), 1);
};

/**
 * Post-procesa los resultados de detección de intenciones usando patrones de la base de datos
 * @param {string} message - Mensaje original del usuario
 * @param {Object} result - Resultado de la detección de intenciones
 * @param {Object} nlpData - Datos de intenciones de la base de datos
 * @returns {Object} - Resultado procesado
 */
const postProcessIntentDetection = (message, result, nlpData) => {
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
};

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
        'confirmacion': 'confirmation',
        'guia_reportes': 'report_tutorial',
        'tutorial_general': 'general_tutorial'
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

module.exports = {
    detectIntentsWithContext,
    extractEntitiesWithContext,
    enrichEntitiesWithContext,
    analyzeContextualCoherence,
    getPrimaryIntentWithContext,
    detectContextChange,
    determineTopicFromIntents,
    calculateTopicChangeConfidence,
    // Métodos de fallback
    detectIntentsBasic,
    extractEntitiesBasic
};