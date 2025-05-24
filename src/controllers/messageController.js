/**
 * Controlador mejorado para manejo de mensajes de WhatsApp
 * Incluye memoria conversacional y procesamiento contextual mejorado
 */

const { detectIntentsWithContext, getPrimaryIntentWithContext, detectContextChange } = require('../services/nlpService');
const { extractEntitiesWithContextImproved } = require('../services/nlpService');
const { generateResponse } = require('../services/responseService');
const { createOrUpdateUser, findUserByPhone } = require('../services/userService');
const { createCredentials } = require('../services/credentialService');
const { saveMessage } = require('../services/conversationService');
const { 
    getConversationMemory, 
    updateConversationMemory, 
    determineTopicFromIntents,
    clearConversationMemory 
} = require('../services/MemoryService');
const { logger } = require('../utils/logger');
const { generalConfig } = require('../config/promptConfig');

// Almacenamiento en memoria para el estado de las conversaciones activas
// Esto complementa la memoria conversacional con estados específicos de flujos
const activeFlowStates = new Map();

/**
 * Maneja los mensajes entrantes de WhatsApp con capacidades contextuales mejoradas
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} message - Mensaje recibido
 */
const handleMessage = async (client, message) => {
    try {
        const from = message.from;
        const body = message.body;
        
        logger.info(`Mensaje recibido de ${from}: ${body}`);
        
        // Obtener memoria conversacional existente
        const conversationMemory = await getConversationMemory(from);
        
        // Buscar usuario existente
        let user = await findUserByPhone(from);
        
        // Detectar intenciones con contexto conversacional
        const intentResult = await detectIntentsWithContext(body, from);
        const { intents, contextUsed, topicContinuity, isOffTopic } = intentResult;
        
        logger.info(`Intenciones detectadas: ${JSON.stringify(intents)} (contexto: ${contextUsed ? 'sí' : 'no'})`);
        
        // Si es una pregunta fuera de contexto, manejar especialmente
        if (isOffTopic) {
            logger.info(`Pregunta fuera de contexto detectada para ${from}`);
            const offTopicResponse = await generateOffTopicResponseForUser(body, user, conversationMemory, from);
            await client.sendMessage(from, offTopicResponse);
            logger.info(`Respuesta fuera de contexto enviada a ${from}: ${offTopicResponse}`);
            
            // Guardar mensaje pero no actualizar memoria conversacional con intenciones incorrectas
            await saveMessage(user?._id || null, from, body, true);
            await saveMessage(user?._id || null, from, offTopicResponse, false);
            return;
        }
        
        // Extraer entidades con contexto conversacional solo si hay intenciones válidas
        let entities = {};
        if (intents && intents.length > 0) {
            entities = await extractEntitiesWithContextImproved(body, from);
            logger.info(`Entidades extraídas: ${JSON.stringify(entities)}`);
        }
        
        // Detectar cambios de contexto
        const contextChange = detectContextChange(intents, conversationMemory.conversationContext);
        
        if (contextChange.hasChanged) {
            logger.info(`Cambio de contexto detectado: ${contextChange.reason}`);
        }
        
        // Actualizar información del usuario si se detectaron entidades relevantes
        if (entities.nombre || entities.email || entities.empresa || entities.cargo) {
            user = await updateUserWithEntities(user, from, entities);
        }
        
        // Determinar el tema principal de la conversación
        const currentTopic = determineTopicFromIntents(intents);
        
        // Actualizar memoria conversacional
        await updateConversationMemory(from, {
            userInfo: user ? {
                userId: user._id,
                name: user.name,
                email: user.email,
                company: user.company,
                position: user.position,
                isRegistered: true
            } : null,
            entities: entities,
            intents: intents,
            topic: currentTopic,
            message: {
                content: body,
                isFromUser: true,
                timestamp: new Date(),
                intents: intents,
                entities: entities
            }
        });
        
        // Obtener memoria actualizada para el contexto
        const updatedMemory = await getConversationMemory(from);
        
        // Preparar el contexto de la conversación mejorado
        const conversationContext = await buildEnhancedConversationContext(from, updatedMemory, contextChange);
        
        // Agregar información de pregunta fuera de contexto al contexto
        conversationContext.isOffTopic = isOffTopic;
        
        // Procesar intenciones y manejar flujos
        await processIntentsWithContext(intents, entities, user, from, conversationContext, contextChange);
        
        // Generar respuesta contextual
        const response = await generateContextualResponse(
            body,
            intents,
            entities,
            user,
            conversationContext,
            updatedMemory
        );
        
        // Enviar respuesta al usuario
        await client.sendMessage(from, response);
        logger.info(`Respuesta enviada a ${from}: ${response}`);
        
        // Guardar la respuesta en el historial y actualizar memoria
        await saveMessage(user?._id || null, from, response, false);
        
        // Actualizar memoria con la respuesta del bot
        await updateConversationMemory(from, {
            message: {
                content: response,
                isFromUser: false,
                timestamp: new Date(),
                intents: [],
                entities: {}
            }
        });
        
        // Actualizar estado de flujos activos
        await updateActiveFlowState(from, intents, entities, conversationContext, response);
        
    } catch (error) {
        logger.error(`Error al procesar mensaje: ${error.message}`);
        logger.error(error.stack);
        
        try {
            // Intentar enviar un mensaje de error contextual
            const errorMessage = await generateErrorResponse(message.from, error);
            await message.reply(errorMessage);
        } catch (replyError) {
            logger.error(`No se pudo enviar mensaje de error: ${replyError.message}`);
        }
    }
};

/**
 * Genera respuesta específica para preguntas fuera de contexto
 * @param {string} message - Mensaje del usuario
 * @param {Object} user - Usuario (si existe)
 * @param {Object} conversationMemory - Memoria conversacional
 * @param {string} phoneNumber - Número de teléfono
 * @returns {string} - Respuesta generada
 */
const generateOffTopicResponseForUser = async (message, user, conversationMemory, phoneNumber) => {
    try {
        const userName = user ? user.name : (conversationMemory.userProfile?.name || null);
        const hasActiveFlow = activeFlowStates.has(phoneNumber);
        const currentTopic = conversationMemory.conversationContext?.currentTopic;
        
        let response = '';
        
        if (userName && userName !== 'Usuario') {
            response = `Hola ${userName}, `;
        } else {
            response = 'Hola, ';
        }
        
        // Respuesta amigable pero redirigiendo al contexto empresarial
        response += 'esa es una pregunta interesante, pero soy un asistente especializado en ';
        response += `${generalConfig.serviceMetadata.name}. `;
        
        // Si hay un flujo activo, recordar el proceso
        if (hasActiveFlow) {
            const activeFlow = activeFlowStates.get(phoneNumber);
            if (activeFlow.flowType === 'trial_request') {
                response += `¿Te gustaría continuar con tu solicitud de cuenta de prueba? `;
                response += 'Estaba esperando algunos datos para completar tu registro.';
            } else {
                response += '¿En qué más puedo ayudarte con nuestro sistema?';
            }
        } else if (currentTopic === 'trial_request') {
            response += '¿Te gustaría saber más sobre nuestro sistema ERP o crear una cuenta de prueba?';
        } else {
            // Ofrecer opciones principales
            response += 'Puedo ayudarte con:\n';
            response += '• Información sobre nuestro sistema ERP\n';
            response += '• Crear una cuenta de prueba gratuita (7 días)\n';
            response += '• Resolver dudas técnicas\n';
            response += '• Información de precios y características\n\n';
            response += '¿En qué te puedo ayudar?';
        }
        
        return response;
    } catch (error) {
        logger.error(`Error generando respuesta fuera de contexto: ${error.message}`);
        return 'Disculpa, soy un asistente especializado en sistemas ERP. ¿En qué puedo ayudarte con nuestro servicio?';
    }
};

/**
 * Actualiza la información del usuario con las entidades detectadas
 * @param {Object} existingUser - Usuario existente (puede ser null)
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} entities - Entidades detectadas
 * @returns {Object} - Usuario actualizado o creado
 */
const updateUserWithEntities = async (existingUser, phoneNumber, entities) => {
    try {
        const userData = {
            phone: phoneNumber,
            name: entities.nombre || (existingUser ? existingUser.name : 'Usuario'),
            email: entities.email || (existingUser ? existingUser.email : `${phoneNumber.replace(/\D/g, '')}@temp.com`),
            empresa: entities.empresa || (existingUser ? existingUser.company : null),
            cargo: entities.cargo || (existingUser ? existingUser.position : null)
        };
        
        const user = await createOrUpdateUser(userData);
        
        if (!existingUser) {
            logger.info(`Nuevo usuario creado: ${user._id} (${userData.name})`);
        } else {
            logger.info(`Usuario actualizado: ${user._id} (${userData.name})`);
        }
        
        return user;
    } catch (error) {
        logger.error(`Error al actualizar usuario con entidades: ${error.message}`);
        return existingUser;
    }
};

/**
 * Construye un contexto de conversación mejorado
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} memory - Memoria conversacional
 * @param {Object} contextChange - Información sobre cambio de contexto
 * @returns {Object} - Contexto mejorado
 */
const buildEnhancedConversationContext = async (phoneNumber, memory, contextChange) => {
    const activeFlow = activeFlowStates.get(phoneNumber);
    
    return {
        // Información de memoria conversacional
        userProfile: memory.userProfile,
        knownEntities: memory.knownEntities,
        userKnowledge: memory.knownEntities, // Alias para compatibilidad
        currentTopic: memory.conversationContext.currentTopic,
        topicHistory: memory.topicHistory,
        contextStrength: memory.conversationContext.contextStrength,
        recentMessages: memory.messageHistory.slice(-5),
        conversationHistory: memory.messageHistory.slice(-3), // Alias para compatibilidad
        recentIntents: memory.intentHistory.slice(0, 3).map(item => item.intent),
        
        // Información de cambio de contexto
        contextChange: contextChange,
        topicContinuity: !contextChange.hasChanged,
        
        // Estado de flujo activo (si existe)
        activeFlow: activeFlow ? {
            flowType: activeFlow.flowType,
            currentStep: activeFlow.currentStep,
            flowData: activeFlow.flowData,
            startTime: activeFlow.startTime
        } : null,
        
        // Metadatos adicionales
        conversationAge: new Date() - new Date(memory.createdAt),
        conversationLength: new Date() - new Date(memory.createdAt), // Alias para compatibilidad
        lastActivity: memory.lastUpdate,
        
        // Pistas contextuales para el análisis
        contextualClues: {
            hasUserProfile: memory.userProfile.isRegistered,
            knownEntitiesCount: Object.keys(memory.knownEntities).length,
            conversationLength: memory.messageHistory.length,
            topicStability: memory.conversationContext.contextStrength
        }
    };
};

/**
 * Procesa las intenciones considerando el contexto conversacional
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario (si existe)
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} conversationContext - Contexto de la conversación
 * @param {Object} contextChange - Información sobre cambio de contexto
 */
const processIntentsWithContext = async (intents, entities, user, phoneNumber, conversationContext, contextChange) => {
    try {
        // Si hay un flujo activo y no ha habido cambio de contexto significativo
        if (conversationContext.activeFlow && !contextChange.hasChanged) {
            await continueActiveFlow(phoneNumber, intents, entities, conversationContext);
            return;
        }
        
        // Si hay cambio de contexto, evaluar si limpiar flujo activo
        if (contextChange.hasChanged && contextChange.confidence > 0.7) {
            clearActiveFlowState(phoneNumber);
            logger.info(`Flujo activo limpiado debido a cambio de contexto para ${phoneNumber}`);
        }
        
        // Determinar la intención principal considerando el contexto
        const primaryIntent = getPrimaryIntentWithContext(intents, conversationContext);
        
        if (!primaryIntent) return;
        
        // Para confirmaciones, verificar si debería ser interpretada como solicitud de prueba
        let effectiveIntent = primaryIntent;
        if (primaryIntent === 'confirmacion') {
            // Verificar contexto reciente para determinar qué se está confirmando
            const recentIntents = conversationContext.recentIntents || [];
            const currentTopic = conversationContext.currentTopic;
            
            if (currentTopic === 'service_interest' || recentIntents.includes('interes_en_servicio')) {
                effectiveIntent = 'solicitud_prueba';
                logger.info(`Confirmación interpretada como solicitud_prueba debido al contexto de ${currentTopic}`);
            }
        }
        
        // Iniciar nuevo flujo basado en la intención efectiva
        switch (effectiveIntent) {
            case 'solicitud_prueba':
                await startTrialRequestFlowWithContext(entities, user, phoneNumber, conversationContext);
                break;
                
            case 'soporte_tecnico':
                await startSupportFlowWithContext(entities, user, phoneNumber, conversationContext);
                break;
                
            case 'confirmacion':
                await handleConfirmationWithContext(entities, user, phoneNumber, conversationContext);
                break;
                
            // Otros flujos pueden agregarse aquí
            default:
                // Para intenciones que no requieren flujo específico, no hacer nada especial
                break;
        }
        
    } catch (error) {
        logger.error(`Error al procesar intenciones con contexto: ${error.message}`);
    }
};

/**
 * Inicia el flujo de solicitud de prueba con contexto
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario (si existe)
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} conversationContext - Contexto de la conversación
 */
const startTrialRequestFlowWithContext = async (entities, user, phoneNumber, conversationContext) => {
    try {
        // Combinar entidades actuales con información conocida del contexto
        const allKnownData = {
            ...conversationContext.knownEntities,
            ...entities,
            // Información del usuario registrado si existe
            ...(user ? {
                nombre: user.name,
                email: user.email,
                empresa: user.company,
                cargo: user.position
            } : {})
        };
        
        // Determinar qué información falta
        const missingFields = [];
        if (!allKnownData.nombre) missingFields.push('nombre');
        if (!allKnownData.email) missingFields.push('email');
        if (!allKnownData.usuario) missingFields.push('usuario');
        if (!allKnownData.clave) missingFields.push('clave');
        
        // Solo iniciar flujo si falta información
        if (missingFields.length > 0) {
            setActiveFlowState(phoneNumber, {
                flowType: 'trial_request',
                currentStep: 0,
                missingFields: missingFields,
                collectedData: allKnownData,
                flowData: {
                    missingFields: missingFields,
                    ...allKnownData
                },
                startTime: new Date()
            });
            
            logger.info(`Flujo de solicitud de prueba iniciado para ${phoneNumber}. Faltan: ${missingFields.join(', ')}`);
        } else {
            // Si tenemos toda la información, procesar inmediatamente
            await processCompletedTrialRequest(phoneNumber, allKnownData);
        }
        
    } catch (error) {
        logger.error(`Error al iniciar flujo de solicitud de prueba: ${error.message}`);
    }
};

/**
 * Inicia el flujo de soporte técnico con contexto
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario (si existe)
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} conversationContext - Contexto de la conversación
 */
const startSupportFlowWithContext = async (entities, user, phoneNumber, conversationContext) => {
    try {
        setActiveFlowState(phoneNumber, {
            flowType: 'support_request',
            currentStep: 0,
            issueDescription: entities.problema || '',
            userInfo: user || conversationContext.userProfile,
            collectedData: entities,
            flowData: {
                issueDescription: entities.problema || ''
            },
            startTime: new Date()
        });
        
        logger.info(`Flujo de soporte técnico iniciado para ${phoneNumber}`);
    } catch (error) {
        logger.error(`Error al iniciar flujo de soporte: ${error.message}`);
    }
};

/**
 * Maneja confirmaciones considerando el contexto
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario (si existe)
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} conversationContext - Contexto de la conversación
 */
const handleConfirmationWithContext = async (entities, user, phoneNumber, conversationContext) => {
    try {
        const activeFlow = conversationContext.activeFlow;
        
        if (activeFlow && activeFlow.flowType === 'trial_request') {
            // Si hay un flujo de prueba activo, continuar con la confirmación
            await continueTrialRequestFlow(phoneNumber, entities, conversationContext);
        }
        // Podrían agregarse otros tipos de confirmación contextual aquí
        
    } catch (error) {
        logger.error(`Error al manejar confirmación con contexto: ${error.message}`);
    }
};

/**
 * Continúa un flujo activo
 * @param {string} phoneNumber - Número de teléfono
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de la conversación
 */
const continueActiveFlow = async (phoneNumber, intents, entities, conversationContext) => {
    const activeFlow = conversationContext.activeFlow;
    
    switch (activeFlow.flowType) {
        case 'trial_request':
            await continueTrialRequestFlow(phoneNumber, entities, conversationContext);
            break;
            
        case 'support_request':
            await continueSupportFlow(phoneNumber, entities, conversationContext);
            break;
            
        default:
            logger.warn(`Tipo de flujo desconocido: ${activeFlow.flowType}`);
    }
};

/**
 * Continúa el flujo de solicitud de prueba
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de la conversación
 */
const continueTrialRequestFlow = async (phoneNumber, entities, conversationContext) => {
    try {
        const activeFlow = activeFlowStates.get(phoneNumber);
        if (!activeFlow) return;
        
        logger.debug(`🔄 Continuando flujo de prueba para ${phoneNumber}`);
        logger.debug(`📝 Datos actuales del flujo: ${JSON.stringify(activeFlow.collectedData)}`);
        logger.debug(`🆕 Nuevas entidades: ${JSON.stringify(entities)}`);
        
        // Actualizar datos recolectados con las nuevas entidades
        activeFlow.collectedData = {
            ...activeFlow.collectedData,
            ...entities
        };
        
        activeFlow.flowData = {
            ...activeFlow.flowData,
            ...entities
        };
        
        // Calcular campos faltantes con lógica mejorada
        const missingFields = calculateMissingFields(activeFlow.collectedData);
        
        logger.info(`📊 Estado del flujo después de actualización:`);
        logger.info(`   - Datos recolectados: ${JSON.stringify(activeFlow.collectedData)}`);
        logger.info(`   - Campos faltantes: ${JSON.stringify(missingFields)}`);
        
        if (missingFields.length === 0) {
            // ✅ Flujo completado - procesar solicitud
            logger.info(`🎉 Flujo de solicitud de prueba completado para ${phoneNumber}`);
            await processCompletedTrialRequest(phoneNumber, activeFlow.collectedData);
            clearActiveFlowState(phoneNumber);
        } else {
            // ⏳ Aún faltan campos - actualizar flujo
            activeFlow.missingFields = missingFields;
            activeFlow.flowData.missingFields = missingFields;
            activeFlow.currentStep++;
            activeFlowStates.set(phoneNumber, activeFlow);
            
            logger.info(`⏳ Flujo actualizado - Siguiente paso: solicitar ${missingFields[0]}`);
        }
        
    } catch (error) {
        logger.error(`❌ Error al continuar flujo de solicitud de prueba: ${error.message}`);
    }
};


/**
 * Calcula qué campos faltan para completar el registro
 * @param {Object} collectedData - Datos recolectados hasta ahora
 * @returns {Array} - Lista de campos faltantes
 */
const calculateMissingFields = (collectedData) => {
    const missingFields = [];
    
    // Validar nombre
    if (!collectedData.nombre || 
        collectedData.nombre === 'Usuario' ||
        collectedData.nombre.toLowerCase().includes('quiero') ||
        collectedData.nombre.toLowerCase().includes('prueba')) {
        missingFields.push('nombre');
    }
    
    // Validar email
    if (!collectedData.email || 
        collectedData.email.includes('@temp.com') || 
        !collectedData.email.includes('@') ||
        !collectedData.email.includes('.')) {
        missingFields.push('email');
    }
    
    // Validar usuario
    if (!collectedData.usuario) {
        missingFields.push('usuario');
    }
    
    // Validar clave
    if (!collectedData.clave) {
        missingFields.push('clave');
    }
    
    return missingFields;
};

/**
 * Continúa el flujo de soporte técnico
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de conversación
 */
const continueSupportFlow = async (phoneNumber, entities, conversationContext) => {
    try {
        const activeFlow = activeFlowStates.get(phoneNumber);
        if (!activeFlow) return;
        
        // Actualizar información del problema
        if (entities.problema) {
            activeFlow.issueDescription += ' ' + entities.problema;
            activeFlow.flowData.issueDescription = activeFlow.issueDescription;
        }
        
        // Avanzar en el flujo
        activeFlow.currentStep++;
        activeFlowStates.set(phoneNumber, activeFlow);
        
        // Si hemos recolectado suficiente información, finalizar flujo
        if (activeFlow.currentStep >= 2 || activeFlow.issueDescription.length > 50) {
            clearActiveFlowState(phoneNumber);
        }
        
    } catch (error) {
        logger.error(`Error al continuar flujo de soporte: ${error.message}`);
    }
};

/**
 * Procesa una solicitud de prueba completada
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} data - Datos completos recolectados
 */
const processCompletedTrialRequest = async (phoneNumber, data) => {
    try {
        // Crear o actualizar usuario
        const user = await createOrUpdateUser({
            phone: phoneNumber,
            name: data.nombre,
            email: data.email,
            empresa: data.empresa || null,
            cargo: data.cargo || null
        });
        
        // Crear credenciales
        await createCredentials(user, data.usuario, data.clave, 'erp');
        
        logger.info(`Solicitud de prueba completada para usuario: ${user._id} (${data.nombre})`);
    } catch (error) {
        logger.error(`Error al procesar solicitud de prueba completada: ${error.message}`);
        throw error;
    }
};

/**
 * Genera una respuesta contextual mejorada
 * @param {string} message - Mensaje original
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario
 * @param {Object} conversationContext - Contexto de conversación
 * @param {Object} memory - Memoria conversacional
 * @returns {string} - Respuesta generada
 */
const generateContextualResponse = async (message, intents, entities, userData, conversationContext, memory) => {
    try {
        // Enriquecer el contexto con información de memoria
        const enrichedContext = {
            ...conversationContext,
            conversationHistory: memory.messageHistory.slice(-3),
            userKnowledge: memory.knownEntities,
            topicTransition: conversationContext.contextChange.hasChanged,
            contextualClues: {
                hasUserProfile: userData !== null,
                knownEntitiesCount: Object.keys(memory.knownEntities).length,
                conversationLength: memory.messageHistory.length,
                topicStability: memory.conversationContext.contextStrength
            }
        };
        
        // Usar el servicio de respuesta mejorado
        return await generateResponse(message, intents, entities, userData, enrichedContext);
        
    } catch (error) {
        logger.error(`Error al generar respuesta contextual: ${error.message}`);
        return "Lo siento, estoy teniendo problemas técnicos. Por favor, intenta de nuevo.";
    }
};

/**
 * Genera una respuesta de error contextual
 * @param {string} phoneNumber - Número de teléfono
 * @param {Error} error - Error ocurrido
 * @returns {string} - Mensaje de error apropiado
 */
const generateErrorResponse = async (phoneNumber, error) => {
    try {
        const memory = await getConversationMemory(phoneNumber);
        const userName = memory.userProfile.isRegistered ? memory.userProfile.name : '';
        
        if (userName) {
            return `Disculpa ${userName}, estoy experimentando problemas técnicos en este momento. Por favor, intenta nuevamente en unos minutos.`;
        } else {
            return "Lo siento, estoy teniendo problemas técnicos. Por favor, intenta de nuevo más tarde o contacta a nuestro equipo de soporte.";
        }
    } catch (memoryError) {
        return "Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta nuevamente más tarde.";
    }
};

/**
 * Establece el estado de flujo activo
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} flowState - Estado del flujo
 */
const setActiveFlowState = (phoneNumber, flowState) => {
    activeFlowStates.set(phoneNumber, flowState);
    logger.debug(`Estado de flujo establecido para ${phoneNumber}: ${flowState.flowType}`);
};

/**
 * Obtiene el estado de flujo activo
 * @param {string} phoneNumber - Número de teléfono
 * @returns {Object|null} - Estado del flujo o null
 */
const getActiveFlowState = (phoneNumber) => {
    return activeFlowStates.get(phoneNumber) || null;
};

/**
 * Limpia el estado de flujo activo
 * @param {string} phoneNumber - Número de teléfono
 */
const clearActiveFlowState = (phoneNumber) => {
    activeFlowStates.delete(phoneNumber);
    logger.debug(`Estado de flujo limpiado para ${phoneNumber}`);
};

/**
 * Actualiza el estado de flujo activo
 * @param {string} phoneNumber - Número de teléfono
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de conversación
 * @param {string} response - Respuesta enviada
 */
const updateActiveFlowState = async (phoneNumber, intents, entities, conversationContext, response) => {
    const activeFlow = activeFlowStates.get(phoneNumber);
    
    if (!activeFlow) return;
    
    // Verificar timeout del flujo
    const now = new Date();
    const flowDuration = (now - new Date(activeFlow.startTime)) / (1000 * 60); // en minutos
    
    if (flowDuration > 30) { // 30 minutos de timeout
        clearActiveFlowState(phoneNumber);
        logger.info(`Flujo ${activeFlow.flowType} para ${phoneNumber} expiró por timeout`);
        return;
    }
    
    // Actualizar último acceso del flujo
    activeFlow.lastUpdate = now;
    activeFlowStates.set(phoneNumber, activeFlow);
};

/**
 * Limpia la memoria conversacional y flujos activos para un usuario
 * @param {string} phoneNumber - Número de teléfono
 */
const clearUserContext = (phoneNumber) => {
    clearActiveFlowState(phoneNumber);
    clearConversationMemory(phoneNumber);
    logger.info(`Contexto completo limpiado para ${phoneNumber}`);
};

/**
 * Obtiene estadísticas del controlador de mensajes
 * @returns {Object} - Estadísticas
 */
const getControllerStats = () => {
    return {
        activeFlows: activeFlowStates.size,
        flowTypes: Array.from(activeFlowStates.values()).reduce((acc, flow) => {
            acc[flow.flowType] = (acc[flow.flowType] || 0) + 1;
            return acc;
        }, {}),
        timestamp: new Date()
    };
};

// Función auxiliar para limpiar flujos expirados periódicamente
const cleanupExpiredFlows = () => {
    const now = new Date();
    const expiredFlows = [];
    
    for (const [phoneNumber, flowState] of activeFlowStates.entries()) {
        const flowDuration = (now - new Date(flowState.startTime)) / (1000 * 60); // en minutos
        
        if (flowDuration > 30) {
            expiredFlows.push(phoneNumber);
        }
    }
    
    for (const phoneNumber of expiredFlows) {
        clearActiveFlowState(phoneNumber);
        logger.info(`Flujo expirado limpiado para ${phoneNumber}`);
    }
    
    if (expiredFlows.length > 0) {
        logger.info(`Limpieza automática: ${expiredFlows.length} flujos expirados eliminados`);
    }
};

// Ejecutar limpieza cada 15 minutos
setInterval(cleanupExpiredFlows, 15 * 60 * 1000);

// Exportar funciones principales
module.exports = {
    handleMessage,
    generateOffTopicResponseForUser,
    updateUserWithEntities,
    buildEnhancedConversationContext,
    processIntentsWithContext,
    generateContextualResponse,
    setActiveFlowState,
    getActiveFlowState,
    clearActiveFlowState,
    clearUserContext,
    getControllerStats,
    cleanupExpiredFlows
};