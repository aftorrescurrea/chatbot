const Conversation = require('../models/Conversation');
const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

/**
 * Guarda un mensaje en el historial de conversación
 * @param {string} userId - ID del usuario (puede ser null para usuarios temporales)
 * @param {string} phone - Número de teléfono del usuario
 * @param {string} message - Contenido del mensaje
 * @param {boolean} isFromUser - Indica si el mensaje es del usuario o del bot
 * @returns {Object} - Mensaje guardado
 */
const saveMessage = async (userId, phone, message, isFromUser) => {
    try {
        // Crear un ObjectId temporal si no hay userId válido
        let validUserId = userId;
        
        // Verificar si userId es válido
        if (!userId || userId === 'temp' || !mongoose.Types.ObjectId.isValid(userId)) {
            // Crear un ObjectId temporal basado en el número de teléfono
            validUserId = createTempUserId(phone);
            logger.debug(`Usando userId temporal para ${phone}: ${validUserId}`);
        }
        
        const conversation = new Conversation({
            userId: validUserId,
            phone,
            message,
            isFromUser,
            timestamp: new Date()
        });
        
        await conversation.save();
        logger.debug(`Mensaje guardado en historial para ${phone} (userId: ${validUserId})`);
        return conversation;
    } catch (error) {
        logger.error(`Error al guardar mensaje en historial: ${error.message}`);
        
        // Intentar guardar sin userId como fallback
        try {
            logger.warn(`Intentando guardar mensaje sin userId para ${phone}`);
            // Crear un ObjectId temporal consistente
            const tempUserId = createTempUserId(phone);
            
            const fallbackConversation = new Conversation({
                userId: tempUserId,
                phone,
                message,
                isFromUser,
                timestamp: new Date()
            });
            
            await fallbackConversation.save();
            logger.info(`Mensaje guardado con userId temporal para ${phone}`);
            return fallbackConversation;
        } catch (fallbackError) {
            logger.error(`Error en fallback al guardar mensaje: ${fallbackError.message}`);
            // No lanzar error para no interrumpir el flujo principal
            return null;
        }
    }
};

/**
 * Crea un ObjectId temporal consistente basado en el número de teléfono
 * @param {string} phone - Número de teléfono
 * @returns {mongoose.Types.ObjectId} - ObjectId temporal
 */
const createTempUserId = (phone) => {
    try {
        // Crear un hash consistente del número de teléfono
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(phone).digest('hex');
        
        // Tomar los primeros 24 caracteres hexadecimales para crear un ObjectId válido
        const objectIdHex = hash.substring(0, 24);
        return new mongoose.Types.ObjectId(objectIdHex);
    } catch (error) {
        logger.error(`Error creando userId temporal: ${error.message}`);
        // Fallback: crear un ObjectId aleatorio
        return new mongoose.Types.ObjectId();
    }
};

/**
 * Obtiene el historial de conversación de un usuario
 * @param {string} userId - ID del usuario
 * @param {number} limit - Límite de mensajes a obtener
 * @returns {Array} - Historial de conversación
 */
const getConversationHistory = async (userId, limit = 100) => {
    try {
        // Verificar si userId es válido
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            logger.warn(`userId inválido para obtener historial: ${userId}`);
            return [];
        }
        
        return await Conversation.find({ userId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
    } catch (error) {
        logger.error(`Error al obtener historial de conversación: ${error.message}`);
        return [];
    }
};

/**
 * Obtiene el historial de conversación por número de teléfono
 * @param {string} phone - Número de teléfono del usuario
 * @param {number} limit - Límite de mensajes a obtener
 * @returns {Array} - Historial de conversación
 */
const getConversationHistoryByPhone = async (phone, limit = 100) => {
    try {
        if (!phone) {
            logger.warn('Número de teléfono no proporcionado para obtener historial');
            return [];
        }
        
        return await Conversation.find({ phone })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
    } catch (error) {
        logger.error(`Error al obtener historial de conversación por teléfono: ${error.message}`);
        return [];
    }
};

/**
 * Elimina el historial de conversación de un usuario
 * @param {string} userId - ID del usuario
 * @returns {boolean} - Indica si se eliminó correctamente
 */
const deleteConversationHistory = async (userId) => {
    try {
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            logger.warn(`userId inválido para eliminar historial: ${userId}`);
            return false;
        }
        
        await Conversation.deleteMany({ userId });
        logger.info(`Historial de conversación eliminado para usuario ${userId}`);
        return true;
    } catch (error) {
        logger.error(`Error al eliminar historial de conversación: ${error.message}`);
        return false;
    }
};

/**
 * Elimina el historial de conversación por número de teléfono
 * @param {string} phone - Número de teléfono del usuario
 * @returns {boolean} - Indica si se eliminó correctamente
 */
const deleteConversationHistoryByPhone = async (phone) => {
    try {
        if (!phone) {
            logger.warn('Número de teléfono no proporcionado para eliminar historial');
            return false;
        }
        
        const result = await Conversation.deleteMany({ phone });
        logger.info(`Historial de conversación eliminado para teléfono ${phone}. Documentos eliminados: ${result.deletedCount}`);
        return true;
    } catch (error) {
        logger.error(`Error al eliminar historial de conversación por teléfono: ${error.message}`);
        return false;
    }
};

/**
 * Obtiene estadísticas del historial de conversaciones
 * @returns {Object} - Estadísticas
 */
const getConversationStats = async () => {
    try {
        const totalMessages = await Conversation.countDocuments();
        const uniquePhones = await Conversation.distinct('phone');
        const recentMessages = await Conversation.countDocuments({
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Últimas 24 horas
        });
        
        return {
            totalMessages,
            uniqueUsers: uniquePhones.length,
            recentMessages,
            timestamp: new Date()
        };
    } catch (error) {
        logger.error(`Error al obtener estadísticas de conversación: ${error.message}`);
        return {
            totalMessages: 0,
            uniqueUsers: 0,
            recentMessages: 0,
            timestamp: new Date()
        };
    }
};

/**
 * Limpia mensajes antiguos del historial
 * @param {number} daysOld - Días de antigüedad para considerar mensajes como antiguos
 * @returns {number} - Número de mensajes eliminados
 */
const cleanupOldMessages = async (daysOld = 30) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        const result = await Conversation.deleteMany({
            timestamp: { $lt: cutoffDate }
        });
        
        logger.info(`Limpieza de mensajes antiguos completada. Eliminados: ${result.deletedCount} mensajes`);
        return result.deletedCount;
    } catch (error) {
        logger.error(`Error al limpiar mensajes antiguos: ${error.message}`);
        return 0;
    }
};

module.exports = {
    saveMessage,
    getConversationHistory,
    getConversationHistoryByPhone,
    deleteConversationHistory,
    deleteConversationHistoryByPhone,
    getConversationStats,
    cleanupOldMessages,
    createTempUserId
};