/**
 * Controlador mejorado para manejo de mensajes de WhatsApp (CORREGIDO)
 * Incluye memoria conversacional y procesamiento contextual
 */

const { detectIntentsWithContext, getPrimaryIntentWithContext, detectContextChange } = require('../services/nlpService');
const { extractEntitiesWithContext } = require('../services/nlpService');
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
const tutorialFlowService = require('../services/tutorialFlowService');
const Intent = require('../models/Intent');
const { generalConfig } = require('../config/promptConfig');
const {
    startOrUpdateSession,
    closeSession,
    isSessionActive,
    getSessionInfo
} = require('../services/sessionService');

// Almacenamiento en memoria para el estado de las conversaciones activas
const activeFlowStates = new Map();

/**
 * Maneja los mensajes entrantes de WhatsApp con capacidades contextuales
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} message - Mensaje recibido
 */
const handleMessage = async (client, message) => {
    try {
        const from = message.from;
        const body = message.body;
        
        logger.info(`Mensaje recibido de ${from}: ${body}`);
        
        // Actualizar o iniciar sesión
        startOrUpdateSession(from, client);
        
        // Obtener memoria conversacional existente
        const conversationMemory = await getConversationMemory(from);
        
        // Buscar usuario existente
        let user = await findUserByPhone(from);
        
        // Detectar intenciones con contexto conversacional
        const intentResult = await detectIntentsWithContext(body, from);
        const { intents, contextUsed, topicContinuity } = intentResult;
        
        logger.info(`Intenciones detectadas: ${JSON.stringify(intents)} (contexto: ${contextUsed ? 'sí' : 'no'})`);
        
        // Extraer entidades con contexto conversacional
        const entities = await extractEntitiesWithContext(body, from);
        logger.info(`Entidades extraídas: ${JSON.stringify(entities)}`);
        
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
        
        // Procesar intenciones y manejar flujos (AHORA RETORNA CREDENCIALES SI SE COMPLETÓ)
        logger.debug(`Procesando intenciones con contexto para ${from}`);
        const flowResult = await processIntentsWithContext(intents, entities, user, from, conversationContext, contextChange);
        logger.debug(`Resultado del flujo: ${JSON.stringify(flowResult)}`);
        
        // Generar respuesta contextual (INCLUYENDO CREDENCIALES SI ESTÁN DISPONIBLES)
        const response = await generateContextualResponse(
            body,
            intents,
            entities,
            user,
            conversationContext,
            updatedMemory,
            flowResult // <- NUEVO PARÁMETRO CON RESULTADOS DEL FLUJO
        );
        
        // Enviar respuesta al usuario
        await client.sendMessage(from, response);
        logger.info(`Respuesta enviada a ${from}: ${response}`);
        
        // Guardar la respuesta en el historial SOLO si hay un usuario válido
        if (user && user._id) {
            await saveMessage(user._id, from, response, false);
        } else {
            logger.debug(`No se guardó el mensaje de respuesta - usuario temporal para ${from}`);
        }
        
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
        
        // Verificar si la conversación debe cerrarse
        const shouldCloseSession = await checkIfShouldCloseSession(from, intents, response, flowResult);
        if (shouldCloseSession.close) {
            await closeSession(from, client, shouldCloseSession.reason);
        }
        
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
 * Actualiza la información del usuario con las entidades detectadas
 * @param {Object} existingUser - Usuario existente (puede ser null)
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} entities - Entidades detectadas
 * @returns {Object} - Usuario actualizado o creado
 */
const updateUserWithEntities = async (existingUser, phoneNumber, entities) => {
    try {
        // Solo crear/actualizar usuario si tenemos información mínima necesaria
        if (!entities.nombre && !entities.email && !existingUser) {
            logger.debug(`No se creará usuario - información insuficiente para ${phoneNumber}`);
            return null;
        }
        
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
    
    if (activeFlow) {
        logger.debug(`Flujo activo encontrado para ${phoneNumber}: ${JSON.stringify(activeFlow)}`);
    }
    
    return {
        // Información de memoria conversacional
        userProfile: memory.userProfile,
        knownEntities: memory.knownEntities,
        currentTopic: memory.conversationContext.currentTopic,
        topicHistory: memory.topicHistory,
        contextStrength: memory.conversationContext.contextStrength,
        recentMessages: memory.messageHistory.slice(-5),
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
        lastActivity: memory.lastUpdate
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
 * @returns {Object} - Resultado del procesamiento (incluyendo credenciales si se crearon)
 */
const processIntentsWithContext = async (intents, entities, user, phoneNumber, conversationContext, contextChange) => {
    try {
        logger.debug(`=== INICIANDO processIntentsWithContext ===`);
        logger.debug(`Intenciones recibidas: ${JSON.stringify(intents)}`);
        logger.debug(`Entidades recibidas: ${JSON.stringify(entities)}`);
        logger.debug(`¿Hay flujo activo?: ${conversationContext.activeFlow ? 'SÍ' : 'NO'}`);
        
        const result = {
            completed: false,
            credentials: null,
            flowType: null
        };
        
        // Si hay un flujo activo y no ha habido cambio de contexto significativo
        if (conversationContext.activeFlow && !contextChange.hasChanged) {
            logger.debug(`Continuando flujo activo para ${phoneNumber}`);
            const flowResult = await continueActiveFlow(phoneNumber, intents, entities, conversationContext);
            return { ...result, ...flowResult };
        }
        
        // Si hay cambio de contexto, evaluar si limpiar flujo activo
        if (contextChange.hasChanged && contextChange.confidence > 0.7) {
            clearActiveFlowState(phoneNumber);
            logger.info(`Flujo activo limpiado debido a cambio de contexto para ${phoneNumber}`);
        }
        
        // Determinar la intención principal considerando el contexto
        const primaryIntent = await getPrimaryIntentWithContext(intents, conversationContext);
        logger.debug(`Intención principal obtenida: "${primaryIntent}" (tipo: ${typeof primaryIntent})`);
        
        if (!primaryIntent) {
            logger.debug(`No se encontró intención principal, retornando resultado vacío`);
            return result;
        }
        
        logger.info(`*** EJECUTANDO SWITCH PARA INTENCIÓN: "${primaryIntent}" ***`);
        
        // Buscar si la intención tiene un flujo específico en la base de datos
        const intentData = await Intent.findByName(primaryIntent);
        
        if (intentData && intentData.hasSpecificFlow) {
            logger.info(`Intención "${primaryIntent}" tiene flujo específico: ${intentData.flowType}`);
            
            // Si es una intención de tutorial, usar el servicio de tutoriales
            if (intentData.category === 'tutorial') {
                const tutorialResult = await startTutorialFlow(
                    primaryIntent,
                    entities,
                    user,
                    phoneNumber,
                    conversationContext
                );
                return { ...result, ...tutorialResult };
            }
        }
        
        // Flujos específicos hardcodeados (se mantendrán hasta migración completa)
        switch (primaryIntent) {
            case 'solicitud_prueba':
                logger.info(`*** ENTRANDO A CASE solicitud_prueba ***`);
                const trialResult = await startTrialRequestFlowWithContext(entities, user, phoneNumber, conversationContext);
                logger.info(`*** RESULTADO DEL FLUJO DE PRUEBA: ${JSON.stringify(trialResult)} ***`);
                return { ...result, ...trialResult };
                
            case 'soporte_tecnico':
                await startSupportFlowWithContext(entities, user, phoneNumber, conversationContext);
                result.flowType = 'support_request';
                break;
                
            case 'confirmacion':
                const confirmResult = await handleConfirmationWithContext(entities, user, phoneNumber, conversationContext);
                return { ...result, ...confirmResult };
                
            default:
                logger.debug(`Intención "${primaryIntent}" no tiene un flujo específico definido`);
                break;
        }
        
        return result;
    } catch (error) {
        logger.error(`Error al procesar intenciones con contexto: ${error.message}`);
        logger.error(error.stack);
        return { completed: false, credentials: null, flowType: null };
    }
};

/**
 * Inicia el flujo de solicitud de prueba con contexto
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario (si existe)
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {Object} - Resultado del flujo
 */
const startTrialRequestFlowWithContext = async (entities, user, phoneNumber, conversationContext) => {
    try {
        const result = {
            completed: false,
            credentials: null,
            flowType: 'trial_request'
        };
        
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
        
        logger.debug(`=== DATOS PARA SOLICITUD DE PRUEBA ===`);
        logger.debug(`Entidades actuales: ${JSON.stringify(entities)}`);
        logger.debug(`Entidades conocidas del contexto: ${JSON.stringify(conversationContext.knownEntities)}`);
        logger.debug(`Datos combinados: ${JSON.stringify(allKnownData)}`);
        
        // Determinar qué información falta
        const missingFields = [];
        if (!allKnownData.nombre) missingFields.push('nombre');
        if (!allKnownData.email) missingFields.push('email');
        if (!allKnownData.usuario) missingFields.push('usuario');
        if (!allKnownData.clave) missingFields.push('clave');
        
        logger.debug(`Campos faltantes: ${JSON.stringify(missingFields)}`);
        
        // Si tenemos toda la información, procesar inmediatamente
        if (missingFields.length === 0) {
            logger.info(`Procesando solicitud de prueba completa para ${phoneNumber}`);
            const credentials = await processCompletedTrialRequest(phoneNumber, allKnownData);
            clearActiveFlowState(phoneNumber);
            
            result.completed = true;
            result.credentials = credentials;
            
            logger.info(`Solicitud de prueba completada inmediatamente para ${phoneNumber}`);
            return result;
        }
        
        // Si falta información, iniciar flujo
        setActiveFlowState(phoneNumber, {
            flowType: 'trial_request',
            currentStep: 0,
            missingFields: missingFields,
            collectedData: allKnownData,
            startTime: new Date()
        });
        
        logger.info(`Flujo de solicitud de prueba iniciado para ${phoneNumber}. Faltan: ${missingFields.join(', ')}`);
        return result;
        
    } catch (error) {
        logger.error(`Error al iniciar flujo de solicitud de prueba: ${error.message}`);
        logger.error(error.stack);
        return { completed: false, credentials: null, flowType: 'trial_request' };
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
 * @returns {Object} - Resultado del manejo de confirmación
 */
const handleConfirmationWithContext = async (entities, user, phoneNumber, conversationContext) => {
    try {
        const result = {
            completed: false,
            credentials: null,
            flowType: 'confirmation'
        };
        
        const activeFlow = conversationContext.activeFlow;
        
        if (activeFlow && activeFlow.flowType === 'trial_request') {
            // Si hay un flujo de prueba activo, continuar con la confirmación
            const flowResult = await continueTrialRequestFlow(phoneNumber, entities, conversationContext);
            return { ...result, ...flowResult };
        }
        
        return result;
    } catch (error) {
        logger.error(`Error al manejar confirmación con contexto: ${error.message}`);
        return { completed: false, credentials: null, flowType: 'confirmation' };
    }
};

/**
 * Continúa un flujo activo
 * @param {string} phoneNumber - Número de teléfono
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {Object} - Resultado del flujo
 */
const continueActiveFlow = async (phoneNumber, intents, entities, conversationContext) => {
    const activeFlow = conversationContext.activeFlow;
    
    const result = {
        completed: false,
        credentials: null,
        flowType: activeFlow.flowType
    };
    
    // Verificar si es un flujo de tutorial
    if (activeFlow.flowType && activeFlow.flowType.endsWith('_tutorial_flow')) {
        const userResponse = conversationContext.recentMessages ?
            conversationContext.recentMessages[conversationContext.recentMessages.length - 1]?.content : '';
        
        const tutorialResult = await tutorialFlowService.continueFlow(
            activeFlow,
            userResponse,
            entities,
            conversationContext
        );
        
        if (tutorialResult.completed) {
            activeFlowStates.delete(phoneNumber);
            return {
                completed: true,
                message: tutorialResult.message,
                flowData: tutorialResult.flowData,
                flowType: activeFlow.flowType
            };
        } else {
            // Actualizar estado del flujo
            activeFlowStates.set(phoneNumber, tutorialResult.flowState);
            return {
                completed: false,
                message: tutorialResult.message,
                requiresInput: tutorialResult.requiresInput,
                currentStep: tutorialResult.currentStep,
                totalSteps: tutorialResult.totalSteps,
                flowType: activeFlow.flowType
            };
        }
    }
    
    // Flujos legacy (trial_request, support_request)
    switch (activeFlow.flowType) {
        case 'trial_request':
            const trialResult = await continueTrialRequestFlow(phoneNumber, entities, conversationContext);
            return { ...result, ...trialResult };
            
        case 'support_request':
            await continueSupportFlow(phoneNumber, entities, conversationContext);
            break;
            
        default:
            logger.warn(`Tipo de flujo desconocido: ${activeFlow.flowType}`);
    }
    
    return result;
};

/**
 * Continúa el flujo de solicitud de prueba
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de la conversación
 * @returns {Object} - Resultado del flujo
 */
const continueTrialRequestFlow = async (phoneNumber, entities, conversationContext) => {
    try {
        const result = {
            completed: false,
            credentials: null
        };
        
        const activeFlow = activeFlowStates.get(phoneNumber);
        if (!activeFlow) return result;
        
        // Actualizar datos recolectados
        activeFlow.collectedData = {
            ...activeFlow.collectedData,
            ...entities
        };
        
        // Verificar si ahora tenemos toda la información
        const missingFields = [];
        if (!activeFlow.collectedData.nombre) missingFields.push('nombre');
        if (!activeFlow.collectedData.email) missingFields.push('email');
        if (!activeFlow.collectedData.usuario) missingFields.push('usuario');
        if (!activeFlow.collectedData.clave) missingFields.push('clave');
        
        if (missingFields.length === 0) {
            // Procesar solicitud completa
            logger.info(`Procesando solicitud de prueba completa en continueTrialRequestFlow para ${phoneNumber}`);
            const credentials = await processCompletedTrialRequest(phoneNumber, activeFlow.collectedData);
            clearActiveFlowState(phoneNumber);
            
            result.completed = true;
            result.credentials = credentials;
            
            logger.info(`Flujo de solicitud de prueba completado para ${phoneNumber}`);
        } else {
            // Actualizar campos faltantes y avanzar paso
            activeFlow.missingFields = missingFields;
            activeFlow.currentStep++;
            activeFlowStates.set(phoneNumber, activeFlow);
        }
        
        return result;
    } catch (error) {
        logger.error(`Error al continuar flujo de solicitud de prueba: ${error.message}`);
        logger.error(error.stack);
        return { completed: false, credentials: null };
    }
};

/**
 * Continúa el flujo de soporte técnico
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de la conversación
 */
const continueSupportFlow = async (phoneNumber, entities, conversationContext) => {
    try {
        const activeFlow = activeFlowStates.get(phoneNumber);
        if (!activeFlow) return;
        
        // Actualizar datos del problema
        if (entities.problema) {
            activeFlow.issueDescription += ' ' + entities.problema;
        }
        
        activeFlow.currentStep++;
        activeFlowStates.set(phoneNumber, activeFlow);
        
        logger.info(`Flujo de soporte actualizado para ${phoneNumber}`);
    } catch (error) {
        logger.error(`Error al continuar flujo de soporte: ${error.message}`);
    }
};

/**
 * Procesa una solicitud de prueba completada
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} data - Datos completos recolectados
 * @returns {Object} - Credenciales creadas
 */
const processCompletedTrialRequest = async (phoneNumber, data) => {
    try {
        logger.info(`Iniciando processCompletedTrialRequest para ${phoneNumber}`);
        logger.debug(`Datos recibidos: ${JSON.stringify(data)}`);
        
        // Crear o actualizar usuario
        const user = await createOrUpdateUser({
            phone: phoneNumber,
            name: data.nombre,
            email: data.email,
            empresa: data.empresa || null,
            cargo: data.cargo || null
        });
        
        logger.info(`Usuario creado/actualizado: ${user._id}`);
        
        // Crear credenciales Y RETORNARLAS
        logger.info(`Creando credenciales para usuario ${user._id} con username: ${data.usuario}`);
        const credentials = await createCredentials(user, data.usuario, data.clave, 'erp');
        
        logger.info(`Credenciales creadas exitosamente para usuario: ${user._id} (${data.nombre})`);
        
        // IMPORTANTE: Retornar las credenciales para incluirlas en la respuesta
        return {
            username: credentials.username,
            password: credentials.password,
            userEmail: user.email,
            userName: user.name,
            expirationDate: credentials.expirationDate
        };
    } catch (error) {
        logger.error(`Error al procesar solicitud de prueba completada: ${error.message}`);
        logger.error(error.stack);
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
 * @param {Object} flowResult - Resultado del procesamiento de flujos
 * @returns {string} - Respuesta generada
 */
const generateContextualResponse = async (message, intents, entities, userData, conversationContext, memory, flowResult = null) => {
    try {
        logger.debug(`Generando respuesta contextual. FlowResult: ${JSON.stringify(flowResult)}`);
        
        // Si se completó un flujo de solicitud de prueba, generar respuesta con credenciales
        if (flowResult && flowResult.completed && flowResult.credentials) {
            logger.info(`Generando respuesta con credenciales para prueba completada`);
            return generateTrialCompletionResponse(flowResult.credentials);
        }
        
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
            },
            flowResult: flowResult // Agregar información del flujo al contexto
        };
        
        // Usar el servicio de respuesta mejorado
        return await generateResponse(message, intents, entities, userData, enrichedContext);
        
    } catch (error) {
        logger.error(`Error al generar respuesta contextual: ${error.message}`);
        return "Lo siento, estoy teniendo problemas técnicos. Por favor, intenta de nuevo.";
    }
};

/**
 * Inicia un flujo de tutorial basado en la intención
 * @param {string} intentName - Nombre de la intención
 * @param {Object} entities - Entidades extraídas
 * @param {Object} user - Usuario
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} conversationContext - Contexto de conversación
 * @returns {Object} - Resultado del flujo
 */
const startTutorialFlow = async (intentName, entities, user, phoneNumber, conversationContext) => {
    try {
        logger.info(`Iniciando flujo de tutorial para intención: ${intentName}`);
        
        const flowResult = await tutorialFlowService.startTutorialFlow(
            intentName,
            entities,
            user,
            phoneNumber,
            conversationContext
        );
        
        if (flowResult.started) {
            // Guardar estado del flujo activo
            activeFlowStates.set(phoneNumber, flowResult.flowState);
            
            logger.info(`Flujo de tutorial iniciado exitosamente para ${phoneNumber}`);
            
            return {
                completed: false,
                flowType: flowResult.flowState.flowType,
                message: flowResult.message,
                requiresInput: flowResult.requiresInput
            };
        } else {
            logger.warn(`No se pudo iniciar flujo de tutorial para ${intentName}`);
            return {
                completed: false,
                flowType: null
            };
        }
    } catch (error) {
        logger.error(`Error al iniciar flujo de tutorial: ${error.message}`);
        return {
            completed: false,
            flowType: null
        };
    }
};

/**
 * Genera respuesta de finalización de solicitud de prueba con credenciales
 * @param {Object} credentials - Credenciales creadas
 * @returns {string} - Respuesta con credenciales
 */
const generateTrialCompletionResponse = (credentials) => {
    const serviceName = generalConfig.serviceMetadata.name || 'ERP Demo';
    const serviceUrl = process.env.ERP_SERVICE_URL || 'https://erp-demo.ejemplo.com';
    const trialDays = generalConfig.serviceMetadata.trialDuration || 7;
    
    const expirationDate = new Date(credentials.expirationDate);
    const formattedDate = expirationDate.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    return `🎉 ¡Felicidades ${credentials.userName}! Tu cuenta de prueba de ${serviceName} ha sido creada exitosamente.

📋 **DATOS DE ACCESO:**
👤 Usuario: *${credentials.username}*
🔐 Contraseña: *${credentials.password}*

🌐 **ACCESO AL SISTEMA:**
${serviceUrl}/login

📧 Hemos enviado esta información también a: ${credentials.userEmail}

⏰ **DURACIÓN:** Tu cuenta estará activa durante ${trialDays} días (hasta el ${formattedDate}).

🚀 **PRÓXIMOS PASOS:**
1. Ingresa al sistema con tus credenciales
2. Explora todos los módulos disponibles
3. Si tienes dudas, contacta nuestro soporte

¡Disfruta explorando ${serviceName} y descubre cómo puede transformar tu negocio! 💼✨`;
};

/**
 * Genera una respuesta de error contextual
 * @param {string} phoneNumber - Número de teléfono
 * @param {Error} error - Error ocurrido
 * @returns {string} - Mensaje de error
 */
const generateErrorResponse = async (phoneNumber, error) => {
    const memory = await getConversationMemory(phoneNumber);
    const hasActiveFlow = activeFlowStates.has(phoneNumber);
    
    if (hasActiveFlow) {
        return "Disculpa, tuve un problema procesando tu solicitud. Por favor, intenta nuevamente o escribe 'cancelar' para reiniciar.";
    }
    
    return "Lo siento, estoy experimentando dificultades técnicas. Por favor, intenta de nuevo en unos momentos.";
};

/**
 * Establece el estado de un flujo activo
 * @param {string} phoneNumber - Número de teléfono
 * @param {Object} flowState - Estado del flujo
 */
const setActiveFlowState = (phoneNumber, flowState) => {
    activeFlowStates.set(phoneNumber, flowState);
    logger.debug(`Estado de flujo establecido para ${phoneNumber}: ${flowState.flowType}`);
};

/**
 * Obtiene el estado de un flujo activo
 * @param {string} phoneNumber - Número de teléfono
 * @returns {Object|null} - Estado del flujo o null
 */
const getActiveFlowState = (phoneNumber) => {
    return activeFlowStates.get(phoneNumber) || null;
};

/**
 * Limpia el estado de un flujo activo
 * @param {string} phoneNumber - Número de teléfono
 */
const clearActiveFlowState = (phoneNumber) => {
    activeFlowStates.delete(phoneNumber);
    logger.debug(`Estado de flujo limpiado para ${phoneNumber}`);
};

/**
 * Actualiza el estado del flujo activo después de cada interacción
 * @param {string} phoneNumber - Número de teléfono
 * @param {Array} intents - Intenciones detectadas
 * @param {Object} entities - Entidades extraídas
 * @param {Object} conversationContext - Contexto de conversación
 * @param {string} response - Respuesta generada
 */
const updateActiveFlowState = async (phoneNumber, intents, entities, conversationContext, response) => {
    const activeFlow = activeFlowStates.get(phoneNumber);
    
    if (!activeFlow) return;
    
    // Si la respuesta incluye "completado" o credenciales, limpiar el flujo
    if (response.includes('exitosamente') && response.includes('Usuario:') && response.includes('Contraseña:')) {
        clearActiveFlowState(phoneNumber);
        logger.info(`Flujo completado y limpiado para ${phoneNumber}`);
    }
    
    // Limpiar flujos expirados (más de 30 minutos)
    const expirationTime = 30 * 60 * 1000; // 30 minutos
    if (new Date() - activeFlow.startTime > expirationTime) {
        clearActiveFlowState(phoneNumber);
        logger.info(`Flujo expirado y limpiado para ${phoneNumber}`);
    }
};

/**
 * Limpia el contexto de usuario (útil para testing o reset)
 * @param {string} phoneNumber - Número de teléfono
 */
const clearUserContext = (phoneNumber) => {
    clearActiveFlowState(phoneNumber);
    clearConversationMemory(phoneNumber);
    logger.info(`Contexto completo limpiado para ${phoneNumber}`);
};

/**
 * Obtiene estadísticas del controlador
 * @returns {Object} - Estadísticas
 */
const getControllerStats = () => {
    return {
        activeFlows: activeFlowStates.size,
        flows: Array.from(activeFlowStates.entries()).map(([phone, flow]) => ({
            phone: phone.substring(0, 8) + '...',
            type: flow.flowType,
            startTime: flow.startTime
        }))
    };
};

// Limpieza periódica de flujos expirados
const cleanupExpiredFlows = () => {
    const expirationTime = 30 * 60 * 1000; // 30 minutos
    const now = new Date();
    
    for (const [phoneNumber, flow] of activeFlowStates.entries()) {
        if (now - flow.startTime > expirationTime) {
            clearActiveFlowState(phoneNumber);
            logger.info(`Flujo expirado limpiado automáticamente para ${phoneNumber}`);
        }
    }
};

/**
 * Verifica si la sesión debe cerrarse basándose en intenciones y contexto
 * @param {string} phoneNumber - Número de teléfono
 * @param {Array} intents - Intenciones detectadas
 * @param {string} response - Respuesta generada
 * @param {Object} flowResult - Resultado del flujo
 * @returns {Object} - { close: boolean, reason: string }
 */
const checkIfShouldCloseSession = async (phoneNumber, intents, response, flowResult) => {
    try {
        // Caso 1: Se completó un flujo de solicitud de prueba con credenciales
        if (flowResult && flowResult.completed && flowResult.credentials) {
            logger.info(`Sesión será cerrada - Credenciales entregadas para ${phoneNumber}`);
            return {
                close: true,
                reason: 'Credenciales de prueba entregadas exitosamente'
            };
        }
        
        // Caso 2: El usuario se despide
        if (intents.includes('despedida')) {
            logger.info(`Sesión será cerrada - Despedida detectada para ${phoneNumber}`);
            return {
                close: true,
                reason: 'Conversación finalizada por despedida del usuario'
            };
        }
        
        // Caso 3: Se detecta intención de cancelación
        if (intents.includes('cancelacion')) {
            logger.info(`Sesión será cerrada - Cancelación detectada para ${phoneNumber}`);
            return {
                close: true,
                reason: 'Proceso cancelado por el usuario'
            };
        }
        
        // Caso 4: La respuesta contiene indicadores de finalización
        const finalizationKeywords = [
            'gracias por usar nuestro servicio',
            'hasta pronto',
            'que tengas un excelente día',
            'conversación finalizada',
            'sesión cerrada'
        ];
        
        const responseLower = response.toLowerCase();
        const containsFinalization = finalizationKeywords.some(keyword =>
            responseLower.includes(keyword)
        );
        
        if (containsFinalization) {
            logger.info(`Sesión será cerrada - Palabras de finalización detectadas para ${phoneNumber}`);
            return {
                close: true,
                reason: 'Conversación completada satisfactoriamente'
            };
        }
        
        // No cerrar la sesión
        return { close: false, reason: null };
        
    } catch (error) {
        logger.error(`Error al verificar cierre de sesión: ${error.message}`);
        return { close: false, reason: null };
    }
};

// Ejecutar limpieza cada 15 minutos
setInterval(cleanupExpiredFlows, 15 * 60 * 1000);

module.exports = {
    handleMessage,
    clearUserContext,
    getControllerStats,
    clearActiveFlowState,
    cleanupExpiredFlows,
    // Exportar funciones útiles para testing
    processIntentsWithContext,
    startTrialRequestFlowWithContext,
    processCompletedTrialRequest,
    generateTrialCompletionResponse
};