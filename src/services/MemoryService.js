/**
 * Servicio de memoria conversacional (CORREGIDO)
 * Mantiene el contexto de las conversaciones entre cambios de tema
 */

const { logger } = require('../utils/logger');
const { getConversationHistoryByPhone } = require('./conversationService');
const { findUserByPhone } = require('./userService');

// Almacenamiento en memoria para contexto conversacional
// En producción, esto debería estar en Redis o similar
const conversationMemory = new Map();

// Configuración de la memoria conversacional
const MEMORY_CONFIG = {
    maxHistoryLength: 10,        // Máximo de mensajes a recordar
    maxTopicHistory: 5,          // Máximo de temas previos
    maxKnownEntities: 20,        // Máximo de entidades a recordar
    memoryExpirationHours: 24,   // Horas antes de limpiar memoria
    entityPersistenceThreshold: 2 // Veces que debe aparecer una entidad para persistir
};

/**
 * Obtiene la memoria conversacional completa de un usuario
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {Object} - Memoria conversacional del usuario
 */
const getConversationMemory = async (phoneNumber) => {
    try {
        let memory = conversationMemory.get(phoneNumber);
        
        if (!memory) {
            // Crear nueva memoria e inicializar con datos existentes
            memory = await initializeMemoryForUser(phoneNumber);
            conversationMemory.set(phoneNumber, memory);
        }
        
        // Verificar expiración
        const now = new Date();
        const expirationTime = new Date(memory.lastUpdate);
        expirationTime.setHours(expirationTime.getHours() + MEMORY_CONFIG.memoryExpirationHours);
        
        if (now > expirationTime) {
            logger.info(`Memoria conversacional para ${phoneNumber} ha expirado, reinicializando...`);
            memory = await initializeMemoryForUser(phoneNumber);
            conversationMemory.set(phoneNumber, memory);
        }
        
        return memory;
    } catch (error) {
        logger.error(`Error al obtener memoria conversacional: ${error.message}`);
        return createEmptyMemory(phoneNumber);
    }
};

/**
 * Actualiza la memoria conversacional con nueva información
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} updateData - Datos para actualizar
 * @returns {Object} - Memoria actualizada
 */
const updateConversationMemory = async (phoneNumber, updateData) => {
    try {
        let memory = await getConversationMemory(phoneNumber);
        
        // Actualizar información del usuario si está disponible
        if (updateData.userInfo) {
            memory.userProfile = {
                ...memory.userProfile,
                ...updateData.userInfo
            };
        }
        
        // Actualizar entidades conocidas
        if (updateData.entities && Object.keys(updateData.entities).length > 0) {
            memory = updateKnownEntities(memory, updateData.entities);
        }
        
        // Actualizar intenciones previas
        if (updateData.intents && updateData.intents.length > 0) {
            memory = updateIntentHistory(memory, updateData.intents);
        }
        
        // Actualizar historial de temas
        if (updateData.topic) {
            memory = updateTopicHistory(memory, updateData.topic);
        }
        
        // Actualizar historial de mensajes
        if (updateData.message) {
            memory = updateMessageHistory(memory, updateData.message);
        }
        
        // Actualizar timestamp
        memory.lastUpdate = new Date();
        
        // Guardar en memoria
        conversationMemory.set(phoneNumber, memory);
        
        logger.debug(`Memoria conversacional actualizada para ${phoneNumber}`);
        return memory;
    } catch (error) {
        logger.error(`Error al actualizar memoria conversacional: ${error.message}`);
        return await getConversationMemory(phoneNumber);
    }
};

/**
 * Inicializa la memoria para un usuario basándose en datos existentes
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {Object} - Memoria inicializada
 */
const initializeMemoryForUser = async (phoneNumber) => {
    try {
        // Obtener información del usuario si existe
        const user = await findUserByPhone(phoneNumber);
        
        // Obtener historial reciente de conversación SOLO si hay un usuario válido
        let recentHistory = [];
        if (user && user._id) {
            try {
                recentHistory = await getConversationHistoryByPhone(
                    phoneNumber, 
                    MEMORY_CONFIG.maxHistoryLength
                );
            } catch (historyError) {
                logger.warn(`No se pudo obtener historial para ${phoneNumber}: ${historyError.message}`);
                recentHistory = [];
            }
        }
        
        // Crear estructura de memoria
        const memory = {
            phoneNumber,
            userProfile: user ? {
                userId: user._id,
                name: user.name,
                email: user.email,
                company: user.company,
                position: user.position,
                registrationDate: user.registrationDate,
                isRegistered: true
            } : {
                isRegistered: false
            },
            knownEntities: extractEntitiesFromHistory(recentHistory, user),
            messageHistory: recentHistory.reverse().slice(-MEMORY_CONFIG.maxHistoryLength),
            intentHistory: [],
            topicHistory: [],
            conversationContext: {
                currentTopic: null,
                topicStartTime: null,
                contextStrength: 0
            },
            lastUpdate: new Date(),
            createdAt: new Date()
        };
        
        logger.info(`Memoria conversacional inicializada para ${phoneNumber}`);
        return memory;
    } catch (error) {
        logger.error(`Error al inicializar memoria: ${error.message}`);
        return createEmptyMemory(phoneNumber);
    }
};

/**
 * Crea una memoria vacía para un usuario
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {Object} - Memoria vacía
 */
const createEmptyMemory = (phoneNumber) => {
    return {
        phoneNumber,
        userProfile: { isRegistered: false },
        knownEntities: {},
        messageHistory: [],
        intentHistory: [],
        topicHistory: [],
        conversationContext: {
            currentTopic: null,
            topicStartTime: null,
            contextStrength: 0
        },
        lastUpdate: new Date(),
        createdAt: new Date()
    };
};

/**
 * Actualiza las entidades conocidas del usuario
 * @param {Object} memory - Memoria conversacional actual
 * @param {Object} newEntities - Nuevas entidades detectadas
 * @returns {Object} - Memoria actualizada
 */
const updateKnownEntities = (memory, newEntities) => {
    for (const [entityType, entityValue] of Object.entries(newEntities)) {
        if (!entityValue || entityValue.trim() === '') continue;
        
        const entityKey = `${entityType}`;
        
        if (!memory.knownEntities[entityKey]) {
            memory.knownEntities[entityKey] = {
                value: entityValue,
                confidence: 1,
                firstSeen: new Date(),
                lastSeen: new Date(),
                occurrences: 1
            };
        } else {
            // Actualizar entidad existente
            const existingEntity = memory.knownEntities[entityKey];
            
            // Si es el mismo valor, incrementar confianza
            if (existingEntity.value === entityValue) {
                existingEntity.confidence = Math.min(existingEntity.confidence + 0.2, 1.0);
                existingEntity.occurrences += 1;
                existingEntity.lastSeen = new Date();
            } else {
                // Si es un valor diferente, evaluar si reemplazar
                if (existingEntity.occurrences < MEMORY_CONFIG.entityPersistenceThreshold) {
                    memory.knownEntities[entityKey] = {
                        value: entityValue,
                        confidence: 0.8,
                        firstSeen: new Date(),
                        lastSeen: new Date(),
                        occurrences: 1
                    };
                }
                // Si la entidad existente tiene muchas ocurrencias, mantenerla pero reducir confianza
                else {
                    existingEntity.confidence = Math.max(existingEntity.confidence - 0.1, 0.3);
                }
            }
        }
    }
    
    // Limpiar entidades con baja confianza y antiguas
    const now = new Date();
    for (const [key, entity] of Object.entries(memory.knownEntities)) {
        const daysSinceLastSeen = (now - new Date(entity.lastSeen)) / (1000 * 60 * 60 * 24);
        
        if (entity.confidence < 0.3 && daysSinceLastSeen > 7) {
            delete memory.knownEntities[key];
        }
    }
    
    return memory;
};

/**
 * Actualiza el historial de intenciones
 * @param {Object} memory - Memoria conversacional actual
 * @param {Array} newIntents - Nuevas intenciones detectadas
 * @returns {Object} - Memoria actualizada
 */
const updateIntentHistory = (memory, newIntents) => {
    const timestamp = new Date();
    
    for (const intent of newIntents) {
        memory.intentHistory.unshift({
            intent,
            timestamp,
            strength: 1.0
        });
    }
    
    // Mantener solo las intenciones más recientes
    memory.intentHistory = memory.intentHistory.slice(0, MEMORY_CONFIG.maxHistoryLength);
    
    return memory;
};

/**
 * Actualiza el historial de temas
 * @param {Object} memory - Memoria conversacional actual
 * @param {string} newTopic - Nuevo tema detectado
 * @returns {Object} - Memoria actualizada
 */
const updateTopicHistory = (memory, newTopic) => {
    const timestamp = new Date();
    
    // Si es un tema diferente al actual, guardarlo
    if (memory.conversationContext.currentTopic !== newTopic) {
        if (memory.conversationContext.currentTopic) {
            memory.topicHistory.unshift({
                topic: memory.conversationContext.currentTopic,
                startTime: memory.conversationContext.topicStartTime,
                endTime: timestamp,
                duration: timestamp - new Date(memory.conversationContext.topicStartTime)
            });
        }
        
        memory.conversationContext.currentTopic = newTopic;
        memory.conversationContext.topicStartTime = timestamp;
        memory.conversationContext.contextStrength = 1.0;
    } else {
        // Fortalecer el contexto del tema actual
        memory.conversationContext.contextStrength = Math.min(
            memory.conversationContext.contextStrength + 0.1, 
            1.0
        );
    }
    
    // Mantener solo los temas más recientes
    memory.topicHistory = memory.topicHistory.slice(0, MEMORY_CONFIG.maxTopicHistory);
    
    return memory;
};

/**
 * Actualiza el historial de mensajes
 * @param {Object} memory - Memoria conversacional actual
 * @param {Object} messageData - Datos del mensaje
 * @returns {Object} - Memoria actualizada
 */
const updateMessageHistory = (memory, messageData) => {
    memory.messageHistory.push({
        message: messageData.content,
        isFromUser: messageData.isFromUser,
        timestamp: messageData.timestamp || new Date(),
        intents: messageData.intents || [],
        entities: messageData.entities || {}
    });
    
    // Mantener solo los mensajes más recientes
    memory.messageHistory = memory.messageHistory.slice(-MEMORY_CONFIG.maxHistoryLength);
    
    return memory;
};

/**
 * Extrae entidades del historial de conversación
 * @param {Array} history - Historial de conversación
 * @param {Object} user - Información del usuario
 * @returns {Object} - Entidades extraídas
 */
const extractEntitiesFromHistory = (history, user) => {
    const entities = {};
    
    // Agregar entidades del perfil de usuario si existe
    if (user) {
        if (user.name && user.name !== 'Usuario') {
            entities.nombre = {
                value: user.name,
                confidence: 1.0,
                firstSeen: user.registrationDate,
                lastSeen: user.lastActivity,
                occurrences: 1
            };
        }
        
        if (user.email && !user.email.includes('@temp.com')) {
            entities.email = {
                value: user.email,
                confidence: 1.0,
                firstSeen: user.registrationDate,
                lastSeen: user.lastActivity,
                occurrences: 1
            };
        }
        
        if (user.company) {
            entities.empresa = {
                value: user.company,
                confidence: 1.0,
                firstSeen: user.registrationDate,
                lastSeen: user.lastActivity,
                occurrences: 1
            };
        }
        
        if (user.position) {
            entities.cargo = {
                value: user.position,
                confidence: 1.0,
                firstSeen: user.registrationDate,
                lastSeen: user.lastActivity,
                occurrences: 1
            };
        }
    }
    
    return entities;
};

/**
 * Obtiene el contexto conversacional formateado para prompts
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {Object} - Contexto formateado
 */
const getContextForPrompt = async (phoneNumber) => {
    try {
        const memory = await getConversationMemory(phoneNumber);
        
        return {
            userProfile: memory.userProfile,
            knownEntities: Object.fromEntries(
                Object.entries(memory.knownEntities).map(([key, entity]) => [
                    key, 
                    entity.value
                ])
            ),
            recentMessages: memory.messageHistory.slice(-5),
            recentIntents: memory.intentHistory.slice(0, 3).map(item => item.intent),
            currentTopic: memory.conversationContext.currentTopic,
            topicHistory: memory.topicHistory.slice(0, 3).map(item => item.topic),
            contextStrength: memory.conversationContext.contextStrength
        };
    } catch (error) {
        logger.error(`Error al obtener contexto para prompt: ${error.message}`);
        return {
            userProfile: { isRegistered: false },
            knownEntities: {},
            recentMessages: [],
            recentIntents: [],
            currentTopic: null,
            topicHistory: [],
            contextStrength: 0
        };
    }
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

/**
 * Limpia la memoria conversacional de un usuario
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {boolean} - Éxito de la operación
 */
const clearConversationMemory = (phoneNumber) => {
    try {
        conversationMemory.delete(phoneNumber);
        logger.info(`Memoria conversacional limpiada para ${phoneNumber}`);
        return true;
    } catch (error) {
        logger.error(`Error al limpiar memoria conversacional: ${error.message}`);
        return false;
    }
};

/**
 * Obtiene estadísticas de la memoria conversacional
 * @returns {Object} - Estadísticas de memoria
 */
const getMemoryStats = () => {
    return {
        totalUsers: conversationMemory.size,
        memoryConfig: MEMORY_CONFIG,
        timestamp: new Date()
    };
};

/**
 * Limpia automáticamente memorias expiradas
 */
const cleanupExpiredMemories = () => {
    const now = new Date();
    const expiredUsers = [];
    
    for (const [phoneNumber, memory] of conversationMemory.entries()) {
        const expirationTime = new Date(memory.lastUpdate);
        expirationTime.setHours(expirationTime.getHours() + MEMORY_CONFIG.memoryExpirationHours);
        
        if (now > expirationTime) {
            expiredUsers.push(phoneNumber);
        }
    }
    
    for (const phoneNumber of expiredUsers) {
        clearConversationMemory(phoneNumber);
    }
    
    if (expiredUsers.length > 0) {
        logger.info(`Limpieza automática de memoria: ${expiredUsers.length} usuarios expirados eliminados`);
    }
};

// Ejecutar limpieza cada 2 horas
setInterval(cleanupExpiredMemories, 2 * 60 * 60 * 1000);

module.exports = {
    getConversationMemory,
    updateConversationMemory,
    getContextForPrompt,
    determineTopicFromIntents,
    clearConversationMemory,
    getMemoryStats,
    cleanupExpiredMemories,
    MEMORY_CONFIG
};