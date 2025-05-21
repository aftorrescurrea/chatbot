/**
 * Controlador para manejo de mensajes de WhatsApp
 * Procesa los mensajes entrantes y coordina la lógica de negocio
 */

const { detectIntents, getPrimaryIntent } = require('../services/nlpService');
const { extractEntities, getMissingUserData } = require('../services/entityService');
const { generateResponse } = require('../services/responseService');
const { createOrUpdateUser, findUserByPhone } = require('../services/userService');
const { createCredentials } = require('../services/credentialService');
const { saveMessage } = require('../services/conversationService');
const { logger } = require('../utils/logger');
const { generalConfig } = require('../config/promptConfig');

// Almacenamiento en memoria para el estado de las conversaciones
// En producción, esto debería estar en una base de datos
const conversationStates = new Map();

/**
 * Maneja los mensajes entrantes de WhatsApp
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} message - Mensaje recibido
 */
const handleMessage = async (client, message) => {
    try {
        const from = message.from;
        const body = message.body;
        
        logger.info(`Mensaje recibido de ${from}: ${body}`);
        
        // Guardar el mensaje en el historial de conversación
        await saveMessageToHistory(from, body, true);
        
        // Buscar usuario existente
        let user = await findUserByPhone(from);
        
        // Obtener el estado actual de la conversación
        let conversationState = getConversationState(from);
        
        // Detectar intenciones del mensaje
        const { intents } = await detectIntents(body);
        logger.info(`Intenciones detectadas: ${JSON.stringify(intents)}`);
        
        // Extraer entidades del mensaje
        const entities = await extractEntities(body);
        logger.info(`Entidades extraídas: ${JSON.stringify(entities)}`);
        
        // Si se detectó un nombre, actualizar el usuario si existe
        if (entities.nombre && user) {
            user.name = entities.nombre;
            await user.save();
            logger.info(`Nombre de usuario actualizado: ${from} -> ${entities.nombre}`);
        }
        
        // Crear usuario si no existe y se detectaron entidades suficientes
        if (!user && entities.nombre && (entities.email || entities.telefono)) {
            user = await createOrUpdateUser({
                phone: from,
                name: entities.nombre,
                email: entities.email || `${from.replace(/\D/g, '')}@temp.com`, // Email temporal basado en el teléfono
                company: entities.empresa || null,
                position: entities.cargo || null,
            });
            logger.info(`Nuevo usuario creado: ${user._id} (${entities.nombre})`);
        }
        
        // Preparar el contexto de la conversación para la respuesta
        const conversationContext = {
            conversationState: conversationState ? conversationState.state : null,
            currentStep: conversationState ? conversationState.currentStep : 0,
            missingInfo: conversationState ? conversationState.missingInfo : [],
            collectedData: conversationState ? conversationState.collectedData : {},
            conversationHistory: [] // Aquí se podría cargar historial desde la base de datos si es necesario
        };
        
        // Procesar intenciones y actualizar estado de la conversación
        await processIntents(intents, entities, user, from, conversationContext);
        
        // Generar respuesta basada en las intenciones, entidades y contexto
        const response = await generateResponse(
            body,
            intents,
            entities,
            user,
            conversationContext
        );
        
        // Enviar respuesta al usuario
        await client.sendMessage(from, response);
        
        // Guardar la respuesta en el historial
        await saveMessageToHistory(from, response, false);
        
        // Actualizar estado de la conversación según la respuesta y entidades
        await updateConversationState(from, intents, entities, conversationContext, response);
        
    } catch (error) {
        logger.error(`Error al procesar mensaje: ${error.message}`);
        logger.error(error.stack);
        
        try {
            // Intentar enviar un mensaje de error genérico
            await message.reply('Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta nuevamente más tarde.');
        } catch (replyError) {
            logger.error(`No se pudo enviar mensaje de error: ${replyError.message}`);
        }
    }
};

/**
 * Procesa las intenciones detectadas y actualiza el estado de la conversación
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario (si existe)
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} conversationContext - Contexto de la conversación
 */
const processIntents = async (intents, entities, user, phoneNumber, conversationContext) => {
    // Si no hay intenciones o ya hay un flujo en curso, no iniciar uno nuevo
    if (!intents.length || conversationContext.conversationState) {
        return;
    }
    
    // Obtener la intención principal
    const primaryIntent = getPrimaryIntent(intents);
    
    // Iniciar flujo según la intención principal
    switch (primaryIntent) {
        case 'solicitud_prueba':
            await startTrialRequestFlow(entities, user, phoneNumber, conversationContext);
            break;
            
        case 'soporte_tecnico':
            await startSupportFlow(entities, user, phoneNumber, conversationContext);
            break;
            
        // Podrían agregarse más flujos para otras intenciones
    }
};

/**
 * Inicia el flujo de solicitud de prueba
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario (si existe)
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} conversationContext - Contexto de la conversación
 */
const startTrialRequestFlow = async (entities, user, phoneNumber, conversationContext) => {
    // Verificar si ya tenemos toda la información necesaria
    const missingFields = getMissingUserData(entities, user);
    
    // Si no falta información, no es necesario iniciar un flujo
    if (missingFields.length === 0) {
        return;
    }
    
    // Iniciar flujo de solicitud de prueba
    setConversationState(phoneNumber, {
        state: 'trial_request',
        currentStep: 0,
        missingInfo: missingFields,
        collectedData: {
            ...entities,
            // Incluir datos del usuario si existe
            ...(user ? {
                nombre: user.name,
                email: user.email,
            } : {})
        },
        startTime: new Date()
    });
    
    // Actualizar el contexto de conversación
    conversationContext.conversationState = 'trial_request';
    conversationContext.currentStep = 0;
    conversationContext.missingInfo = missingFields;
    conversationContext.collectedData = entities;
};

/**
 * Inicia el flujo de soporte técnico
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario (si existe)
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} conversationContext - Contexto de la conversación
 */
const startSupportFlow = async (entities, user, phoneNumber, conversationContext) => {
    // Iniciar flujo de soporte técnico
    setConversationState(phoneNumber, {
        state: 'support_request',
        currentStep: 0,
        issueDescription: entities.problema || '',
        reportedFeature: entities.caracteristica || '',
        collectedData: entities,
        startTime: new Date()
    });
    
    // Actualizar el contexto de conversación
    conversationContext.conversationState = 'support_request';
    conversationContext.currentStep = 0;
    conversationContext.collectedData = entities;
};

/**
 * Actualiza el estado de la conversación después de enviar una respuesta
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de la conversación
 * @param {string} response - Respuesta enviada al usuario
 */
const updateConversationState = async (phoneNumber, intents, entities, conversationContext, response) => {
    // Si no hay un estado activo, no hay nada que actualizar
    if (!conversationContext.conversationState) {
        return;
    }
    
    // Obtener el estado actual
    const currentState = getConversationState(phoneNumber);
    
    if (!currentState) {
        return;
    }
    
    // Actualizar datos recolectados con nuevas entidades
    currentState.collectedData = {
        ...currentState.collectedData,
        ...entities
    };
    
    // Verificar si se ha completado toda la información necesaria
    if (currentState.state === 'trial_request') {
        const missingFields = getMissingUserData(currentState.collectedData);
        
        if (missingFields.length === 0) {
            // Si tenemos toda la información, procesar la solicitud de prueba
            await processCompletedTrialRequest(phoneNumber, currentState.collectedData);
            
            // Limpiar el estado de la conversación
            clearConversationState(phoneNumber);
            return;
        }
        
        // Si aún falta información pero hemos avanzado
        if (entities && Object.keys(entities).length > 0) {
            // Avanzar al siguiente paso
            currentState.currentStep++;
            setConversationState(phoneNumber, currentState);
        }
    } else if (currentState.state === 'support_request') {
        // Lógica para actualizar el flujo de soporte técnico
        // Por ejemplo, marcar como completado después de recibir descripción detallada
        
        if (response.includes("equipo de soporte revisará") || 
            response.includes("asistencia inmediata")) {
            // Señales de que el flujo ha terminado
            clearConversationState(phoneNumber);
            return;
        }
        
        // Avanzar en el flujo si se recibió información nueva
        if (entities && Object.keys(entities).length > 0) {
            currentState.currentStep++;
            setConversationState(phoneNumber, currentState);
        }
    }
    
    // Verificar si el flujo ha estado activo por mucho tiempo (timeout)
    const now = new Date();
    const flowDuration = (now - new Date(currentState.startTime)) / (1000 * 60); // en minutos
    
    if (flowDuration > 30) { // 30 minutos de timeout
        clearConversationState(phoneNumber);
        logger.info(`Flujo de ${currentState.state} para ${phoneNumber} expiró por timeout`);
    }
};

/**
 * Procesa una solicitud de prueba completa
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} data - Datos recopilados durante el flujo
 */
const processCompletedTrialRequest = async (phoneNumber, data) => {
    try {
        // Crear o actualizar usuario con los datos completos
        const user = await createOrUpdateUser({
            phone: phoneNumber,
            name: data.nombre,
            email: data.email || `${phoneNumber.replace(/\D/g, '')}@temp.com`,
            company: data.empresa || null,
            position: data.cargo || null,
        });
        
        // Crear credenciales para el usuario
        await createCredentials(user, data.usuario, data.clave, 'erp');
        
        logger.info(`Solicitud de prueba completada para usuario: ${user._id} (${data.nombre})`);
    } catch (error) {
        logger.error(`Error al procesar solicitud de prueba: ${error.message}`);
        throw error; // Propagar el error para manejo adecuado
    }
};

/**
 * Guarda un mensaje en el historial de conversación del usuario
 * @param {string} phone - Número de teléfono del usuario
 * @param {string} message - Contenido del mensaje
 * @param {boolean} isFromUser - Indica si el mensaje es del usuario o del bot
 */
const saveMessageToHistory = async (phone, message, isFromUser) => {
    try {
        // Buscar al usuario por su número de teléfono
        let user = await findUserByPhone(phone);
        
        // Si el usuario no existe, crearlo con información básica
        if (!user) {
            user = await createOrUpdateUser({
                phone: phone,
                name: 'Usuario',  // Nombre temporal
                email: `${phone.replace(/\D/g, '')}@temp.com`  // Email temporal
            });
        }
        
        // Guardar mensaje en la colección de conversaciones
        await saveMessage(user._id, phone, message, isFromUser);
        
        // Actualizar la fecha de última actividad del usuario
        user.lastActivity = new Date();
        await user.save();
    } catch (error) {
        logger.error(`Error al guardar mensaje en historial: ${error.message}`);
    }
};

/**
 * Obtiene el estado actual de la conversación
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {Object|null} - Estado de la conversación o null
 */
const getConversationState = (phoneNumber) => {
    return conversationStates.get(phoneNumber) || null;
};

/**
 * Establece el estado de la conversación
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} state - Estado de la conversación a establecer
 */
const setConversationState = (phoneNumber, state) => {
    conversationStates.set(phoneNumber, state);
};

/**
 * Limpia el estado de la conversación
 * @param {string} phoneNumber - Número de teléfono del usuario
 */
const clearConversationState = (phoneNumber) => {
    conversationStates.delete(phoneNumber);
};

// Exportar funciones
module.exports = {
    handleMessage,
    saveMessageToHistory,
    getConversationState,
    setConversationState,
    clearConversationState
};