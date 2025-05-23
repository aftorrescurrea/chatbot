require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const { connectDB } = require('./src/config/database');
const { handleMessage, getControllerStats, cleanupExpiredFlows } = require('./src/controllers/enhancedMessageController');
const { getMemoryStats } = require('./src/services/conversationMemoryService');
const { testConnection } = require('./src/services/enhancedPromptService');
const { logger } = require('./src/utils/logger');

// Variables globales para el cliente de WhatsApp
let whatsappClient = null;
let isInitializing = false;

/**
 * Función principal asíncrona para inicializar la aplicación
 */
async function initializeApp() {
    try {
        logger.info('🚀 Iniciando aplicación de chatbot contextual...');
        
        // Iniciar la conexión a la base de datos
        logger.info('📊 Iniciando conexión a MongoDB...');
        await connectDB();
        
        // Verificar que la conexión esté activa
        if (mongoose.connection.readyState !== 1) {
            logger.warn(`⚠️ Estado de conexión MongoDB: ${mongoose.connection.readyState}`);
            logger.warn('La conexión a MongoDB no está completamente establecida, pero continuaremos...');
        } else {
            logger.info('✅ MongoDB conectado correctamente');
        }
        
        // Probar conexión con Ollama
        logger.info('🤖 Probando conexión con Ollama...');
        const ollamaConnected = await testConnection();
        
        if (!ollamaConnected) {
            logger.warn('⚠️ No se pudo conectar a Ollama. Algunas funciones pueden no estar disponibles.');
        } else {
            logger.info('✅ Ollama conectado correctamente');
        }
        
        // Configurar el cliente de WhatsApp
        logger.info('📱 Configurando cliente de WhatsApp...');
        whatsappClient = new Client({
            authStrategy: new LocalAuth({
                dataPath: process.env.WHATSAPP_SESSION_DATA_PATH || './whatsapp-session'
            }),
            puppeteer: {
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
            }
        });

        // Configurar eventos del cliente de WhatsApp
        setupWhatsAppEvents();
        
        // Inicializar el cliente
        logger.info('🔄 Inicializando cliente de WhatsApp...');
        isInitializing = true;
        await whatsappClient.initialize();
        
        // Configurar limpieza periódica
        setupPeriodicCleanup();
        
        // Configurar monitoreo de sistema
        setupSystemMonitoring();
        
        logger.info('🎉 Aplicación inicializada correctamente');
        
    } catch (error) {
        logger.error(`❌ Error al inicializar la aplicación: ${error.message}`);
        logger.error(error.stack);
        
        // Intentar reinicializar después de un tiempo
        setTimeout(() => {
            logger.info('🔄 Intentando reinicializar aplicación...');
            initializeApp();
        }, 30000); // 30 segundos
    }
}

/**
 * Configura los eventos del cliente de WhatsApp
 */
function setupWhatsAppEvents() {
    // Evento cuando se genera el código QR para autenticación
    whatsappClient.on('qr', (qr) => {
        logger.info('📱 Código QR generado. Escanea con WhatsApp:');
        qrcode.generate(qr, { small: true });
        console.log('📱 También puedes escanear el código QR desde tu aplicación WhatsApp Web');
    });
    
    // Evento cuando el cliente está listo
    whatsappClient.on('ready', () => {
        isInitializing = false;
        logger.info('✅ Cliente de WhatsApp inicializado y listo para recibir mensajes');
        
        // Verificar nuevamente la conexión a MongoDB
        if (mongoose.connection.readyState !== 1) {
            logger.warn(`⚠️ Estado de conexión MongoDB cuando el cliente está listo: ${mongoose.connection.readyState}`);
            // Intentar reconectar si es necesario
            if (mongoose.connection.readyState === 0) {
                logger.info('🔄 Intentando reconectar a MongoDB...');
                connectDB();
            }
        }
        
        // Mostrar estadísticas iniciales
        logSystemStats();
    });
    
    // Evento cuando se recibe un mensaje
    whatsappClient.on('message', async (message) => {
        try {
            // Ignorar mensajes de grupos y mensajes propios
            if (message.isGroupMsg || message.fromMe) return;
            
            // Verificar que el cliente esté listo
            if (isInitializing) {
                logger.warn('⚠️ Cliente aún inicializando, ignorando mensaje');
                return;
            }
            
            // Verificar conexión a MongoDB antes de procesar el mensaje
            if (mongoose.connection.readyState !== 1) {
                logger.warn(`⚠️ Conexión MongoDB no disponible (estado: ${mongoose.connection.readyState}). Intentando reconectar...`);
                await connectDB();
                
                if (mongoose.connection.readyState !== 1) {
                    logger.error('❌ No se pudo establecer conexión a MongoDB. No se procesará el mensaje.');
                    await message.reply('Lo siento, hay un problema de conexión con nuestros servicios. Por favor, intenta más tarde. 🔧');
                    return;
                }
            }
            
            // Procesar el mensaje con el controlador mejorado y corregido
            await handleMessage(whatsappClient, message);
            
        } catch (error) {
            logger.error(`❌ Error al procesar mensaje: ${error.message}`);
            logger.error(error.stack);
            
            try {
                const errorMessage = determineErrorMessage(error);
                await message.reply(errorMessage);
            } catch (replyError) {
                logger.error(`❌ No se pudo enviar mensaje de error: ${replyError.message}`);
            }
        }
    });
    
    // Evento cuando hay un error de autenticación
    whatsappClient.on('auth_failure', (error) => {
        logger.error(`❌ Error de autenticación de WhatsApp: ${error}`);
        isInitializing = false;
        
        // Intentar reinicializar después de un tiempo
        setTimeout(() => {
            logger.info('🔄 Intentando reinicializar cliente por error de autenticación...');
            initializeApp();
        }, 60000); // 1 minuto
    });
    
    // Evento cuando se desconecta
    whatsappClient.on('disconnected', (reason) => {
        logger.warn(`⚠️ Cliente de WhatsApp desconectado: ${reason}`);
        isInitializing = false;
        
        // Reiniciar el cliente después de un tiempo
        setTimeout(() => {
            logger.info('🔄 Intentando reinicializar el cliente de WhatsApp...');
            initializeApp();
        }, 10000); // 10 segundos
    });
    
    // Evento de cambio de estado
    whatsappClient.on('change_state', (state) => {
        logger.debug(`🔄 Estado del cliente WhatsApp: ${state}`);
    });
    
    // Evento de mensaje de estado
    whatsappClient.on('message_create', (message) => {
        // Solo logear nuestros mensajes enviados
        if (message.fromMe) {
            logger.debug(`📤 Mensaje enviado a ${message.to}: ${message.body.substring(0, 50)}...`);
        }
    });
}

/**
 * Configura la limpieza periódica del sistema
 */
function setupPeriodicCleanup() {
    // Limpieza cada 30 minutos
    setInterval(() => {
        try {
            logger.info('🧹 Ejecutando limpieza periódica del sistema...');
            
            // Limpiar flujos expirados
            cleanupExpiredFlows();
            
            // Limpiar memorias conversacionales expiradas
            const { cleanupExpiredMemories } = require('./src/services/conversationMemoryService');
            cleanupExpiredMemories();
            
            logger.info('✅ Limpieza periódica completada');
        } catch (error) {
            logger.error(`❌ Error en limpieza periódica: ${error.message}`);
        }
    }, 30 * 60 * 1000); // 30 minutos
}

/**
 * Configura el monitoreo del sistema
 */
function setupSystemMonitoring() {
    // Estadísticas cada hora
    setInterval(() => {
        try {
            logSystemStats();
        } catch (error) {
            logger.error(`❌ Error al obtener estadísticas del sistema: ${error.message}`);
        }
    }, 60 * 60 * 1000); // 1 hora
    
    // Verificación de salud cada 5 minutos
    setInterval(async () => {
        try {
            await performHealthCheck();
        } catch (error) {
            logger.error(`❌ Error en verificación de salud: ${error.message}`);
        }
    }, 5 * 60 * 1000); // 5 minutos
}

/**
 * Registra estadísticas del sistema
 */
function logSystemStats() {
    try {
        const controllerStats = getControllerStats();
        const memoryStats = getMemoryStats();
        const processMemory = process.memoryUsage();
        
        logger.info('📊 === ESTADÍSTICAS DEL SISTEMA ===');
        logger.info(`💬 Flujos activos: ${controllerStats.activeFlows}`);
        logger.info(`🧠 Usuarios en memoria: ${memoryStats.totalUsers}`);
        logger.info(`🔄 Memoria de proceso: ${Math.round(processMemory.rss / 1024 / 1024)}MB`);
        logger.info(`📱 Estado WhatsApp: ${whatsappClient ? (whatsappClient.info ? 'Conectado' : 'Inicializando') : 'Desconectado'}`);
        logger.info(`🗄️ Estado MongoDB: ${mongoose.connection.readyState === 1 ? 'Conectado' : 'Desconectado'}`);
        
        if (controllerStats.flowTypes && Object.keys(controllerStats.flowTypes).length > 0) {
            logger.info('📈 Tipos de flujo activos:');
            Object.entries(controllerStats.flowTypes).forEach(([type, count]) => {
                logger.info(`   - ${type}: ${count}`);
            });
        }
        
        logger.info('=======================================');
    } catch (error) {
        logger.error(`❌ Error al registrar estadísticas: ${error.message}`);
    }
}

/**
 * Realiza una verificación de salud del sistema
 */
async function performHealthCheck() {
    const healthStatus = {
        whatsapp: false,
        mongodb: false,
        ollama: false,
        timestamp: new Date()
    };
    
    try {
        // Verificar WhatsApp
        healthStatus.whatsapp = whatsappClient && whatsappClient.info !== null;
        
        // Verificar MongoDB
        healthStatus.mongodb = mongoose.connection.readyState === 1;
        
        // Verificar Ollama (no hacer ping muy frecuente para no sobrecargar)
        if (Math.random() < 0.2) { // Solo 20% de las veces
            healthStatus.ollama = await testConnection();
        } else {
            healthStatus.ollama = true; // Asumir que está bien si no probamos
        }
        
        // Log si hay problemas
        const issues = Object.entries(healthStatus)
            .filter(([key, value]) => key !== 'timestamp' && !value)
            .map(([key]) => key);
            
        if (issues.length > 0) {
            logger.warn(`⚠️ Problemas de salud detectados: ${issues.join(', ')}`);
        } else {
            logger.debug('✅ Verificación de salud: todos los servicios operativos');
        }
        
    } catch (error) {
        logger.error(`❌ Error en verificación de salud: ${error.message}`);
    }
    
    return healthStatus;
}

/**
 * Determina el mensaje de error apropiado según el tipo de error
 * @param {Error} error - Error ocurrido
 * @returns {string} - Mensaje de error para el usuario
 */
function determineErrorMessage(error) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('timeout') || errorMessage.includes('tiempo')) {
        return 'Lo siento, la respuesta está tardando más de lo esperado. Por favor, intenta de nuevo. ⏱️';
    } else if (errorMessage.includes('connection') || errorMessage.includes('conexión')) {
        return 'Hay un problema de conexión temporal. Por favor, intenta nuevamente en unos momentos. 🔌';
    } else if (errorMessage.includes('model') || errorMessage.includes('ollama')) {
        return 'Nuestro sistema de inteligencia está momentáneamente ocupado. Por favor, intenta de nuevo. 🤖';
    } else if (errorMessage.includes('database') || errorMessage.includes('mongodb')) {
        return 'Hay un problema temporal con nuestros servicios. Por favor, intenta más tarde. 💾';
    } else if (errorMessage.includes('validation') || errorMessage.includes('cast to objectid')) {
        return 'Lo siento, hay un problema técnico temporal. Por favor, intenta de nuevo o escribe "ayuda" para contactar soporte. 🔧';
    } else {
        return 'Lo siento, ocurrió un error inesperado. Por favor, intenta nuevamente o contacta a nuestro equipo de soporte. 🛠️';
    }
}

/**
 * Maneja el cierre graceful de la aplicación
 */
async function gracefulShutdown(signal) {
    logger.info(`📴 Señal ${signal} recibida. Iniciando cierre graceful...`);
    
    try {
        // Cerrar cliente de WhatsApp
        if (whatsappClient) {
            logger.info('📱 Cerrando cliente de WhatsApp...');
            await whatsappClient.destroy();
            whatsappClient = null;
        }
        
        // Cerrar conexión a MongoDB
        if (mongoose.connection.readyState === 1) {
            logger.info('🗄️ Cerrando conexión a MongoDB...');
            await mongoose.connection.close();
            logger.info('✅ Conexión a MongoDB cerrada correctamente');
        }
        
        logger.info('✅ Cierre graceful completado');
        process.exit(0);
    } catch (error) {
        logger.error(`❌ Error durante cierre graceful: ${error.message}`);
        process.exit(1);
    }
}

// Manejar señales de cierre
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    logger.error(`❌ Error no capturado: ${error.message}`);
    logger.error(error.stack);
    
    // Intentar cerrar gracefully
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Promesa rechazada no manejada:');
    logger.error(reason);
    logger.error('Promise:', promise);
    
    // No cerrar la aplicación por rechazos no manejados, solo logear
    // gracefulShutdown('unhandledRejection');
});

// Iniciar la aplicación
initializeApp();

// Exportar funciones útiles para testing o debugging
module.exports = {
    initializeApp,
    gracefulShutdown,
    performHealthCheck,
    logSystemStats,
    whatsappClient: () => whatsappClient
};