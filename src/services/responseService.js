/**
 * Servicio de generación de respuestas contextual mejorado
 * Genera respuestas inteligentes basadas en contexto conversacional completo
 */

const { logger } = require('../utils/logger');
const { responseConfig, generalConfig } = require('../config/promptConfig');
const { renderTemplate } = require('../utils/promptTemplates');
const promptService = require('./promptService');

/**
 * Genera una respuesta contextual para el usuario
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {Promise<string>} - Respuesta generada
 */
const generateResponse = async (message, intents, entities, userData, conversationContext) => {
    try {
        logger.debug(`Generando respuesta contextual para intenciones: ${JSON.stringify(intents)}`);
        
        // Analizar el contexto para determinar el tipo de respuesta
        const responseContext = analyzeResponseContext(intents, entities, userData, conversationContext);
        
        // Si hay un flujo activo, priorizar respuesta de flujo
        if (conversationContext.activeFlow) {
            return await generateFlowResponse(message, intents, entities, userData, conversationContext, responseContext);
        }
        
        // Si hay cambio de contexto significativo, reconocerlo
        if (conversationContext.contextChange && conversationContext.contextChange.hasChanged && conversationContext.contextChange.confidence > 0.7) {
            return await generateContextTransitionResponse(message, intents, entities, userData, conversationContext, responseContext);
        }
        
        // Respuesta basada en intención principal
        if (intents && intents.length > 0) {
            return await generateIntentBasedResponse(message, intents, entities, userData, conversationContext, responseContext);
        }
        
        // Respuesta por defecto contextual
        return generateContextualDefaultResponse(message, userData, conversationContext);
        
    } catch (error) {
        logger.error(`Error al generar respuesta contextual: ${error.message}`);
        return generateErrorResponse(userData, conversationContext);
    }
};

/**
 * Analiza el contexto para determinar el tipo de respuesta apropiada
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {Object} - Análisis del contexto de respuesta
 */
const analyzeResponseContext = (intents, entities, userData, conversationContext) => {
    return {
        hasUserProfile: userData !== null,
        isRegisteredUser: userData && userData.email && !userData.email.includes('@temp.com'),
        hasActiveFlow: conversationContext.activeFlow !== null,
        hasContextChange: conversationContext.contextChange && conversationContext.contextChange.hasChanged,
        knownEntitiesCount: conversationContext.userKnowledge ? Object.keys(conversationContext.userKnowledge).length : 0,
        conversationDepth: conversationContext.conversationHistory ? conversationContext.conversationHistory.length : 0,
        topicStability: conversationContext.contextualClues ? conversationContext.contextualClues.topicStability : 0,
        primaryIntent: intents && intents.length > 0 ? intents[0] : null,
        entityTypes: entities ? Object.keys(entities) : [],
        timeOfDay: new Date().getHours(),
        isReturningUser: conversationContext.conversationLength > 5 * 60 * 1000 // Más de 5 minutos de conversación
    };
};

/**
 * Genera respuesta para flujos activos
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {Promise<string>} - Respuesta generada
 */
const generateFlowResponse = async (message, intents, entities, userData, conversationContext, responseContext) => {
    const activeFlow = conversationContext.activeFlow;
    
    switch (activeFlow.flowType) {
        case 'trial_request':
            return await generateTrialFlowResponse(message, intents, entities, userData, conversationContext, responseContext);
            
        case 'support_request':
            return await generateSupportFlowResponse(message, intents, entities, userData, conversationContext, responseContext);
            
        default:
            logger.warn(`Tipo de flujo desconocido en respuesta: ${activeFlow.flowType}`);
            return await generateIntentBasedResponse(message, intents, entities, userData, conversationContext, responseContext);
    }
};

/**
 * Genera respuesta para el flujo de solicitud de prueba
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {Promise<string>} - Respuesta generada
 */
const generateTrialFlowResponse = async (message, intents, entities, userData, conversationContext, responseContext) => {
    const activeFlow = conversationContext.activeFlow;
    const userName = getUserName(userData, conversationContext);
    
    // Si tenemos toda la información necesaria, confirmar creación
    if (activeFlow.flowData && !activeFlow.flowData.missingFields?.length) {
        return renderTemplate(responseConfig.responseTemplates.trialConfirmation, {
            nombre: userName,
            usuario: activeFlow.flowData.usuario || entities.usuario,
            clave: activeFlow.flowData.clave || entities.clave,
            service: generalConfig.serviceMetadata
        });
    }
    
    // Determinar qué información solicitar a continuación
    const missingFields = activeFlow.flowData?.missingFields || [];
    const currentStep = activeFlow.currentStep || 0;
    
    if (missingFields.length > 0) {
        const nextField = missingFields[Math.min(currentStep, missingFields.length - 1)];
        
        // Generar solicitud contextual para el siguiente campo
        return generateFieldRequestResponse(nextField, userName, entities, conversationContext);
    }
    
    // Fallback
    return `Perfecto${userName ? `, ${userName}` : ''}. Estoy procesando tu solicitud de cuenta de prueba. En un momento tendrás tus credenciales de acceso.`;
};

/**
 * Genera respuesta para el flujo de soporte técnico
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {Promise<string>} - Respuesta generada
 */
const generateSupportFlowResponse = async (message, intents, entities, userData, conversationContext, responseContext) => {
    const userName = getUserName(userData, conversationContext);
    const activeFlow = conversationContext.activeFlow;
    
    if (activeFlow.currentStep === 0) {
        return `Entiendo que necesitas ayuda técnica${userName ? `, ${userName}` : ''}. Para poder asistirte mejor, ¿podrías describirme con más detalle el problema que estás experimentando? Por ejemplo, ¿en qué módulo del sistema ocurre y qué mensaje de error ves?`;
    } else if (activeFlow.currentStep === 1) {
        return `Gracias por la información adicional. He registrado tu consulta de soporte${userName ? ` para ${userName}` : ''}. Nuestro equipo técnico revisará tu caso y te contactará dentro de las próximas 2 horas. Si necesitas asistencia inmediata, puedes contactar directamente a ${generalConfig.serviceMetadata.adminContact}.`;
    }
    
    return renderTemplate(responseConfig.responseTemplates.supportResponse, {
        nombre: userName,
        service: generalConfig.serviceMetadata
    });
};

/**
 * Genera respuesta para transiciones de contexto
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {Promise<string>} - Respuesta generada
 */
const generateContextTransitionResponse = async (message, intents, entities, userData, conversationContext, responseContext) => {
    const userName = getUserName(userData, conversationContext);
    const contextChange = conversationContext.contextChange;
    
    // Reconocer el cambio de tema explícitamente
    let transitionPhrase = '';
    
    if (contextChange.previousTopic && contextChange.suggestedTopic) {
        const topicNames = {
            'trial_request': 'solicitud de prueba',
            'technical_support': 'soporte técnico',
            'pricing_inquiry': 'consulta de precios',
            'features_inquiry': 'características del sistema',
            'service_interest': 'información del servicio'
        };
        
        const previousTopicName = topicNames[contextChange.previousTopic] || contextChange.previousTopic;
        const newTopicName = topicNames[contextChange.suggestedTopic] || contextChange.suggestedTopic;
        
        transitionPhrase = `Perfecto${userName ? `, ${userName}` : ''}, veo que ahora te interesa ${newTopicName}. `;
    }
    
    // Generar respuesta para la nueva intención
    const intentResponse = await generateIntentBasedResponse(message, intents, entities, userData, conversationContext, responseContext);
    
    return transitionPhrase + intentResponse;
};

/**
 * Genera respuesta basada en intenciones
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {Promise<string>} - Respuesta generada
 */
const generateIntentBasedResponse = async (message, intents, entities, userData, conversationContext, responseContext) => {
    const primaryIntent = intents[0];
    const userName = getUserName(userData, conversationContext);
    
    switch (primaryIntent) {
        case 'saludo':
            return generateGreetingResponse(userName, userData, conversationContext, responseContext);
            
        case 'despedida':
            return generateFarewellResponse(userName, userData, conversationContext);
            
        case 'agradecimiento':
            return generateGratitudeResponse(userName, userData, conversationContext);
            
        case 'solicitud_prueba':
            return generateTrialRequestResponse(entities, userData, conversationContext, responseContext);
            
        case 'soporte_tecnico':
            return generateSupportResponse(entities, userData, conversationContext);
            
        case 'consulta_caracteristicas':
            return generateFeaturesResponse(entities, userData, conversationContext);
            
        case 'consulta_precio':
            return generatePricingResponse(entities, userData, conversationContext);
            
        case 'interes_en_servicio':
            return generateServiceInterestResponse(entities, userData, conversationContext, responseContext);
            
        case 'confirmacion':
            return await generateConfirmationResponse(message, entities, userData, conversationContext, responseContext);
            
        case 'queja':
            return generateComplaintResponse(entities, userData, conversationContext);
            
        case 'cancelacion':
            return generateCancellationResponse(entities, userData, conversationContext);
            
        default:
            // Usar el servicio de prompts para generar respuesta personalizada
            return await promptService.generateResponse(message, intents, entities, userData, conversationContext);
    }
};

/**
 * Genera respuesta de saludo contextual
 * @param {string} userName - Nombre del usuario
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {string} - Respuesta generada
 */
const generateGreetingResponse = (userName, userData, conversationContext, responseContext) => {
    let greeting = '';
    
    // Personalizar saludo según hora del día
    const hour = responseContext.timeOfDay;
    if (hour < 12) {
        greeting = 'Buenos días';
    } else if (hour < 18) {
        greeting = 'Buenas tardes';
    } else {
        greeting = 'Buenas noches';
    }
    
    // Personalizar según si es usuario conocido
    if (responseContext.isReturningUser && userName) {
        return `${greeting}, ${userName}! Me alegra verte de nuevo. ¿En qué puedo ayudarte hoy?`;
    } else if (userName) {
        return `${greeting}, ${userName}! Soy el asistente virtual de ${generalConfig.serviceMetadata.name}. ¿En qué puedo ayudarte?`;
    } else {
        return `${greeting}! Soy el asistente virtual de ${generalConfig.serviceMetadata.name}. Estoy aquí para ayudarte con información sobre nuestro sistema ${generalConfig.serviceMetadata.type} y crear cuentas de prueba. ¿En qué puedo ayudarte?`;
    }
};

/**
 * Genera respuesta de despedida contextual
 * @param {string} userName - Nombre del usuario
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generateFarewellResponse = (userName, userData, conversationContext) => {
    const hasCompletedAction = conversationContext.topicHistory && 
        conversationContext.topicHistory.some(topic => topic.topic === 'trial_request');
    
    if (hasCompletedAction && userName) {
        return `¡Hasta pronto, ${userName}! Disfruta explorando ${generalConfig.serviceMetadata.name} y no dudes en contactarnos si tienes alguna pregunta.`;
    } else if (userName) {
        return `¡Hasta luego, ${userName}! Ha sido un placer ayudarte. Si necesitas algo más, no dudes en escribirme.`;
    } else {
        return renderTemplate(responseConfig.responseTemplates.goodbye, {
            service: generalConfig.serviceMetadata
        });
    }
};

/**
 * Genera respuesta de agradecimiento
 * @param {string} userName - Nombre del usuario
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generateGratitudeResponse = (userName, userData, conversationContext) => {
    if (userName) {
        return `¡Ha sido un placer ayudarte, ${userName}! Espero que ${generalConfig.serviceMetadata.name} sea exactamente lo que necesitas para tu empresa.`;
    } else {
        return "¡Ha sido un placer! Si tienes más preguntas en el futuro, no dudes en contactarnos.";
    }
};

/**
 * Genera respuesta para solicitud de prueba
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {string} - Respuesta generada
 */
const generateTrialRequestResponse = (entities, userData, conversationContext, responseContext) => {
    const userName = getUserName(userData, conversationContext);
    
    // Combinar información conocida con entidades actuales
    const allKnownData = {
        ...conversationContext.userKnowledge,
        ...entities,
        ...(userData ? {
            nombre: userData.name,
            email: userData.email,
            empresa: userData.company,
            cargo: userData.position
        } : {})
    };
    
    // Determinar qué información falta
    const missingFields = [];
    if (!allKnownData.nombre) missingFields.push('nombre completo');
    if (!allKnownData.email) missingFields.push('correo electrónico');
    if (!allKnownData.usuario) missingFields.push('nombre de usuario deseado');
    if (!allKnownData.clave) missingFields.push('contraseña');
    
    if (missingFields.length === 0) {
        // Tenemos toda la información - confirmar
        return `¡Excelente${userName ? `, ${userName}` : ''}! Tengo toda la información necesaria. Voy a crear tu cuenta de prueba de ${generalConfig.serviceMetadata.trialDuration} días ahora mismo.`;
    } else if (missingFields.length === 1) {
        // Solo falta un campo
        return `Perfecto${userName ? `, ${userName}` : ''}! Solo necesito una cosa más: tu ${missingFields[0]}. ¿Podrías proporcionármelo?`;
    } else {
        // Faltan múltiples campos
        return `¡Genial${userName ? `, ${userName}` : ''}! Me encanta que quieras probar ${generalConfig.serviceMetadata.name}. Para crear tu cuenta necesito: ${missingFields.join(', ')}. ¿Podrías ayudarme con esta información?`;
    }
};

/**
 * Genera respuesta para confirmación contextual
 * @param {string} message - Mensaje del usuario
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {Promise<string>} - Respuesta generada
 */
const generateConfirmationResponse = async (message, entities, userData, conversationContext, responseContext) => {
    const userName = getUserName(userData, conversationContext);
    
    // Si hay un flujo activo, la confirmación probablemente se refiere a ese flujo
    if (conversationContext.activeFlow) {
        return `Perfecto${userName ? `, ${userName}` : ''}! Continuemos con tu ${conversationContext.activeFlow.flowType === 'trial_request' ? 'solicitud de cuenta de prueba' : 'consulta'}.`;
    }
    
    // Si hay información conocida que podría estar confirmando
    if (conversationContext.userKnowledge && Object.keys(conversationContext.userKnowledge).length > 0) {
        return `Perfecto${userName ? `, ${userName}` : ''}! He confirmado tu información. ¿En qué más puedo ayudarte?`;
    }
    
    // Confirmación general
    return `Entendido${userName ? `, ${userName}` : ''}. ¿Hay algo específico en lo que pueda ayudarte con ${generalConfig.serviceMetadata.name}?`;
};

/**
 * Genera respuesta para consulta de características
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generateFeaturesResponse = (entities, userData, conversationContext) => {
    const userName = getUserName(userData, conversationContext);
    const userCompany = userData?.company || conversationContext.userKnowledge?.empresa;
    
    let response = `Me alegra tu interés en las características de ${generalConfig.serviceMetadata.name}${userName ? `, ${userName}` : ''}`;
    
    if (userCompany) {
        response += ` para ${userCompany}`;
    }
    
    response += '. ';
    
    return response + renderTemplate(responseConfig.responseTemplates.featuresList, {
        service: generalConfig.serviceMetadata
    });
};

/**
 * Genera respuesta para consulta de precios
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generatePricingResponse = (entities, userData, conversationContext) => {
    const userName = getUserName(userData, conversationContext);
    const userCompany = userData?.company || conversationContext.userKnowledge?.empresa;
    const employeeCount = conversationContext.userKnowledge?.numero_empleados;
    
    let response = `Gracias por preguntar sobre nuestros precios${userName ? `, ${userName}` : ''}. `;
    
    if (userCompany && employeeCount) {
        response += `Para ${userCompany} con ${employeeCount} empleados, `;
    } else if (userCompany) {
        response += `Para ${userCompany}, `;
    }
    
    response += `ofrecemos planes personalizados según el tamaño de tu empresa y las funcionalidades que necesites. Te recomiendo que contactes a nuestro equipo de ventas en ventas@erp-demo.ejemplo.com para recibir una cotización detallada.`;
    
    if (!entities.usuario && !conversationContext.activeFlow) {
        response += ` También puedes solicitar una prueba gratuita de ${generalConfig.serviceMetadata.trialDuration} días para evaluar el sistema.`;
    }
    
    return response;
};

/**
 * Genera respuesta para interés en el servicio
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} responseContext - Contexto de respuesta
 * @returns {string} - Respuesta generada
 */
const generateServiceInterestResponse = (entities, userData, conversationContext, responseContext) => {
    const userName = getUserName(userData, conversationContext);
    const userCompany = userData?.company || conversationContext.userKnowledge?.empresa;
    
    let response = `¡Excelente${userName ? `, ${userName}` : ''}! Me alegra mucho tu interés en ${generalConfig.serviceMetadata.name}`;
    
    if (userCompany) {
        response += ` para ${userCompany}`;
    }
    
    response += '. ';
    
    // Personalizar según el contexto
    if (responseContext.isReturningUser) {
        response += 'Como ya hemos hablado antes, sabes que nuestro sistema incluye ';
    } else {
        response += 'Nuestro sistema incluye ';
    }
    
    response += `${generalConfig.serviceMetadata.features.slice(0, 3).join(', ')} y mucho más. `;
    response += `¿Te gustaría una demostración gratuita de ${generalConfig.serviceMetadata.trialDuration} días para probarlo?`;
    
    return response;
};

/**
 * Genera respuesta para quejas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generateComplaintResponse = (entities, userData, conversationContext) => {
    const userName = getUserName(userData, conversationContext);
    
    return `Lamento mucho que hayas tenido una experiencia negativa${userName ? `, ${userName}` : ''}. Tu satisfacción es muy importante para nosotros. Por favor, compárteme más detalles sobre lo que ha ocurrido para poder ayudarte a resolverlo. También puedes contactar directamente a nuestro equipo de atención al cliente en ${generalConfig.serviceMetadata.adminContact}.`;
};

/**
 * Genera respuesta para cancelaciones
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generateCancellationResponse = (entities, userData, conversationContext) => {
    const userName = getUserName(userData, conversationContext);
    
    return `Entiendo tu decisión de cancelar${userName ? `, ${userName}` : ''}. Lamentamos que ${generalConfig.serviceMetadata.name} no haya cumplido tus expectativas. ¿Podrías contarnos brevemente qué podríamos haber hecho mejor? Tu feedback nos ayuda a mejorar. Para procesar la cancelación, por favor contacta a ${generalConfig.serviceMetadata.adminContact}.`;
};

/**
 * Genera respuesta para soporte técnico
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generateSupportResponse = (entities, userData, conversationContext) => {
    const userName = getUserName(userData, conversationContext);
    
    return renderTemplate(responseConfig.responseTemplates.supportResponse, {
        nombre: userName,
        usuario: entities.usuario || '',
        service: generalConfig.serviceMetadata
    });
};

/**
 * Genera solicitud contextual para un campo específico
 * @param {string} fieldName - Nombre del campo a solicitar
 * @param {string} userName - Nombre del usuario
 * @param {Object} entities - Entidades recién extraídas
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generateFieldRequestResponse = (fieldName, userName, entities, conversationContext) => {
    const userPrefix = userName ? `Perfecto, ${userName}. ` : '';
    
    switch (fieldName) {
        case 'nombre':
            return `${userPrefix}Para crear tu cuenta de prueba, necesito tu nombre completo. ¿Cómo te llamas?`;
            
        case 'email':
            return `${userPrefix}Ahora necesito tu correo electrónico para enviarte la información de acceso. ¿Cuál es tu email?`;
            
        case 'usuario':
            return `${userPrefix}¿Qué nombre de usuario te gustaría usar para acceder al sistema? Puede ser algo como tu nombre seguido de números, por ejemplo.`;
            
        case 'clave':
            return `${userPrefix}Por último, establece una contraseña segura para tu cuenta (mínimo 6 caracteres, recomendado incluir números y símbolos). ¿Qué contraseña te gustaría usar?`;
            
        default:
            return `${userPrefix}Necesito un poco más de información para completar tu solicitud. ¿Podrías ayudarme?`;
    }
};

/**
 * Genera respuesta por defecto contextual
 * @param {string} message - Mensaje del usuario
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta generada
 */
const generateContextualDefaultResponse = (message, userData, conversationContext) => {
    const userName = getUserName(userData, conversationContext);
    
    // Si conocemos al usuario, personalizar la respuesta
    if (userName) {
        return `Disculpa ${userName}, no he podido entender completamente tu mensaje. ¿Podrías ser más específico sobre lo que necesitas? Puedo ayudarte con información sobre ${generalConfig.serviceMetadata.name}, crear una cuenta de prueba, o resolver dudas técnicas.`;
    }
    
    // Si hay historial de conversación, mostrar continuidad
    if (conversationContext.conversationHistory && conversationContext.conversationHistory.length > 0) {
        return "No he podido entender bien tu última solicitud. ¿Podrías reformular lo que necesitas? Estoy aquí para ayudarte con cualquier pregunta sobre nuestro sistema.";
    }
    
    // Respuesta por defecto estándar
    return "Disculpa, no he podido entender bien tu mensaje. ¿Podrías ser más específico sobre lo que necesitas? Puedo ayudarte con información sobre nuestro sistema, crear una cuenta de prueba o resolver dudas técnicas.";
};

/**
 * Genera respuesta de error contextual
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta de error
 */
const generateErrorResponse = (userData, conversationContext) => {
    const userName = getUserName(userData, conversationContext);
    
    if (userName) {
        return `Lo siento ${userName}, estoy experimentando problemas técnicos en este momento. Por favor, intenta nuevamente en unos minutos o contacta a nuestro equipo de soporte en ${generalConfig.serviceMetadata.adminContact}.`;
    }
    
    return "Lo siento, estoy teniendo problemas técnicos en este momento. Por favor, intenta de nuevo más tarde o contacta a nuestro equipo de soporte.";
};

/**
 * Obtiene el nombre del usuario desde múltiples fuentes
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string|null} - Nombre del usuario o null
 */
const getUserName = (userData, conversationContext) => {
    // Prioridad: userData > userProfile > knownEntities
    if (userData && userData.name && userData.name !== 'Usuario') {
        return userData.name;
    }
    
    if (conversationContext.userProfile && conversationContext.userProfile.name && conversationContext.userProfile.name !== 'Usuario') {
        return conversationContext.userProfile.name;
    }
    
    if (conversationContext.userKnowledge && conversationContext.userKnowledge.nombre) {
        return conversationContext.userKnowledge.nombre;
    }
    
    return null;
};

/**
 * Evalúa si una respuesta necesita ser más formal o casual
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} userData - Datos del usuario
 * @returns {string} - 'formal' o 'casual'
 */
const evaluateResponseTone = (conversationContext, userData) => {
    // Factores que sugieren formalidad:
    // - Usuario con empresa conocida
    // - Cargo directivo
    // - Consultas de precios o características empresariales
    
    const userCompany = userData?.company || conversationContext.userKnowledge?.empresa;
    const userPosition = userData?.position || conversationContext.userKnowledge?.cargo;
    const recentIntents = conversationContext.recentIntents || [];
    
    const formalFactors = [
        userCompany && userCompany.length > 0,
        userPosition && (userPosition.toLowerCase().includes('director') || userPosition.toLowerCase().includes('gerente')),
        recentIntents.includes('consulta_precio'),
        recentIntents.includes('consulta_caracteristicas'),
        conversationContext.currentTopic === 'pricing_inquiry'
    ];
    
    const formalScore = formalFactors.filter(Boolean).length;
    
    return formalScore >= 3 ? 'formal' : 'casual';
};

/**
 * Adapta el contenido de la respuesta según el perfil del usuario
 * @param {string} baseResponse - Respuesta base
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {string} - Respuesta adaptada
 */
const adaptResponseToUserProfile = (baseResponse, userData, conversationContext) => {
    const userCompany = userData?.company || conversationContext.userKnowledge?.empresa;
    const userIndustry = conversationContext.userKnowledge?.industria;
    const employeeCount = conversationContext.userKnowledge?.numero_empleados;
    
    let adaptedResponse = baseResponse;
    
    // Agregar información relevante según el perfil
    if (userIndustry && !adaptedResponse.includes(userIndustry)) {
        const industrySpecificFeatures = {
            'manufactura': 'gestión de inventario y control de producción',
            'retail': 'punto de venta y gestión de inventario',
            'servicios': 'facturación por horas y gestión de proyectos',
            'construcción': 'gestión de proyectos y control de costos',
            'salud': 'gestión de pacientes y facturación médica',
            'educación': 'gestión de estudiantes y recursos académicos'
        };
        
        const specificFeature = industrySpecificFeatures[userIndustry.toLowerCase()];
        if (specificFeature) {
            adaptedResponse += ` Especialmente útil para ${userIndustry} es nuestro módulo de ${specificFeature}.`;
        }
    }
    
    // Adaptar según tamaño de empresa
    if (employeeCount) {
        const empCount = parseInt(employeeCount);
        if (empCount > 100) {
            adaptedResponse += ' Para empresas de tu tamaño, recomendamos nuestro plan empresarial con funcionalidades avanzadas de reporting.';
        } else if (empCount < 10) {
            adaptedResponse += ' Para empresas pequeñas como la tuya, tenemos planes especialmente diseñados que son fáciles de implementar.';
        }
    }
    
    return adaptedResponse;
};

/**
 * Genera sugerencias proactivas basadas en el contexto
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} userData - Datos del usuario
 * @returns {string} - Sugerencias adicionales
 */
const generateProactiveSuggestions = (conversationContext, userData) => {
    const suggestions = [];
    const recentIntents = conversationContext.recentIntents || [];
    const currentTopic = conversationContext.currentTopic;
    
    // Sugerencias basadas en intenciones recientes
    if (recentIntents.includes('consulta_caracteristicas') && !recentIntents.includes('solicitud_prueba')) {
        suggestions.push('¿Te gustaría probar estas características con una cuenta de demostración?');
    }
    
    if (recentIntents.includes('consulta_precio') && !recentIntents.includes('solicitud_prueba')) {
        suggestions.push('Puedes evaluar el valor del sistema con nuestra prueba gratuita de 7 días.');
    }
    
    if (currentTopic === 'service_interest' && userData && !userData.email.includes('@temp.com')) {
        suggestions.push('También puedo programarte una demostración personalizada si prefieres.');
    }
    
    // Sugerencias basadas en perfil de usuario
    const userCompany = userData?.company || conversationContext.userKnowledge?.empresa;
    if (userCompany && !recentIntents.includes('consulta_caracteristicas')) {
        suggestions.push('¿Te gustaría saber qué funcionalidades serían más útiles para tu tipo de empresa?');
    }
    
    return suggestions.length > 0 ? ' ' + suggestions[0] : '';
};

// Exportar funciones principales
module.exports = {
    generateResponse,
    analyzeResponseContext,
    generateFlowResponse,
    generateTrialFlowResponse,
    generateSupportFlowResponse,
    generateContextTransitionResponse,
    generateIntentBasedResponse,
    generateGreetingResponse,
    generateFarewellResponse,
    generateGratitudeResponse,
    generateTrialRequestResponse,
    generateConfirmationResponse,
    generateFeaturesResponse,
    generatePricingResponse,
    generateServiceInterestResponse,
    generateComplaintResponse,
    generateCancellationResponse,
    generateSupportResponse,
    generateFieldRequestResponse,
    generateContextualDefaultResponse,
    generateErrorResponse,
    getUserName,
    evaluateResponseTone,
    adaptResponseToUserProfile,
    generateProactiveSuggestions
};