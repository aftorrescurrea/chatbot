const { detectIntent } = require('../services/nlpService');
const { extractEntities } = require('../services/entityService');
const { createOrUpdateUser, findUserByPhone, findUserByEmail } = require('../services/userService');
const { generateCredentials, createCredentials, usernameExists } = require('../services/credentialService');
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
    
    // Extraer entidades del mensaje (nombre, email, etc.)
    const entities = await extractEntities(body);
    logger.debug(`Entidades extraídas: ${JSON.stringify(entities)}`);
    
    // Si se detectó un nombre, actualizar el usuario
    if (entities.nombre) {
        // Verificar si el mensaje es una pregunta sobre el nombre
        const lowerBody = body.toLowerCase();
        const isQuestion = lowerBody.includes('?') ||
                          lowerBody.includes('cual') ||
                          lowerBody.includes('cuál') ||
                          lowerBody.includes('como me llamo') ||
                          lowerBody.includes('cómo me llamo');
        
        if (!isQuestion) {
            const user = await findUserByPhone(from);
            if (user) {
                // Actualizar el nombre del usuario si se detectó uno
                user.name = entities.nombre;
                await user.save();
                logger.info(`Nombre de usuario actualizado: ${from} -> ${entities.nombre}`);
                
                // Confirmar al usuario que su nombre ha sido registrado
                const confirmationMessage = `¡Gracias! He registrado tu nombre como "${entities.nombre}". 😊`;
                await client.sendMessage(from, confirmationMessage);
                await saveMessageToHistory(from, confirmationMessage, false);
            }
        }
    }
    
    // Obtener el estado de la conversación del usuario (si existe)
    const userState = await getUserState(from);
    
    // Si el usuario está en medio de un flujo de conversación, continuar ese flujo
    if (userState && userState.conversationState) {
        await continueConversationFlow(client, message, userState);
        return;
    }
    
    // Primero verificar frases exactas y palabras clave
    const lowerBody = body.toLowerCase();
    
    // Verificar si es una solicitud de ayuda directa
    if (lowerBody === 'ayuda' || lowerBody === 'help') {
        logger.info('FRASE EXACTA DETECTADA: Solicitud de ayuda directa');
        await handleHelp(client, message);
        return;
    }
    
    // Verificación especial para frases exactas de información de servicios
    if (lowerBody === 'cuéntame más sobre sus servicios' ||
        lowerBody === 'cuentame mas sobre sus servicios' ||
        lowerBody === 'que servicios ofrecen' ||
        lowerBody === 'cuales son sus servicios' ||
        lowerBody === 'información sobre servicios' ||
        lowerBody === 'informacion sobre servicios') {
        logger.info('FRASE EXACTA DETECTADA: Solicitud de información sobre servicios');
        await handleServiceInfo(client, message);
        return;
    }
    
    // Verificación para palabras clave relacionadas con servicios
    if ((lowerBody.includes('servicio') || lowerBody.includes('servicios')) &&
        (lowerBody.includes('cuéntame') || lowerBody.includes('cuentame') ||
         lowerBody.includes('información') || lowerBody.includes('informacion') ||
         lowerBody.includes('cuales') || lowerBody.includes('que') ||
         lowerBody.includes('ofrecen'))) {
        logger.info('PALABRAS CLAVE DETECTADAS: Solicitud de información sobre servicios');
        await handleServiceInfo(client, message);
        return;
    }
    
    // Verificación especial para frases exactas de prueba de servicio
    if (lowerBody === 'quiero probar un servicio' ||
        lowerBody === 'quiero probar el servicio') {
        logger.info('FRASE EXACTA DETECTADA: Solicitud de prueba de servicio');
        await handleServiceRequest(client, message, {name: 'solicitar_servicio'});
        return;
    }
    
    // Verificación especial para frases exactas de hablar con asesor
    if (lowerBody === 'necesito hablar con una persona' ||
        lowerBody === 'quiero hablar con una persona' ||
        lowerBody === 'necesito hablar con un asesor') {
        logger.info('FRASE EXACTA DETECTADA: Solicitud para hablar con un asesor');
        await handleHumanRequest(client, message);
        return;
    }
    
    // Solo si no se detectaron palabras clave, usar el NLP
    logger.info('No se detectaron frases exactas o palabras clave, usando NLP...');
    const intent = await detectIntent(body);
    logger.info(`Intención detectada por NLP: ${intent.name} (confianza: ${intent.confidence})`);
    
    // Manejar la intención detectada por NLP
    switch (intent.name) {
        case 'solicitar_prueba_erp':
        case 'solicitar_acceso_crm':
        case 'solicitar_acceso_bi':
        case 'solicitar_servicio':
        case 'quiero_probar_servicio':
            await handleServiceRequest(client, message, intent);
            break;
            
        case 'saludar':
            await handleGreeting(client, message);
            break;
            
        case 'ayuda':
            await handleHelp(client, message);
            break;
            
        case 'informacion_servicios':
        case 'cuentame_mas':
            await handleServiceInfo(client, message);
            break;
            
        case 'hablar_con_asesor':
        case 'necesito_persona':
            await handleHumanRequest(client, message);
            break;
            
        case 'pregunta_sistema':
            await handleSystemQuestion(client, message);
            break;
            
        case 'pregunta_personal':
            await handlePersonalQuestion(client, message);
            break;
            
        case 'pregunta_fuera_contexto':
            await handleOffTopicQuestion(client, message);
            break;
            
        default:
            // Verificar si el mensaje contiene otras palabras clave
            logger.info(`Analizando mensaje para palabras clave secundarias: "${lowerBody}"`);
            
            // Verificar si es una solicitud de información sobre servicios
            if ((lowerBody.includes('cuéntame') || lowerBody.includes('cuentame') ||
                 lowerBody.includes('información') || lowerBody.includes('informacion') ||
                 lowerBody.includes('info') || lowerBody.includes('más') || lowerBody.includes('mas') ||
                 lowerBody.includes('dime') || lowerBody.includes('explica')) &&
                (lowerBody.includes('servicio') || lowerBody.includes('servicios') ||
                 lowerBody.includes('ofrecen') || lowerBody.includes('tienen'))) {
                
                logger.info('Detectada solicitud de información sobre servicios');
                await handleServiceInfo(client, message);
            }
            // Caso especial para la frase exacta
            else if (lowerBody === 'quiero probar un servicio' ||
                lowerBody === 'quiero probar el servicio' ||
                lowerBody === 'quiero probar el sistema') {
                logger.info('Detectada frase exacta: "Quiero probar un servicio/sistema"');
                await handleServiceRequest(client, message, {name: 'solicitar_servicio'});
            }
            // Verificar si es una solicitud de prueba de servicio
            else if ((lowerBody.includes('probar') || lowerBody.includes('prueba') ||
                      lowerBody.includes('acceso') || lowerBody.includes('quiero') ||
                      lowerBody.includes('solicitar') || lowerBody.includes('registrar')) &&
                     (lowerBody.includes('servicio') || lowerBody.includes('sistema') ||
                      lowerBody.includes('erp') || lowerBody.includes('crm') || lowerBody.includes('bi'))) {
                
                logger.info('Detectada solicitud de prueba de servicio');
                await handleServiceRequest(client, message, {name: 'solicitar_servicio'});
            }
            // Caso especial para la frase exacta
            else if (lowerBody === 'necesito hablar con una persona' ||
                     lowerBody === 'quiero hablar con una persona' ||
                     lowerBody === 'necesito hablar con un asesor') {
                logger.info('Detectada frase exacta: "Necesito hablar con una persona"');
                await handleHumanRequest(client, message);
            }
            // Verificar si es una solicitud para hablar con un asesor
            else if ((lowerBody.includes('hablar') || lowerBody.includes('necesito') ||
                      lowerBody.includes('contactar') || lowerBody.includes('comunicar')) &&
                     (lowerBody.includes('persona') || lowerBody.includes('asesor') ||
                      lowerBody.includes('humano') || lowerBody.includes('alguien'))) {
                
                logger.info('Detectada solicitud para hablar con un asesor');
                await handleHumanRequest(client, message);
            }
            // Verificar si es una pregunta sobre cómo ingresar o usar el sistema
            else if (lowerBody.includes('como ingreso') ||
                     lowerBody.includes('cómo ingreso') ||
                     lowerBody.includes('como entro') ||
                     lowerBody.includes('cómo entro') ||
                     lowerBody.includes('como accedo') ||
                     lowerBody.includes('cómo accedo') ||
                     lowerBody.includes('como usar') ||
                     lowerBody.includes('cómo usar')) {
                
                logger.info('Detectada pregunta sobre cómo ingresar al sistema');
                await handleSystemQuestion(client, message);
            }
            // Verificar si es una pregunta personal o sobre datos del usuario
            else if (lowerBody.includes('cual es mi nombre') ||
                     lowerBody.includes('cuál es mi nombre') ||
                     lowerBody.includes('como me llamo') ||
                     lowerBody.includes('cómo me llamo') ||
                     lowerBody.includes('sabes mi nombre') ||
                     lowerBody.includes('cual es mi usuario') ||
                     lowerBody.includes('cuál es mi usuario') ||
                     lowerBody.includes('cual es mi contraseña') ||
                     lowerBody.includes('cuál es mi contraseña')) {
                
                logger.info('Detectada pregunta personal sobre datos del usuario');
                await handlePersonalQuestion(client, message);
            }
            // Si no se detecta ninguna palabra clave, responder con mensaje de intención desconocida
            else {
                logger.info('No se detectaron palabras clave específicas');
                await handleUnknownIntent(client, message);
            }
            break;
    }
};

/**
 * Maneja la solicitud de acceso a un servicio
 */
const handleServiceRequest = async (client, message, intent) => {
    try {
        // Extraer entidades del mensaje
        const entities = await extractEntities(message.body);
        logger.debug(`Entidades extraídas: ${JSON.stringify(entities)}`);
        
        // Verificar si tenemos toda la información necesaria
        const missingInfo = checkMissingInformation(entities);
        
        // Determinar el tipo de servicio basado en la intención
        let serviceType = 'generic';
        if (intent.name === 'solicitar_prueba_erp') {
            serviceType = 'erp';
        } else if (intent.name === 'solicitar_acceso_crm') {
            serviceType = 'crm';
        } else if (intent.name === 'solicitar_acceso_bi') {
            serviceType = 'bi';
        }
        
        // Guardar el tipo de servicio en las entidades
        entities.serviceType = serviceType;
        
        if (missingInfo.length > 0) {
            // Iniciar flujo de conversación para obtener información faltante
            await startConversationFlow(client, message, `${serviceType}_request`, entities, missingInfo);
        } else {
            // Procesar la solicitud directamente
            await processServiceRequest(client, message, entities);
        }
    } catch (error) {
        logger.error(`Error al manejar solicitud de ERP: ${error.message}`);
        const errorMessage = '¡Vaya! Parece que tuve un pequeño problema al procesar tu solicitud. ¿Podrías intentarlo de nuevo en unos minutos? A veces necesito un respiro. 😅';
        await message.reply(errorMessage);
        
        // Guardar el mensaje de error en el historial de conversación
        await saveMessageToHistory(message.from, errorMessage, false);
    }
};

/**
 * Verifica qué información falta para completar la solicitud
 */
const checkMissingInformation = (entities) => {
    const requiredFields = ['nombre', 'email', 'username', 'password'];
    const missingFields = [];
    
    for (const field of requiredFields) {
        if (!entities[field]) {
            missingFields.push(field);
        }
    }
    
    return missingFields;
};

/**
 * Inicia un flujo de conversación para obtener información faltante
 */
const startConversationFlow = async (client, message, flowType, entities, missingInfo) => {
    try {
        // Guardar el estado de la conversación
        await saveUserState(message.from, {
            conversationState: flowType,
            entities: entities,
            missingInfo: missingInfo,
            currentStep: 0
        });
        
        // Enviar mensaje solicitando la primera información faltante
        const firstMissingField = missingInfo[0];
        
        // Personalizar el mensaje según el tipo de servicio
        let serviceName = "nuestro servicio";
        switch (entities.serviceType) {
            case 'erp':
                serviceName = "nuestro sistema ERP";
                break;
            case 'crm':
                serviceName = "nuestro sistema CRM";
                break;
            case 'bi':
                serviceName = "nuestra plataforma de Business Intelligence";
                break;
        }
        
        let responseMessage = `¡Genial! Para poder darte acceso a ${serviceName}, necesito algunos datos. 😊\n\n`;
        
        switch (firstMissingField) {
            case 'nombre':
                responseMessage += '¿Cómo te llamas? Me gustaría saber tu nombre completo para personalizar tu experiencia.';
                break;
            case 'email':
                responseMessage += '¿Me podrías compartir tu correo electrónico? Lo necesito para enviarte información importante sobre tu cuenta.';
                break;
            case 'username':
                responseMessage += '¡Ahora viene lo divertido! ¿Qué nombre de usuario te gustaría usar para acceder al sistema? Elige uno que sea fácil de recordar para ti.';
                break;
            case 'password':
                responseMessage += 'Por último, necesitas una contraseña para proteger tu cuenta. Intenta usar una que tenga al menos 6 caracteres y sea segura. ¿Cuál te gustaría usar?';
                break;
            default:
                responseMessage += `¿Me podrías decir cuál es tu ${firstMissingField}? Lo necesito para completar tu registro.`;
        }
        
        await client.sendMessage(message.from, responseMessage);
        
        // Guardar la respuesta en el historial de conversación
        await saveMessageToHistory(message.from, responseMessage, false);
    } catch (error) {
        logger.error(`Error al iniciar flujo de conversación: ${error.message}`);
        const errorMessage = '¡Ups! Parece que tuve un pequeño tropiezo mientras procesaba tu solicitud. ¿Te importaría intentarlo de nuevo? Prometo hacerlo mejor esta vez. 🙏';
        await message.reply(errorMessage);
        
        // Guardar el mensaje de error en el historial de conversación
        await saveMessageToHistory(message.from, errorMessage, false);
    }
};

/**
 * Continúa un flujo de conversación existente
 */
/**
 * Limpia el texto de entrada para extraer solo el nombre
 * @param {string} text - Texto a limpiar
 * @returns {string} - Nombre limpio
 */
const cleanNameInput = (text) => {
    // Verificar si es una pregunta sobre el nombre
    const nameQuestionPattern = /^(cual|cuál|como|cómo)(\s+es)?(\s+mi)?(\s+nombre)(\?)?$/i;
    if (nameQuestionPattern.test(text.trim())) {
        logger.info(`Detectada pregunta sobre el nombre: "${text}" - No se extraerá como nombre`);
        return null;
    }

    // Verificar si es una declaración de nombre de usuario
    const usernamePattern = /^mi\s+nombre\s+de\s+usuario\s+(será|es|va\s+a\s+ser)\s+(.+)$/i;
    const usernameMatch = text.match(usernamePattern);
    if (usernameMatch) {
        logger.info(`Detectada declaración de nombre de usuario: "${text}" - No se extraerá como nombre`);
        return null;
    }

    // Eliminar preguntas o frases comunes después del nombre
    const questionPatterns = [
        /\s*,?\s*tienen demo\??/i,
        /\s*,?\s*tienen sistema\??/i,
        /\s*,?\s*tienen servicio\??/i,
        /\s*\?\s*$/,
        /\s*,?\s*\w+\?/i,  // Patrón general para ", palabra?"
        /\s+tienen\s+\w+$/i,  // "tienen" seguido de una palabra al final
        /\s+ustedes\s+tienen\s+.+$/i,  // "ustedes tienen" seguido de cualquier texto
        /\s+del\s+servicio\??$/i  // "del servicio" al final
    ];
    
    let cleanedText = text.trim();
    
    for (const pattern of questionPatterns) {
        cleanedText = cleanedText.replace(pattern, '');
    }
    
    return cleanedText.trim();
};

const continueConversationFlow = async (client, message, userState) => {
    try {
        const { conversationState, entities, missingInfo, currentStep } = userState;
        
        // Actualizar entidades con la respuesta del usuario
        const currentField = missingInfo[currentStep];
        let isValid = true;
        let validationMessage = '';
        
        // Verificar si el mensaje es una pregunta sobre datos personales
        const isPersonalQuestion = /^(cual|cuál|como|cómo)(\s+es)?(\s+mi)(\s+(nombre|usuario|contraseña|email|correo))(\?)?$/i.test(message.body);
        
        if (isPersonalQuestion) {
            // Si es una pregunta personal, manejarla como tal
            await handlePersonalQuestion(client, message);
            return;
        }
        
        // Verificar si es una declaración de nombre de usuario
        const usernamePattern = /^mi\s+nombre\s+de\s+usuario\s+(será|es|va\s+a\s+ser)\s+(.+)$/i;
        const usernameMatch = message.body.match(usernamePattern);
        
        if (usernameMatch && currentField === 'username') {
            // Extraer el nombre de usuario de la declaración
            const extractedUsername = usernameMatch[2].trim();
            logger.info(`Nombre de usuario extraído de la declaración: "${extractedUsername}"`);
            message.body = extractedUsername;
        }
        
        // Validar la respuesta según el campo
        if (currentField === 'email') {
            isValid = validateEmail(message.body);
            validationMessage = '¡Ups! Parece que ese correo electrónico no tiene el formato correcto. ¿Podrías revisarlo y enviarlo de nuevo? Necesito un correo válido para poder enviarte información importante. 📧';
        } else if (currentField === 'username') {
            try {
                // Verificar si es una declaración de nombre de usuario
                const usernamePattern = /^mi\s+nombre\s+de\s+usuario\s+(será|es|va\s+a\s+ser)\s+(.+)$/i;
                const usernameMatch = message.body.match(usernamePattern);
                
                if (usernameMatch) {
                    // Extraer el nombre de usuario de la declaración
                    message.body = usernameMatch[2].trim();
                    logger.info(`Nombre de usuario extraído de la declaración: "${message.body}"`);
                }
                
                // Verificar si el nombre de usuario ya existe
                const exists = await usernameExists(message.body);
                if (exists) {
                    isValid = false;
                    validationMessage = '¡Vaya! Parece que ese nombre de usuario ya está en uso. ¿Te gustaría probar con otro? Quizás algo como tu nombre con algunos números o una variación creativa. 😊';
                }
            } catch (error) {
                logger.error(`Error al verificar nombre de usuario: ${error.message}`);
                isValid = false;
                validationMessage = 'Hmm, tuve un pequeño problema al verificar ese nombre de usuario. ¿Podrías intentar con otro diferente? Gracias por tu paciencia. 🙏';
            }
        } else if (currentField === 'password') {
            // Validar que la contraseña tenga al menos 6 caracteres
            if (message.body.length < 6) {
                isValid = false;
                validationMessage = 'Para mantener tu cuenta segura, necesito que tu contraseña tenga al menos 6 caracteres. ¿Podrías crear una un poco más larga? Recuerda que una buena contraseña es tu mejor protección. 🔒';
            }
        }
        
        if (!isValid) {
            await client.sendMessage(message.from, validationMessage);
            
            // Guardar la respuesta en el historial de conversación
            await saveMessageToHistory(message.from, validationMessage, false);
            return;
        }
        
        // Actualizar entidades
        if (currentField === 'nombre') {
            // Limpiar el nombre antes de guardarlo
            const cleanedName = cleanNameInput(message.body);
            
            // Si después de limpiar no queda un nombre válido, pedir de nuevo
            if (!cleanedName || cleanedName.length < 2) {
                const errorMsg = '¡Ups! No pude entender bien tu nombre. ¿Podrías decírmelo de nuevo, por favor? Solo necesito tu nombre, sin preguntas adicionales. 😊';
                await client.sendMessage(message.from, errorMsg);
                await saveMessageToHistory(message.from, errorMsg, false);
                return;
            }
            
            entities[currentField] = cleanedName;
            logger.info(`Nombre limpiado: "${message.body}" -> "${entities[currentField]}"`);
        } else if (currentField === 'password') {
            // Verificar que no estamos guardando una frase completa como contraseña
            const passwordPattern = /^(mi\s+contraseña\s+(será|es|va\s+a\s+ser)\s+)(.+)$/i;
            const passwordMatch = message.body.match(passwordPattern);
            
            if (passwordMatch) {
                // Extraer solo la contraseña de la frase
                entities[currentField] = passwordMatch[3].trim();
                logger.info(`Contraseña extraída de la frase: "${message.body}" -> "${entities[currentField]}"`);
            } else {
                entities[currentField] = message.body;
            }
        } else {
            entities[currentField] = message.body;
        }
        
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
                    responseMessage = '¡Gracias! Ahora, ¿me podrías decir tu nombre completo? Me encantaría saber cómo dirigirme a ti. 😊';
                    break;
                case 'email':
                    responseMessage = '¡Perfecto! Ahora necesito tu correo electrónico para poder enviarte información importante sobre tu cuenta. ¿Me lo podrías compartir?';
                    break;
                case 'username':
                    responseMessage = '¡Vamos muy bien! Ahora necesitas elegir un nombre de usuario para acceder al sistema. ¿Cuál te gustaría usar? Puede ser algo que represente tu personalidad o sea fácil de recordar. 🌟';
                    break;
                case 'password':
                    responseMessage = '¡Casi terminamos! Por último, necesitas crear una contraseña para proteger tu cuenta. Recuerda que debe tener al menos 6 caracteres. ¿Qué contraseña te gustaría usar? 🔒';
                    break;
                default:
                    responseMessage = `¡Genial! Ahora necesito saber tu ${nextField}. ¿Me lo podrías decir, por favor?`;
            }
            
            await client.sendMessage(message.from, responseMessage);
            
            // Guardar la respuesta en el historial de conversación
            await saveMessageToHistory(message.from, responseMessage, false);
        } else {
            // Toda la información ha sido recolectada
            await processServiceRequest(client, message, entities);
            
            // Limpiar el estado de la conversación
            await clearUserState(message.from);
        }
    } catch (error) {
        logger.error(`Error al continuar flujo de conversación: ${error.message}`);
        const errorMessage = '¡Vaya! Parece que tuve un pequeño problema mientras procesaba tu información. ¿Podríamos intentarlo de nuevo? A veces necesito un momento para organizar mis ideas. 🧩';
        await message.reply(errorMessage);
        
        // Guardar el mensaje de error en el historial de conversación
        await saveMessageToHistory(message.from, errorMessage, false);
    }
};

/**
 * Procesa la solicitud de servicio con toda la información necesaria
 */
const processServiceRequest = async (client, message, entities) => {
    try {
        // Verificar que tenemos todas las entidades necesarias
        const requiredFields = ['nombre', 'email', 'username', 'password'];
        const missingFields = [];
        
        for (const field of requiredFields) {
            if (!entities[field]) {
                missingFields.push(field);
            }
        }
        
        if (missingFields.length > 0) {
            logger.warn(`Faltan campos requeridos para procesar la solicitud: ${missingFields.join(', ')}`);
            await startConversationFlow(client, message, `${entities.serviceType || 'generic'}_request`, entities, missingFields);
            return;
        }
        
        // Verificar si el nombre de usuario ya existe y si el email ya existe
        let usernameAlreadyExists = false;
        let existingUser = null;
        
        try {
            usernameAlreadyExists = await usernameExists(entities.username);
        } catch (error) {
            logger.error(`Error al verificar existencia de username: ${error.message}`);
            // Continuamos con el proceso, asumiendo que el username no existe
        }
        
        try {
            existingUser = await findUserByEmail(entities.email);
        } catch (error) {
            logger.error(`Error al buscar usuario por email: ${error.message}`);
            // Continuamos con el proceso, asumiendo que el email no existe
        }
        
        if (usernameAlreadyExists || existingUser) {
            // Construir mensaje de error
            let responseMessage = "";
            
            if (existingUser && usernameAlreadyExists) {
                responseMessage += `¡Vaya! Parece que tanto el correo ${entities.email} como el nombre de usuario ${entities.username} ya están registrados en nuestro sistema. 🤔\n\n¿Es posible que ya hayas creado una cuenta con nosotros antes?`;
            } else if (existingUser) {
                responseMessage += `¡Interesante! El correo ${entities.email} ya está registrado en nuestro sistema. ¿Quizás ya habías creado una cuenta con nosotros anteriormente? 🧐`;
            } else {
                responseMessage += `¡Qué coincidencia! El nombre de usuario ${entities.username} ya está siendo utilizado por alguien más. ¿Te gustaría intentar con otro nombre de usuario? 😊`;
            }
            
            responseMessage += "\n\nSi no recuerdas tus datos de acceso o necesitas ayuda para recuperar tu cuenta, estoy aquí para ayudarte. Solo dime qué necesitas y te guiaré en el proceso. 👍";
            
            await client.sendMessage(message.from, responseMessage);
            
            // Guardar la respuesta en el historial de conversación
            await saveMessageToHistory(message.from, responseMessage, false);
            
            return;
        }
        
        // Crear o actualizar usuario en la base de datos
        const user = await createOrUpdateUser({
            phone: message.from,
            name: entities.nombre,
            email: entities.email
        });
        
        // Crear credenciales con los datos proporcionados por el usuario
        const credentials = await createCredentials(user, entities.username, entities.password, entities.serviceType);
        
        // Determinar la URL del servicio según el tipo
        let serviceUrl = process.env.DEFAULT_SERVICE_URL;
        let serviceName = "nuestro servicio";
        
        switch (entities.serviceType) {
            case 'erp':
                serviceUrl = process.env.ERP_SERVICE_URL;
                serviceName = "nuestro sistema ERP";
                break;
            case 'crm':
                serviceUrl = process.env.CRM_SERVICE_URL;
                serviceName = "nuestro sistema CRM";
                break;
            case 'bi':
                serviceUrl = process.env.BI_SERVICE_URL;
                serviceName = "nuestra plataforma de Business Intelligence";
                break;
        }
        
        // Verificar que la URL del servicio está definida
        const urlToShow = serviceUrl || "https://app.miempresa.com/login";
        
        // Enviar mensaje con las credenciales
        const responseMessage = `
¡Genial, ${entities.nombre}! 🎉 Tu cuenta para ${serviceName} ha sido creada con éxito.

Aquí están tus datos de acceso:

📱 Usuario: ${credentials.username}
🔐 Contraseña: ${credentials.password}

Puedes comenzar a usar el servicio inmediatamente en:
${urlToShow}

Tu cuenta estará activa durante 7 días. Durante este tiempo, podrás explorar todas las funcionalidades y ver cómo nuestro sistema puede ayudarte en tu día a día.

Si tienes alguna duda o necesitas ayuda mientras usas el sistema, ¡no dudes en escribirme! Estoy aquí para ayudarte en lo que necesites. 😊

¡Espero que disfrutes de la experiencia y encuentres útil nuestro servicio!
        `;
        
        await client.sendMessage(message.from, responseMessage);
        
        // Guardar la respuesta en el historial de conversación
        await saveMessageToHistory(message.from, responseMessage, false);
        
        // Notificar al administrador
        await notifyAdmin(user, credentials, entities.serviceType);
    } catch (error) {
        logger.error(`Error al procesar solicitud de ERP: ${error.message}`);
        const errorMessage = '¡Oh no! Parece que algo no salió como esperaba mientras creaba tu cuenta. ¿Podríamos intentarlo de nuevo en unos momentos? A veces los sistemas necesitan un pequeño descanso, igual que nosotros. 😊';
        await message.reply(errorMessage);
        
        // Guardar el mensaje de error en el historial de conversación
        await saveMessageToHistory(message.from, errorMessage, false);
    }
};

/**
 * Maneja un saludo del usuario
 */
const handleGreeting = async (client, message) => {
    const responseMessage = `
¡Hola! 👋 ¿Cómo estás hoy? Me llamo Asistente Virtual y estoy aquí para ayudarte con todo lo que necesites.

Puedo ayudarte con varias cosas:
• Solicitar acceso a nuestros servicios digitales
• Resolver cualquier duda que tengas sobre lo que ofrecemos
• Conectarte con un asesor humano si prefieres hablar con una persona

¿En qué te puedo ayudar hoy? Estoy aquí para hacer tu experiencia lo más sencilla y agradable posible. 😊
    `;
    
    await client.sendMessage(message.from, responseMessage);
    
    // Guardar la respuesta en el historial de conversación
    await saveMessageToHistory(message.from, responseMessage, false);
};

/**
 * Maneja una solicitud de ayuda
 */
const handleHelp = async (client, message) => {
    const responseMessage = `
¡Claro! Estoy aquí para ayudarte. 💁‍♂️ Estas son algunas frases que puedes usar para comunicarte conmigo:

• "Quiero probar un servicio" - Te guiaré para obtener acceso a cualquiera de nuestros servicios
• "Cuéntame más sobre sus servicios" - Te explicaré todo lo que ofrecemos
• "Necesito hablar con una persona" - Te conectaré con uno de nuestros asesores
• "Ayuda" - Te mostraré este mensaje de nuevo

¿Hay algo específico en lo que te pueda ayudar? Estoy aquí para hacer que todo sea más fácil para ti. 😊
    `;
    
    await client.sendMessage(message.from, responseMessage);
    
    // Guardar la respuesta en el historial de conversación
    await saveMessageToHistory(message.from, responseMessage, false);
};

/**
 * Maneja una intención desconocida
 */
const handleUnknownIntent = async (client, message) => {
    const responseMessage = `
¡Ups! Parece que no he entendido bien lo que me estás pidiendo. 🤔

Puedo ayudarte con:
• Darte acceso a cualquiera de nuestros servicios digitales
• Responder preguntas sobre lo que ofrecemos
• Conectarte con un asesor humano si lo prefieres

¿Podrías intentar explicarme de otra manera lo que necesitas? Estoy aquí para ayudarte, solo necesito entender mejor qué es lo que buscas. 😊
    `;
    
    await client.sendMessage(message.from, responseMessage);
    
    // Guardar la respuesta en el historial de conversación
    await saveMessageToHistory(message.from, responseMessage, false);
};

/**
 * Maneja una solicitud de información sobre servicios
 */
const handleServiceInfo = async (client, message) => {
    logger.info(`Ejecutando handleServiceInfo para ${message.from}`);
    const responseMessage = `
¡Claro! Me encanta hablar de nuestros servicios. 😊 Actualmente ofrecemos:

1️⃣ *Sistema ERP* - Una solución completa para gestionar todos los recursos de tu empresa: inventario, ventas, compras, finanzas y más. Perfecto para optimizar tus operaciones diarias.

2️⃣ *Sistema CRM* - Gestiona la relación con tus clientes de forma eficiente. Seguimiento de ventas, historial de interacciones, campañas de marketing y más para aumentar tus ventas.

3️⃣ *Plataforma de Business Intelligence* - Transforma tus datos en información valiosa con dashboards interactivos y reportes personalizados para tomar mejores decisiones.

Todos nuestros servicios incluyen:
• Acceso desde cualquier dispositivo
• Soporte técnico 24/7
• Actualizaciones regulares
• Capacitación inicial gratuita

¿Te gustaría probar alguno de estos servicios? Solo dime cuál te interesa y te ayudaré a configurar una cuenta de prueba. 🚀
    `;
    
    await client.sendMessage(message.from, responseMessage);
    
    // Guardar la respuesta en el historial de conversación
    await saveMessageToHistory(message.from, responseMessage, false);
};

/**
 * Maneja una solicitud para hablar con un asesor humano
 */
const handleHumanRequest = async (client, message) => {
    logger.info(`Ejecutando handleHumanRequest para ${message.from}`);
    const responseMessage = `
¡Por supuesto! Entiendo que a veces prefieras hablar directamente con una persona. 👨‍💼👩‍💼

He registrado tu solicitud y uno de nuestros asesores se pondrá en contacto contigo lo antes posible, normalmente en menos de 24 horas hábiles.

Mientras tanto, ¿hay algo en lo que yo pueda ayudarte? Puedo responder preguntas básicas sobre nuestros servicios o guiarte en el proceso de solicitud de una cuenta de prueba.

¡Gracias por tu paciencia! 🙏
    `;
    
    await client.sendMessage(message.from, responseMessage);
    
    // Guardar la respuesta en el historial de conversación
    await saveMessageToHistory(message.from, responseMessage, false);
    
    // Aquí se podría implementar la lógica para notificar a un asesor humano
    logger.info(`Solicitud de asesor humano de: ${message.from}`);
};

/**
 * Notifica al administrador sobre una nueva solicitud de servicio
 */
const notifyAdmin = async (user, credentials, serviceType = 'generic') => {
    // Esta función podría implementarse para enviar un correo electrónico
    // o un mensaje a un número de WhatsApp específico
    let serviceName = "servicio";
    
    switch (serviceType) {
        case 'erp':
            serviceName = "ERP";
            break;
        case 'crm':
            serviceName = "CRM";
            break;
        case 'bi':
            serviceName = "Business Intelligence";
            break;
    }
    
    logger.info(`Nueva solicitud de ${serviceName}: ${user.name} (${user.email})`);
};

/**
 * Maneja preguntas relacionadas con el sistema (cómo ingresar, cómo usar, etc.)
 */
const handleSystemQuestion = async (client, message) => {
    try {
        // Obtener el usuario para personalizar la respuesta
        const user = await findUserByPhone(message.from);
        
        // Verificar si el usuario tiene credenciales
        let hasCredentials = false;
        let credentials = null;
        
        if (user) {
            try {
                // Importar el servicio de credenciales
                const { findCredentialsByUserId } = require('../services/credentialService');
                credentials = await findCredentialsByUserId(user._id);
                hasCredentials = credentials && credentials.length > 0;
            } catch (error) {
                logger.error(`Error al buscar credenciales: ${error.message}`);
            }
        }
        
        let responseMessage = '';
        
        // Analizar el mensaje para determinar el tipo de pregunta sobre el sistema
        const lowerBody = message.body.toLowerCase();
        
        if (lowerBody.includes('ingreso') || lowerBody.includes('entro') || lowerBody.includes('accedo')) {
            if (hasCredentials && credentials.length > 0) {
                // Usar las credenciales más recientes
                const latestCredential = credentials[0];
                
                // Determinar la URL del servicio según el tipo
                let serviceUrl = process.env.DEFAULT_SERVICE_URL;
                let serviceName = "nuestro servicio";
                
                switch (latestCredential.serviceType) {
                    case 'erp':
                        serviceUrl = process.env.ERP_SERVICE_URL;
                        serviceName = "nuestro sistema ERP";
                        break;
                    case 'crm':
                        serviceUrl = process.env.CRM_SERVICE_URL;
                        serviceName = "nuestro sistema CRM";
                        break;
                    case 'bi':
                        serviceUrl = process.env.BI_SERVICE_URL;
                        serviceName = "nuestra plataforma de Business Intelligence";
                        break;
                }
                
                responseMessage = `
¡Claro! Para ingresar a ${serviceName}, sigue estos pasos:

1. Visita: ${serviceUrl}
2. Ingresa tu nombre de usuario: ${latestCredential.username}
3. Ingresa tu contraseña: ${latestCredential.password}

Si tienes problemas para acceder, puedes intentar:
- Verificar que estás ingresando correctamente tus credenciales
- Limpiar la caché de tu navegador
- Intentar con otro navegador

¿Necesitas ayuda con algo más? 😊
                `;
            } else {
                responseMessage = `
Para ingresar a nuestros servicios, primero necesitas tener una cuenta activa.

Si aún no tienes una cuenta, puedes crear una diciendo "Quiero probar el servicio" y te guiaré en el proceso de registro.

Si ya tienes una cuenta pero olvidaste tus credenciales, puedes solicitar ayuda escribiendo "Necesito hablar con un asesor" y te ayudaremos a recuperar tu acceso.

¿Te gustaría crear una cuenta ahora? 🤔
                `;
            }
        } else if (lowerBody.includes('usar') || lowerBody.includes('funciona')) {
            responseMessage = `
Nuestros sistemas son muy intuitivos y fáciles de usar. Una vez que ingreses, encontrarás:

1. Un panel de control con las funciones principales
2. Menús organizados por categorías
3. Tutoriales interactivos para guiarte

Además, ofrecemos:
- Documentación detallada en la sección de ayuda
- Videos tutoriales en cada sección
- Soporte técnico disponible por chat dentro de la plataforma

¿Hay alguna función específica sobre la que te gustaría saber más? 🧐
            `;
        } else {
            responseMessage = `
Entiendo que tienes preguntas sobre nuestro sistema. Para ayudarte mejor, ¿podrías ser más específico sobre qué aspecto te interesa conocer?

Puedo ayudarte con:
- Cómo ingresar al sistema
- Cómo utilizar funciones específicas
- Información sobre características y capacidades
- Solución de problemas técnicos

¡Estoy aquí para asistirte en lo que necesites! 👨‍💻
            `;
        }
        
        await client.sendMessage(message.from, responseMessage);
        
        // Guardar la respuesta en el historial de conversación
        await saveMessageToHistory(message.from, responseMessage, false);
    } catch (error) {
        logger.error(`Error al manejar pregunta sobre el sistema: ${error.message}`);
        const errorMessage = 'Lo siento, tuve un problema al procesar tu pregunta sobre el sistema. ¿Podrías intentarlo de nuevo en unos momentos?';
        await message.reply(errorMessage);
        
        // Guardar el mensaje de error en el historial de conversación
        await saveMessageToHistory(message.from, errorMessage, false);
    }
};

/**
 * Maneja preguntas personales (nombre del usuario, credenciales, etc.)
 */
const handlePersonalQuestion = async (client, message) => {
    try {
        // Obtener el usuario para personalizar la respuesta
        const user = await findUserByPhone(message.from);
        
        let responseMessage = '';
        const lowerBody = message.body.toLowerCase();
        
        if (lowerBody.includes('nombre') || lowerBody.includes('llamo') || lowerBody.includes('me llamo')) {
            if (user && user.name && user.name !== 'Usuario') {
                responseMessage = `
Según mis registros, tu nombre es ${user.name}. 😊

Si necesitas actualizar esta información, puedes decirme "Mi nombre es [tu nombre]" y lo actualizaré en nuestro sistema.
                `;
            } else {
                responseMessage = `
Aún no tengo registrado tu nombre en nuestro sistema.

Si quieres, puedes decirme cómo te llamas escribiendo "Mi nombre es [tu nombre]" y lo guardaré para futuras conversaciones.
                `;
            }
        } else if (lowerBody.includes('usuario') || lowerBody.includes('contraseña')) {
            // Verificar si el usuario tiene credenciales
            let hasCredentials = false;
            let credentials = null;
            
            if (user) {
                try {
                    // Importar el servicio de credenciales
                    const { findCredentialsByUserId } = require('../services/credentialService');
                    credentials = await findCredentialsByUserId(user._id);
                    hasCredentials = credentials && credentials.length > 0;
                } catch (error) {
                    logger.error(`Error al buscar credenciales: ${error.message}`);
                }
            }
            
            if (hasCredentials && credentials.length > 0) {
                // Usar las credenciales más recientes
                const latestCredential = credentials[0];
                
                responseMessage = `
Aquí están tus datos de acceso:

📱 Usuario: ${latestCredential.username}
🔐 Contraseña: ${latestCredential.password}

Por favor, guarda esta información en un lugar seguro. 🔒
                `;
            } else {
                responseMessage = `
No tengo registradas credenciales para ti en nuestro sistema.

Si deseas crear una cuenta, puedes decir "Quiero probar el servicio" y te guiaré en el proceso de registro.
                `;
            }
        } else {
            responseMessage = `
Entiendo que tienes preguntas sobre tu información personal. Para ayudarte mejor, ¿podrías ser más específico sobre qué datos necesitas?

Puedo ayudarte con:
- Tu nombre registrado
- Tus credenciales de acceso
- Tu historial de servicios
- Actualización de tus datos

¡Estoy aquí para asistirte! 😊
            `;
        }
        
        await client.sendMessage(message.from, responseMessage);
        
        // Guardar la respuesta en el historial de conversación
        await saveMessageToHistory(message.from, responseMessage, false);
    } catch (error) {
        logger.error(`Error al manejar pregunta personal: ${error.message}`);
        const errorMessage = 'Lo siento, tuve un problema al procesar tu pregunta personal. ¿Podrías intentarlo de nuevo en unos momentos?';
        await message.reply(errorMessage);
        
        // Guardar el mensaje de error en el historial de conversación
        await saveMessageToHistory(message.from, errorMessage, false);
    }
};

/**
 * Maneja preguntas fuera del contexto del servicio
 */
const handleOffTopicQuestion = async (client, message) => {
    try {
        const responseMessage = `
Parece que tu pregunta está fuera del ámbito de nuestros servicios. 🤔

Como asistente virtual, estoy especializado en ayudarte con:
- Información sobre nuestros servicios
- Registro de cuentas
- Acceso al sistema
- Soporte técnico básico

Para otras consultas, te recomendaría:
1. Contactar con un asesor humano escribiendo "Necesito hablar con una persona"
2. Visitar nuestra página web para información más detallada
3. Consultar nuestras redes sociales para noticias y actualizaciones

¿Hay algo relacionado con nuestros servicios en lo que pueda ayudarte? 😊
        `;
        
        await client.sendMessage(message.from, responseMessage);
        
        // Guardar la respuesta en el historial de conversación
        await saveMessageToHistory(message.from, responseMessage, false);
    } catch (error) {
        logger.error(`Error al manejar pregunta fuera de contexto: ${error.message}`);
        const errorMessage = 'Lo siento, tuve un problema al procesar tu pregunta. ¿Podrías intentarlo de nuevo en unos momentos?';
        await message.reply(errorMessage);
        
        // Guardar el mensaje de error en el historial de conversación
        await saveMessageToHistory(message.from, errorMessage, false);
    }
};

/**
 * Guarda un mensaje en el historial de conversación del usuario
 * @param {string} phone - Número de teléfono del usuario
 * @param {string} message - Contenido del mensaje
 * @param {boolean} isFromUser - Indica si el mensaje es del usuario o del bot
 */
/**
 * Guarda un mensaje en el historial de conversación del usuario
 * @param {string} phone - Número de teléfono del usuario
 * @param {string} message - Contenido del mensaje
 * @param {boolean} isFromUser - Indica si el mensaje es del usuario o del bot
 */
const saveMessageToHistory = async (phone, message, isFromUser) => {
    try {
        logger.info(`Intentando guardar mensaje en historial para ${phone} (isFromUser: ${isFromUser})`);
        
        if (!phone) {
            logger.error('No se puede guardar mensaje: número de teléfono no proporcionado');
            return;
        }
        
        if (!message) {
            logger.error(`No se puede guardar mensaje para ${phone}: mensaje vacío`);
            return;
        }
        
        // Buscar al usuario por su número de teléfono
        let user = await findUserByPhone(phone);
        
        // Si el usuario no existe, crearlo con información básica
        if (!user) {
            logger.info(`Creando usuario para guardar mensaje en historial: ${phone}`);
            try {
                user = await createOrUpdateUser({
                    phone: phone,
                    name: 'Usuario',  // Nombre temporal
                    email: `${phone.replace(/[^0-9]/g, '')}@temp.com`  // Email temporal limpio
                });
            } catch (createError) {
                logger.error(`Error al crear usuario para historial: ${createError.message}`);
                return;
            }
            
            if (!user) {
                logger.error(`No se pudo crear usuario para guardar mensaje en historial: ${phone}`);
                return;
            }
        }
        
        // Guardar mensaje en la colección de conversaciones
        try {
            await saveMessage(user._id, phone, message, isFromUser);
            logger.info(`Mensaje guardado exitosamente en colección conversations para ${phone}`);
        } catch (saveError) {
            logger.error(`Error al guardar mensaje en la colección conversations: ${saveError.message}`);
            logger.error(saveError.stack);
        }
        
        // Actualizar la fecha de última actividad del usuario
        user.lastActivity = new Date();
        await user.save();
        
    } catch (error) {
        logger.error(`Error general al guardar mensaje en historial: ${error.message}`);
        logger.error(error.stack);
    }
};

// Funciones para manejar el estado de la conversación
// Estas funciones deberían interactuar con una base de datos
// Por ahora, usaremos un objeto en memoria para simplificar

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
    handleSystemQuestion,
    handlePersonalQuestion,
    handleOffTopicQuestion
};