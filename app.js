require('dotenv').config();
const { logger } = require('./src/utils/logger');
const { connectDB } = require('./src/config/database');
const { startServer } = require('./src/server');

// Importar el bot de WhatsApp
const whatsappBot = require('./index');

/**
 * Función principal para iniciar toda la aplicación
 */
async function startApp() {
    try {
        logger.info('🚀 Iniciando aplicación completa...');
        
        // Conectar a MongoDB
        logger.info('📊 Conectando a MongoDB...');
        await connectDB();
        
        // Iniciar servidor API
        const apiPort = process.env.API_PORT || 3000;
        logger.info(`🌐 Iniciando servidor API en puerto ${apiPort}...`);
        await startServer(apiPort);
        
        // El bot de WhatsApp se iniciará automáticamente desde index.js
        logger.info('📱 Bot de WhatsApp iniciándose...');
        
        logger.info('✅ Aplicación completa iniciada exitosamente');
        
    } catch (error) {
        logger.error(`❌ Error al iniciar la aplicación: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Manejar señales de cierre
process.on('SIGINT', async () => {
    logger.info('📴 Recibida señal SIGINT, cerrando aplicación...');
    await whatsappBot.gracefulShutdown('SIGINT');
});

process.on('SIGTERM', async () => {
    logger.info('📴 Recibida señal SIGTERM, cerrando aplicación...');
    await whatsappBot.gracefulShutdown('SIGTERM');
});

// Iniciar la aplicación
startApp();