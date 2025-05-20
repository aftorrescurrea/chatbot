const Conversation = require('../models/Conversation');
const { logger } = require('../utils/logger');

/**
 * Guarda un mensaje en el historial de conversación
 * @param {string} userId - ID del usuario
 * @param {string} phone - Número de teléfono del usuario
 * @param {string} message - Contenido del mensaje
 * @param {boolean} isFromUser - Indica si el mensaje es del usuario o del bot
 * @returns {Object} - Mensaje guardado
 */
const saveMessage = async (userId, phone, message, isFromUser) => {
    try {
        const conversation = new Conversation({
            userId,
            phone,
            message,
            isFromUser,
            timestamp: new Date()
        });
        
        await conversation.save();
        logger.info(`Mensaje guardado en historial para usuario ${userId} (${phone})`);
        return conversation;
    } catch (error) {
        logger.error(`Error al guardar mensaje en historial: ${error.message}`);
        throw error;
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
        await Conversation.deleteMany({ userId });
        logger.info(`Historial de conversación eliminado para usuario ${userId}`);
        return true;
    } catch (error) {
        logger.error(`Error al eliminar historial de conversación: ${error.message}`);
        return false;
    }
};

module.exports = {
    saveMessage,
    getConversationHistory,
    getConversationHistoryByPhone,
    deleteConversationHistory
};