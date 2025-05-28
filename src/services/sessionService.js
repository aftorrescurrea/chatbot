const { logger } = require('../utils/logger');
const { clearConversationMemory } = require('./MemoryService');
const { deleteConversationHistory } = require('./conversationService');

// Map para almacenar las sesiones activas
const activeSessions = new Map();

// Map para almacenar los timers de timeout
const sessionTimers = new Map();

// Obtener el timeout desde las variables de entorno (en minutos)
const SESSION_TIMEOUT_MINUTES = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '3', 10);
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;

/**
 * Inicia o actualiza una sesión para un usuario
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} client - Cliente de WhatsApp
 * @returns {void}
 */
const startOrUpdateSession = (phoneNumber, client) => {
    try {
        // Si ya existe un timer para esta sesión, cancelarlo
        if (sessionTimers.has(phoneNumber)) {
            clearTimeout(sessionTimers.get(phoneNumber));
            logger.debug(`Timer de sesión cancelado para ${phoneNumber}`);
        }

        // Actualizar o crear la sesión
        const now = new Date();
        const session = activeSessions.get(phoneNumber) || {
            startTime: now,
            phoneNumber: phoneNumber
        };
        
        session.lastActivity = now;
        session.client = client;
        activeSessions.set(phoneNumber, session);

        // Crear nuevo timer de timeout
        const timeoutTimer = setTimeout(async () => {
            logger.info(`Timeout de sesión alcanzado para ${phoneNumber}`);
            await closeSessionDueToTimeout(phoneNumber);
        }, SESSION_TIMEOUT_MS);

        sessionTimers.set(phoneNumber, timeoutTimer);
        logger.debug(`Sesión actualizada para ${phoneNumber}, timeout en ${SESSION_TIMEOUT_MINUTES} minutos`);

    } catch (error) {
        logger.error(`Error al iniciar/actualizar sesión: ${error.message}`);
    }
};

/**
 * Cierra una sesión por timeout
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {Promise<void>}
 */
const closeSessionDueToTimeout = async (phoneNumber) => {
    try {
        const session = activeSessions.get(phoneNumber);
        if (!session) {
            logger.warn(`No se encontró sesión activa para ${phoneNumber}`);
            return;
        }

        // Enviar mensaje de cierre por timeout
        if (session.client) {
            const timeoutMessage = `⏰ *Sesión finalizada por inactividad*\n\n` +
                `Tu sesión ha sido cerrada automáticamente después de ${SESSION_TIMEOUT_MINUTES} minutos sin actividad.\n\n` +
                `Si necesitas continuar, por favor envía un nuevo mensaje para iniciar una nueva sesión.\n\n` +
                `¡Gracias por usar nuestro servicio! 👋`;
            
            await session.client.sendMessage(phoneNumber, timeoutMessage);
            logger.info(`Mensaje de timeout enviado a ${phoneNumber}`);
        }

        // Limpiar la sesión
        await cleanupSession(phoneNumber);
        logger.info(`Sesión cerrada por timeout para ${phoneNumber}`);

    } catch (error) {
        logger.error(`Error al cerrar sesión por timeout: ${error.message}`);
    }
};

/**
 * Cierra una sesión manualmente (cuando la conversación finaliza)
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @param {Object} client - Cliente de WhatsApp
 * @param {string} reason - Razón del cierre de sesión
 * @returns {Promise<void>}
 */
const closeSession = async (phoneNumber, client, reason = 'conversación finalizada') => {
    try {
        const session = activeSessions.get(phoneNumber);
        if (!session) {
            logger.warn(`No se encontró sesión activa para ${phoneNumber}`);
            return;
        }

        // Enviar mensaje de cierre de sesión
        const closeMessage = `✅ *Sesión finalizada*\n\n` +
            `Tu sesión ha sido cerrada correctamente.\n\n` +
            `Motivo: ${reason}\n\n` +
            `Si necesitas asistencia adicional, no dudes en escribirnos nuevamente.\n\n` +
            `¡Hasta pronto! 👋`;
        
        await client.sendMessage(phoneNumber, closeMessage);
        logger.info(`Mensaje de cierre de sesión enviado a ${phoneNumber}`);

        // Limpiar la sesión
        await cleanupSession(phoneNumber);
        logger.info(`Sesión cerrada manualmente para ${phoneNumber}, razón: ${reason}`);

    } catch (error) {
        logger.error(`Error al cerrar sesión manualmente: ${error.message}`);
    }
};

/**
 * Limpia todos los datos relacionados con una sesión
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {Promise<void>}
 */
const cleanupSession = async (phoneNumber) => {
    try {
        // Cancelar timer si existe
        if (sessionTimers.has(phoneNumber)) {
            clearTimeout(sessionTimers.get(phoneNumber));
            sessionTimers.delete(phoneNumber);
        }

        // Eliminar sesión activa
        activeSessions.delete(phoneNumber);

        // Limpiar memoria conversacional
        await clearConversationMemory(phoneNumber);

        // Limpiar estados de flujo (importado del messageController)
        const { clearActiveFlowState } = require('../controllers/messageController');
        clearActiveFlowState(phoneNumber);

        logger.info(`Datos de sesión limpiados para ${phoneNumber}`);

    } catch (error) {
        logger.error(`Error al limpiar sesión: ${error.message}`);
    }
};

/**
 * Verifica si una sesión está activa
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {boolean}
 */
const isSessionActive = (phoneNumber) => {
    return activeSessions.has(phoneNumber);
};

/**
 * Obtiene información de una sesión activa
 * @param {string} phoneNumber - Número de teléfono del usuario
 * @returns {Object|null}
 */
const getSessionInfo = (phoneNumber) => {
    const session = activeSessions.get(phoneNumber);
    if (!session) return null;

    const now = new Date();
    const timeActive = now - session.startTime;
    const timeSinceLastActivity = now - session.lastActivity;
    const timeRemaining = SESSION_TIMEOUT_MS - timeSinceLastActivity;

    return {
        phoneNumber: session.phoneNumber,
        startTime: session.startTime,
        lastActivity: session.lastActivity,
        timeActive: Math.floor(timeActive / 1000), // segundos
        timeSinceLastActivity: Math.floor(timeSinceLastActivity / 1000), // segundos
        timeRemaining: Math.max(0, Math.floor(timeRemaining / 1000)), // segundos
        isExpired: timeRemaining <= 0
    };
};

/**
 * Obtiene todas las sesiones activas
 * @returns {Array}
 */
const getAllActiveSessions = () => {
    const sessions = [];
    for (const [phoneNumber, session] of activeSessions.entries()) {
        sessions.push(getSessionInfo(phoneNumber));
    }
    return sessions.filter(s => s !== null);
};

/**
 * Limpia todas las sesiones expiradas
 * @returns {Promise<void>}
 */
const cleanupExpiredSessions = async () => {
    try {
        const now = new Date();
        const expiredSessions = [];

        for (const [phoneNumber, session] of activeSessions.entries()) {
            const timeSinceLastActivity = now - session.lastActivity;
            if (timeSinceLastActivity > SESSION_TIMEOUT_MS) {
                expiredSessions.push(phoneNumber);
            }
        }

        for (const phoneNumber of expiredSessions) {
            await closeSessionDueToTimeout(phoneNumber);
        }

        if (expiredSessions.length > 0) {
            logger.info(`${expiredSessions.length} sesiones expiradas limpiadas`);
        }

    } catch (error) {
        logger.error(`Error al limpiar sesiones expiradas: ${error.message}`);
    }
};

/**
 * Detiene todos los timers activos (para shutdown graceful)
 */
const stopAllTimers = () => {
    for (const timer of sessionTimers.values()) {
        clearTimeout(timer);
    }
    sessionTimers.clear();
    logger.info('Todos los timers de sesión detenidos');
};

// Limpiar sesiones expiradas cada minuto
setInterval(cleanupExpiredSessions, 60000);

// Manejar shutdown graceful
process.on('SIGINT', stopAllTimers);
process.on('SIGTERM', stopAllTimers);

module.exports = {
    startOrUpdateSession,
    closeSession,
    closeSessionDueToTimeout,
    isSessionActive,
    getSessionInfo,
    getAllActiveSessions,
    cleanupExpiredSessions,
    stopAllTimers,
    SESSION_TIMEOUT_MINUTES
};