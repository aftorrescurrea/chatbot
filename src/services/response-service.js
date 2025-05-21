/**
 * Servicio de generación de respuestas
 * Genera respuestas para los usuarios basadas en intenciones y entidades
 */

const { logger } = require('../utils/logger');
const { responseConfig, generalConfig } = require('../config/promptConfig');
const promptService = require('./promptService');
const { renderTemplate } = require('../utils/promptTemplates');

/**
 * Genera una respuesta para el usuario basada en las intenciones y entidades detectadas
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {Promise<string>} - Respuesta generada
 */
const generateResponse = async (message, intents, entities, userData, conversationContext) => {
    try {
        if (!intents || intents.length === 0) {
            return generateDefaultResponse(message);
        }
        
        // Si hay un flujo de conversación activo, priorizar ese flujo
        if (conversationContext.conversationState) {
            return generateFlowResponse(message, intents, entities, userData, conversationContext);
        }
        
        // Según la intención principal, generar respuesta apropiada
        const primaryIntent = intents[0];
        
        switch (primaryIntent) {
            case 'saludo':
                return generateWelcomeResponse(userData, entities);
                
            case 'despedida':
                return generateGoodbyeResponse(userData);
                
            case 'agradecimiento':
                return generateThankYouResponse(userData);
                
            case 'solicitud_prueba':
                return generateTrialRequestResponse(entities, userData, conversationContext);
                
            case 'soporte_tecnico':
                return generateSupportResponse(entities, userData);
                
            case 'consulta_caracteristicas':
                return generateFeaturesResponse(entities);
                
            case 'consulta_precio':
                return generatePricingResponse(entities);
                
            case 'queja':
            case 'cancelacion':
                return generateConcernResponse(primaryIntent, entities, userData);
                
            default:
                // Para otras intenciones o combinaciones, usar el servicio de prompts
                return promptService.generateResponse(
                    message, 
                    intents, 
                    entities, 
                    userData, 
                    conversationContext
                );
        }
    } catch (error) {
        logger.error(`Error al generar respuesta: ${error.message}`);
        return "Lo siento, estoy teniendo problemas para procesar tu solicitud en este momento. Por favor, intenta de nuevo más tarde.";
    }
};

/**
 * Genera una respuesta por defecto
 * @param {string} message - Mensaje del usuario
 * @returns {string} - Respuesta generada
 */
const generateDefaultResponse = (message) => {
    return "Disculpa, no he podido entender bien tu mensaje. ¿Podrías ser más específico sobre lo que necesitas? Puedo ayudarte con información sobre nuestro sistema, crear una cuenta de prueba o resolver dudas técnicas.";
};

/**
 * Genera una respuesta de bienvenida
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @param {Object} entities - Entidades extraídas
 * @returns {string} - Respuesta generada
 */
const generateWelcomeResponse = (userData, entities) => {
    const userName = entities.nombre || (userData ? userData.name : null);
    
    // Renderizar la plantilla de bienvenida
    return renderTemplate(responseConfig.responseTemplates.welcome, {
        nombre: userName || "",
        service: generalConfig.serviceMetadata
    });
};

/**
 * Genera una respuesta de despedida
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @returns {string} - Respuesta generada
 */
const generateGoodbyeResponse = (userData) => {
    // Renderizar la plantilla de despedida
    return renderTemplate(responseConfig.responseTemplates.goodbye, {
        nombre: userData ? userData.name : "",
        service: generalConfig.serviceMetadata
    });
};

/**
 * Genera una respuesta a un agradecimiento
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @returns {string} - Respuesta generada
 */
const generateThankYouResponse = (userData) => {
    const userName = userData ? userData.name : "";
    
    if (userName) {
        return `¡Ha sido un placer ayudarte, ${userName}! Estamos aquí para lo que necesites.`;
    } else {
        return "¡Ha sido un placer! Estamos aquí para ayudarte en lo que necesites.";
    }
};

/**
 * Genera una respuesta para solicitud de prueba
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {string} - Respuesta generada
 */
const generateTrialRequestResponse = (entities, userData, conversationContext) => {
    // Determinar qué información falta para completar la solicitud
    const missingFields = [];
    if (!entities.nombre && (!userData || !userData.name)) missingFields.push("nombre completo");
    if (!entities.email && (!userData || !userData.email)) missingFields.push("correo electrónico");
    if (!entities.usuario) missingFields.push("nombre de usuario deseado");
    if (!entities.clave) missingFields.push("contraseña");
    
    // Si falta información, solicitar lo que falta
    if (missingFields.length > 0) {
        return renderTemplate(responseConfig.responseTemplates.missingInfo, {
            missingFields: missingFields.join(", "),
            service: generalConfig.serviceMetadata
        });
    }
    
    // Si tenemos toda la información necesaria, confirmar la creación de la cuenta
    return renderTemplate(responseConfig.responseTemplates.trialConfirmation, {
        nombre: entities.nombre || (userData ? userData.name : ""),
        usuario: entities.usuario,
        clave: entities.clave,
        service: generalConfig.serviceMetadata
    });
};

/**
 * Genera una respuesta para soporte técnico
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @returns {string} - Respuesta generada
 */
const generateSupportResponse = (entities, userData) => {
    // Renderizar la plantilla de soporte
    return renderTemplate(responseConfig.responseTemplates.supportResponse, {
        nombre: userData ? userData.name : "",
        usuario: entities.usuario || "",
        service: generalConfig.serviceMetadata
    });
};

/**
 * Genera una respuesta sobre características del sistema
 * @param {Object} entities - Entidades extraídas
 * @returns {string} - Respuesta generada
 */
const generateFeaturesResponse = (entities) => {
    // Renderizar la plantilla de características
    return renderTemplate(responseConfig.responseTemplates.featuresList, {
        service: generalConfig.serviceMetadata
    });
};

/**
 * Genera una respuesta sobre precios
 * @param {Object} entities - Entidades extraídas
 * @returns {string} - Respuesta generada
 */
const generatePricingResponse = (entities) => {
    return `Gracias por tu interés en ${generalConfig.serviceMetadata.name}. Ofrecemos diferentes planes según el tamaño de tu empresa y tus necesidades específicas. Para recibir una cotización personalizada, por favor compártenos más detalles sobre tu empresa: número de usuarios que necesitarías y módulos de interés. También puedes escribir directamente a nuestro equipo de ventas a ventas@erp-demo.ejemplo.com.`;
};

/**
 * Genera una respuesta para quejas o cancelaciones
 * @param {string} intent - Intención detectada
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @returns {string} - Respuesta generada
 */
const generateConcernResponse = (intent, entities, userData) => {
    const userName = userData ? userData.name : "";
    
    if (intent === 'queja') {
        return `Lamentamos que estés experimentando problemas${userName ? `, ${userName}` : ""}. Nos tomamos muy en serio tus comentarios. Para poder ayudarte mejor, ¿podrías proporcionar más detalles sobre el inconveniente que has tenido? Alternativamente, puedes contactar directamente a nuestro equipo de soporte en ${generalConfig.serviceMetadata.adminContact}.`;
    } else {
        return `Entendemos tu solicitud de cancelación${userName ? `, ${userName}` : ""}. Si deseas proceder con la cancelación, por favor contáctanos en ${generalConfig.serviceMetadata.adminContact} indicando el motivo de tu decisión. Nos gustaría conocer tu experiencia para mejorar nuestro servicio. ¿Hay algo específico que podamos hacer para satisfacer mejor tus necesidades?`;
    }
};

/**
 * Genera una respuesta basada en el flujo de conversación actual
 * @param {string} message - Mensaje del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {string} - Respuesta generada
 */
const generateFlowResponse = (message, intents, entities, userData, conversationContext) => {
    switch (conversationContext.conversationState) {
        case 'trial_request':
            return handleTrialRequestFlow(message, entities, userData, conversationContext);
            
        case 'support_request':
            return handleSupportFlow(message, entities, userData, conversationContext);
            
        default:
            // Para otros flujos, usar el servicio de prompts
            return promptService.generateResponse(
                message, 
                intents, 
                entities, 
                userData, 
                conversationContext
            );
    }
};

/**
 * Maneja el flujo de solicitud de prueba
 * @param {string} message - Mensaje del usuario
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {string} - Respuesta generada
 */
const handleTrialRequestFlow = (message, entities, userData, conversationContext) => {
    // Obtener estado actual del flujo
    const { currentStep, missingInfo, collectedData } = conversationContext;
    const mergedData = { ...collectedData, ...entities };
    
    // Si estamos en el último paso o tenemos toda la información
    if (currentStep >= missingInfo.length || 
        (mergedData.nombre && mergedData.email && mergedData.usuario && mergedData.clave)) {
        
        // Confirmar la creación de la cuenta
        return renderTemplate(responseConfig.responseTemplates.trialConfirmation, {
            nombre: mergedData.nombre || (userData ? userData.name : ""),
            usuario: mergedData.usuario,
            clave: mergedData.clave,
            service: generalConfig.serviceMetadata
        });
    }
    
    // Determinar qué información estamos solicitando en este paso
    const currentField = missingInfo[currentStep];
    let responseMessage = "";
    
    switch (currentField) {
        case 'nombre':
            if (entities.nombre) {
                responseMessage = `Gracias ${entities.nombre}. `;
                if (missingInfo.includes('email')) {
                    responseMessage += "Ahora necesito tu correo electrónico para enviarte la información de acceso. ¿Cuál es tu email?";
                } else if (missingInfo.includes('usuario')) {
                    responseMessage += "Ahora necesito que elijas un nombre de usuario para acceder al sistema. ¿Qué usuario te gustaría utilizar?";
                } else if (missingInfo.includes('clave')) {
                    responseMessage += "Por último, necesito que establezcas una contraseña para tu cuenta (mínimo 6 caracteres). ¿Qué contraseña te gustaría usar?";
                }
            } else {
                responseMessage = "Por favor, necesito tu nombre completo para registrarte. ¿Cuál es tu nombre?";
            }
            break;
            
        case 'email':
            if (entities.email) {
                responseMessage = `Perfecto, he registrado tu email: ${entities.email}. `;
                if (missingInfo.includes('usuario')) {
                    responseMessage += "Ahora necesito que elijas un nombre de usuario para acceder al sistema. ¿Qué usuario te gustaría utilizar?";
                } else if (missingInfo.includes('clave')) {
                    responseMessage += "Por último, necesito que establezcas una contraseña para tu cuenta (mínimo 6 caracteres). ¿Qué contraseña te gustaría usar?";
                }
            } else {
                responseMessage = "Necesito tu correo electrónico para enviarte la información de acceso. ¿Cuál es tu email?";
            }
            break;
            
        case 'usuario':
            if (entities.usuario) {
                responseMessage = `He registrado tu nombre de usuario: ${entities.usuario}. `;
                if (missingInfo.includes('clave')) {
                    responseMessage += "Por último, necesito que establezcas una contraseña para tu cuenta (mínimo 6 caracteres). ¿Qué contraseña te gustaría usar?";
                }
            } else {
                responseMessage = "Necesito que elijas un nombre de usuario para acceder al sistema. ¿Qué usuario te gustaría utilizar?";
            }
            break;
            
        case 'clave':
            if (entities.clave) {
                responseMessage = `Perfecto, he registrado tu contraseña. `;
                // Este debería ser el último paso del flujo
                responseMessage += "Estoy preparando tu cuenta de prueba...";
            } else {
                responseMessage = "Por último, necesito que establezcas una contraseña para tu cuenta (mínimo 6 caracteres). ¿Qué contraseña te gustaría usar?";
            }
            break;
            
        default:
            responseMessage = "¿Podrías proporcionarme más información para completar tu solicitud?";
    }
    
    return responseMessage;
};

/**
 * Maneja el flujo de soporte técnico
 * @param {string} message - Mensaje del usuario
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario (si está disponible)
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {string} - Respuesta generada
 */
const handleSupportFlow = (message, entities, userData, conversationContext) => {
    // Implementación básica del flujo de soporte
    return `Gracias por proporcionar esa información. Nuestro equipo de soporte técnico revisará tu caso y te contactará lo antes posible al correo asociado a tu cuenta. Si necesitas asistencia inmediata, puedes llamar a nuestra línea de soporte al 555-123-4567, disponible de lunes a viernes de 9 AM a 6 PM.`;
};

// Exportar funciones
module.exports = {
    generateResponse,
    generateDefaultResponse,
    generateWelcomeResponse,
    generateGoodbyeResponse,
    generateTrialRequestResponse,
    generateSupportResponse,
    generateFeaturesResponse,
    generatePricingResponse,
    generateConcernResponse
};