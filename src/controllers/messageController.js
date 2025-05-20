const { detectIntents } = require('../services/nlpService');
const { extractEntities } = require('../services/entityService');
const { createOrUpdateUser, findUserByPhone, findUserByEmail } = require('../services/userService');
const { generateCredentials, createCredentials } = require('../services/credentialService');
const { saveMessage } = require('../services/conversationService');
const { logger } = require('../utils/logger');
const { validateEmail } = require('../utils/validators');

/**
 * Maneja los mensajes entrantes de WhatsApp
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} message - Mensaje recibido
 */
const handleMessage = async (client, message) => {
    const from = message.from;
    const body = message.body;
    
    logger.info(`Mensaje recibido de ${from}: ${body}`);
    
    // Guardar el mensaje en el historial de conversación
    await saveMessageToHistory(from, body, true);
    
    // Extraer entidades del mensaje
    const extractedEntities = await extractEntities(body);
    logger.info(`Entidades extraídas: ${JSON.stringify(extractedEntities)}`);
    
    // Si se detectó un nombre, actualizar el usuario
    const nombreEntity = extractedEntities.find(e => e.nombre);
    if (nombreEntity) {
        const user = await findUserByPhone(from);
        if (user) {
            // Actualizar el nombre del usuario si se detectó uno
            user.name = nombreEntity.nombre;
            await user.save();
            logger.info(`Nombre de usuario actualizado: ${from} -> ${nombreEntity.nombre}`);
        }
    }
    
    // Obtener el estado de la conversación del usuario (si existe)
    const userState = await getUserState(from);
    
    // Si el usuario está en medio de un flujo de conversación, continuar ese flujo
    if (userState && userState.conversationState) {
        await continueConversationFlow(client, message, userState, extractedEntities);
        return;
    }
    
    // Detectar intenciones del mensaje
    const { intents } = await detectIntents(body);
    logger.info(`Intenciones detectadas: ${JSON.stringify(intents)}`);
    
    // Construir respuesta basada en las intenciones y entidades detectadas
    const response = await constructResponse(intents, extractedEntities, from);
    
    // Enviar respuesta al usuario
    await client.sendMessage(from, response);
    
    // Guardar la respuesta en el historial
    await saveMessageToHistory(from, response, false);
    
    // Iniciar flujo de conversación si es necesario
    if (intents.includes('inicio de prueba') && needsMoreInfo(extractedEntities)) {
        await startTrialFlow(client, message, convertEntitiesToObject(extractedEntities));
    }
};

/**
 * Convierte un array de entidades a un objeto simple
 * @param {Array} entitiesArray - Array de entidades
 * @returns {Object} - Objeto con las entidades
 */
const convertEntitiesToObject = (entitiesArray) => {
    const entitiesObj = {
        nombre: null,
        usuario: null,
        clave: null
    };
    
    entitiesArray.forEach(entity => {
        if ('nombre' in entity) entitiesObj.nombre = entity.nombre;
        if ('usuario' in entity) entitiesObj.usuario = entity.usuario;
        if ('clave' in entity) entitiesObj.clave = entity.clave;
    });
    
    return entitiesObj;
};

/**
 * Verifica si se necesita más información para completar una solicitud
 * @param {Array} entitiesArray - Array de entidades extraídas
 * @returns {boolean} - true si se necesita más información
 */
const needsMoreInfo = (entitiesArray) => {
    const entities = convertEntitiesToObject(entitiesArray);
    // Verificar si falta información esencial para comenzar una prueba
    return !entities.nombre || !entities.usuario || !entities.clave;
};

/**
 * Construye una respuesta basada en las intenciones y entidades detectadas
 * @param {Array} intents - Intenciones detectadas
 * @param {Array} entitiesArray - Array de entidades extraídas
 * @param {string} userId - ID del usuario
 * @returns {string} - Respuesta construida
 */
const constructResponse = async (intents, entitiesArray, userId) => {
    let response = '';
    
    // Convertir array de entidades a un formato más fácil de manejar
    const entities = convertEntitiesToObject(entitiesArray);
    
    // Si no se detectaron intenciones, respuesta por defecto
    if (!intents || intents.length === 0) {
        return "Disculpa, no he podido entender bien tu mensaje. ¿Podrías ser más específico sobre lo que necesitas?";
    }
    
    // Obtener usuario si existe
    const user = await findUserByPhone(userId);
    const userName = user ? user.name : (entities.nombre || "");
    
    // Si se detectó un saludo
    if (intents.includes('saludo')) {
        response += userName 
            ? `¡Hola ${userName}! Bienvenido de nuevo a nuestro servicio. `
            : "¡Hola! Bienvenido a nuestro servicio. ";
    }
    
    // Si hay interés en el servicio
    if (intents.includes('interes en el servicio')) {
        response += "Me alegra que estés interesado en nuestro servicio. Ofrecemos soluciones de ERP, CRM y Business Intelligence que pueden ayudar a optimizar los procesos de tu empresa. ";
        
        if (!intents.includes('inicio de prueba')) {
            response += "Si quieres comenzar una prueba gratuita, solo dímelo. ";
        }
    }
    
    // Si se detectó una confirmación
    if (intents.includes('confirmacion')) {
        response += "Perfecto, he recibido tu confirmación. ";
        
        // Si estamos en contexto de una prueba pero no se ha iniciado explícitamente
        if (!intents.includes('inicio de prueba') && entities.usuario) {
            response += `He registrado tu nombre de usuario como "${entities.usuario}". `;
        }
    }
    
    // Si se está iniciando una prueba
    if (intents.includes('inicio de prueba')) {
        response += "Para comenzar tu prueba, necesitaré algunos datos. ";
        
        // Verificar qué información ya tenemos
        let missingInfo = [];
        if (!entities.nombre && !userName) missingInfo.push("nombre completo");
        if (!entities.usuario) missingInfo.push("nombre de usuario preferido");
        if (!entities.clave) missingInfo.push("contraseña");
        
        // Si falta información
        if (missingInfo.length > 0) {
            response += `Necesito tu ${missingInfo.join(", ")} para configurar tu cuenta. `;
            
            // Solicitar específicamente el primer dato faltante
            if (!entities.nombre && !userName) {
                response += "¿Cuál es tu nombre completo? ";
            } else if (!entities.usuario) {
                response += "¿Qué nombre de usuario te gustaría utilizar? ";
            } else if (!entities.clave) {
                response += "¿Qué contraseña deseas usar para tu cuenta? ";
            }
        } 
        // Si tenemos toda la información necesaria
        else {
            const name = entities.nombre || userName;
            response += `Excelente ${name}, tu prueba está lista para comenzar. Te he registrado con el usuario "${entities.usuario}". Podrás acceder al sistema en unos momentos, te enviaré los detalles de acceso por este mismo canal. `;
        }
    }
    
    // Si hay agradecimiento
    if (intents.includes('agradecimiento')) {
        response += userName 
            ? `¡Es un placer ayudarte, ${userName}! Estamos aquí para lo que necesites. `
            : "¡De nada! Estamos aquí para ayudarte en lo que necesites. ";
    }
    
    // Si se solicita soporte técnico
    if (intents.includes('soporte tecnico')) {
        response += "Entiendo que necesitas asistencia técnica. Nuestro equipo de soporte está disponible de lunes a viernes de 9am a 6pm. ";
        
        if (entities.usuario) {
            response += `Revisaré los problemas asociados con tu usuario "${entities.usuario}". `;
        } else {
            response += "¿Puedes darme más detalles sobre el problema que estás experimentando? ";
        }
        
        if (entities.clave) {
            response += "He notado que has compartido tu contraseña. Por seguridad, te recomendaría cambiarla después de resolver este problema. ";
        }
    }
    
    // Si se detectó nombre pero no se utilizó en la respuesta y no es un inicio de prueba
    if (entities.nombre && !response.includes(entities.nombre) && !intents.includes('inicio de prueba')) {
        response += `Gracias por compartir tu nombre, ${entities.nombre}. He actualizado tu información. `;
    }
    
    return response.trim();
};

/**
 * Inicia el flujo de conversación para solicitud de prueba
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} message - Mensaje recibido
 * @param {Object} entities - Entidades ya extraídas
 */
const startTrialFlow = async (client, message, entities) => {
    try {
        // Determinar qué información falta
        const missingInfo = [];
        if (!entities.nombre) missingInfo.push('nombre');
        if (!entities.usuario) missingInfo.push('usuario');
        if (!entities.clave) missingInfo.push('clave');
        
        if (missingInfo.length === 0) {
            // Si ya tenemos toda la información, no necesitamos iniciar un flujo
            return;
        }
        
        // Guardar el estado de la conversación
        await saveUserState(message.from, {
            conversationState: 'trial_request',
            entities: entities,
            missingInfo: missingInfo,
            currentStep: 0
        });
        
        // Solicitar el primer dato faltante (ya se ha enviado en la respuesta principal)
    } catch (error) {
        logger.error(`Error al iniciar flujo de solicitud de prueba: ${error.message}`);
    }
};

/**
 * Continúa un flujo de conversación existente
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} message - Mensaje recibido
 * @param {Object} userState - Estado actual del usuario
 * @param {Array} messageEntities - Entidades extraídas del mensaje actual
 */
const continueConversationFlow = async (client, message, userState, messageEntities) => {
    try {
        const { conversationState, entities, missingInfo, currentStep } = userState;
        
        // Solo manejamos el flujo de solicitud de prueba por ahora
        if (conversationState !== 'trial_request') {
            return;
        }
        
        // Convertir entidades del mensaje a objeto
        const entitiesObj = convertEntitiesToObject(messageEntities);
        
        // Actualizar entidades con la respuesta del usuario
        const currentField = missingInfo[currentStep];
        let fieldValue = null;
        
        // Determinar el valor según el campo actual
        switch (currentField) {
            case 'nombre':
                fieldValue = entitiesObj.nombre;
                break;
            case 'usuario':
                fieldValue = entitiesObj.usuario;
                break;
            case 'clave':
                fieldValue = entitiesObj.clave;
                break;
        }
        
        // Si no se detectó valor o es inválido
        if (!fieldValue) {
            // Intentar usar el mensaje completo como valor
            fieldValue = message.body.trim();
            
            // Validar según el tipo de campo
            if (currentField === 'usuario' && fieldValue.includes(' ')) {
                const validationMsg = "El nombre de usuario no debe contener espacios. Por favor, intenta de nuevo con un nombre de usuario válido.";
                await client.sendMessage(message.from, validationMsg);
                await saveMessageToHistory(message.from, validationMsg, false);
                return;
            } else if (currentField === 'clave' && fieldValue.length < 6) {
                const validationMsg = "La contraseña debe tener al menos 6 caracteres. Por favor, intenta de nuevo con una contraseña más segura.";
                await client.sendMessage(message.from, validationMsg);
                await saveMessageToHistory(message.from, validationMsg, false);
                return;
            }
        }
        
        // Actualizar entidades
        entities[currentField] = fieldValue;
        
        // Verificar si hay más información por solicitar
        if (currentStep < missingInfo.length - 1) {
            // Avanzar al siguiente paso
            const nextStep = currentStep + 1;
            const nextField = missingInfo[nextStep];
            
            // Actualizar estado del usuario
            await saveUserState(message.from, {
                ...userState,
                entities,
                currentStep: nextStep
            });
            
            // Solicitar siguiente información
            let responseMessage = '';
            switch (nextField) {
                case 'nombre':
                    responseMessage = '¡Gracias! Ahora, ¿me podrías decir tu nombre completo?';
                    break;
                case 'usuario':
                    responseMessage = 'Perfecto. Ahora necesito que elijas un nombre de usuario para acceder al sistema. ¿Qué nombre de usuario te gustaría usar?';
                    break;
                case 'clave':
                    responseMessage = 'Excelente. Por último, necesito que establezcas una contraseña para tu cuenta. Debe tener al menos 6 caracteres. ¿Qué contraseña te gustaría usar?';
                    break;
            }
            
            await client.sendMessage(message.from, responseMessage);
            await saveMessageToHistory(message.from, responseMessage, false);
        } else {
            // Toda la información ha sido recolectada
            await processTrialRequest(client, message, entities);
            
            // Limpiar el estado de la conversación
            await clearUserState(message.from);
        }
    } catch (error) {
        logger.error(`Error al continuar flujo de conversación: ${error.message}`);
        const errorMessage = 'Lo siento, ha ocurrido un error al procesar tu solicitud. ¿Podríamos intentarlo de nuevo?';
        await client.sendMessage(message.from, errorMessage);
        await saveMessageToHistory(message.from, errorMessage, false);
    }
};

/**
 * Procesa la solicitud de prueba con toda la información necesaria
 * @param {Object} client - Cliente de WhatsApp
 * @param {Object} message - Mensaje recibido
 * @param {Object} entities - Entidades recopiladas
 */
const processTrialRequest = async (client, message, entities) => {
    try {
        // Crear o actualizar usuario en la base de datos
        const user = await createOrUpdateUser({
            phone: message.from,
            name: entities.nombre,
            email: `${entities.usuario}@temp.com` // Email temporal basado en el usuario
        });
        
        // Crear credenciales con los datos proporcionados por el usuario
        await createCredentials(user, entities.usuario, entities.clave, 'erp');
        
        // Enviar mensaje de confirmación
        const confirmationMessage = `
¡Felicidades ${entities.nombre}! 🎉 Tu cuenta de prueba ha sido creada exitosamente.

Aquí están tus datos de acceso:
👤 Usuario: ${entities.usuario}
🔐 Contraseña: ${entities.clave}

Puedes comenzar a usar el servicio inmediatamente en:
https://erp-demo.ejemplo.com/login

Tu cuenta estará activa durante 7 días. Si tienes alguna duda, solo escríbeme y estaré encantado de ayudarte.

¡Disfruta de tu experiencia!
        `;
        
        await client.sendMessage(message.from, confirmationMessage);
        await saveMessageToHistory(message.from, confirmationMessage, false);
    } catch (error) {
        logger.error(`Error al procesar solicitud de prueba: ${error.message}`);
        const errorMessage = 'Lo siento, ha ocurrido un error al crear tu cuenta de prueba. Por favor, intenta nuevamente más tarde.';
        await client.sendMessage(message.from, errorMessage);
        await saveMessageToHistory(message.from, errorMessage, false);
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
                email: `${phone.replace(/[^0-9]/g, '')}@temp.com`  // Email temporal
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

// Funciones para manejar el estado de la conversación
const userStates = {};

const getUserState = async (userId) => {
    return userStates[userId];
};

const saveUserState = async (userId, state) => {
    userStates[userId] = state;
};

const clearUserState = async (userId) => {
    delete userStates[userId];
};

module.exports = {
    handleMessage,
    constructResponse,
    saveMessageToHistory
};