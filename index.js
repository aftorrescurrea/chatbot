require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const { connectDB } = require('./src/config/database');
const { handleMessage } = require('./src/controllers/messageController');
const { logger } = require('./src/utils/logger');

// Función principal asíncrona para inicializar la aplicación
async function initializeApp() {
    try {
        // Iniciar la conexión a la base de datos
        logger.info('Iniciando conexión a MongoDB...');
        await connectDB();
        
        // Verificar que la conexión esté activa
        if (mongoose.connection.readyState !== 1) {
            logger.warn(`Estado de conexión MongoDB: ${mongoose.connection.readyState}`);
            logger.warn('La conexión a MongoDB no está completamente establecida, pero continuaremos...');
        }
        
        // Configurar el cliente de WhatsApp
        logger.info('Configurando cliente de WhatsApp...');
        const client = new Client({
            authStrategy: new LocalAuth({
                dataPath: process.env.WHATSAPP_SESSION_DATA_PATH || './whatsapp-session'
            }),
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        // Evento cuando se genera el código QR para autenticación
        client.on('qr', (qr) => {
            logger.info('Código QR generado. Escanea con WhatsApp:');
            qrcode.generate(qr, { small: true });
        });
        
        // Evento cuando el cliente está listo
        client.on('ready', () => {
            logger.info('Cliente de WhatsApp inicializado y listo');
            // Verificar nuevamente la conexión a MongoDB
            if (mongoose.connection.readyState !== 1) {
                logger.warn(`Estado de conexión MongoDB cuando el cliente está listo: ${mongoose.connection.readyState}`);
                // Intentar reconectar si es necesario
                if (mongoose.connection.readyState === 0) {
                    logger.info('Intentando reconectar a MongoDB...');
                    connectDB();
                }
            }
        });
        
        // Evento cuando se recibe un mensaje
        client.on('message', async (message) => {
            try {
                // Ignorar mensajes de grupos y mensajes propios
                if (message.isGroupMsg || message.fromMe) return;
                
                // Verificar conexión a MongoDB antes de procesar el mensaje
                if (mongoose.connection.readyState !== 1) {
                    logger.warn(`Conexión MongoDB no disponible (estado: ${mongoose.connection.readyState}). Intentando reconectar...`);
                    await connectDB();
                    
                    if (mongoose.connection.readyState !== 1) {
                        logger.error('No se pudo establecer conexión a MongoDB. No se procesará el mensaje.');
                        message.reply('Lo siento, hay un problema de conexión. Por favor, intenta más tarde.');
                        return;
                    }
                }
                
                // Procesar el mensaje
                await handleMessage(client, message);
            } catch (error) {
                logger.error(`Error al procesar mensaje: ${error.message}`);
                logger.error(error.stack);
                try {
                    await message.reply('Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta nuevamente más tarde.');
                } catch (replyError) {
                    logger.error(`No se pudo enviar mensaje de error: ${replyError.message}`);
                }
            }
        });
        
        // Evento cuando hay un error de autenticación
        client.on('auth_failure', (error) => {
            logger.error(`Error de autenticación: ${error}`);
        });
        
        // Evento cuando se desconecta
        client.on('disconnected', (reason) => {
            logger.warn(`Cliente desconectado: ${reason}`);
            // Reiniciar el cliente
            setTimeout(() => {
                logger.info('Intentando reiniciar el cliente...');
                client.initialize();
            }, 5000); // Esperar 5 segundos antes de reiniciar
        });
        
        // Inicializar el cliente
        logger.info('Inicializando cliente de WhatsApp...');
        await client.initialize();
        logger.info('Inicialización del cliente completada');
        
    } catch (error) {
        logger.error(`Error al inicializar la aplicación: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Iniciar la aplicación
initializeApp();

// Manejar el cierre de la aplicación
process.on('SIGINT', async () => {
    logger.info('Cerrando aplicación...');
    try {
        if (mongoose.connection.readyState === 1) {
            logger.info('Cerrando conexión a MongoDB...');
            await mongoose.connection.close();
            logger.info('Conexión a MongoDB cerrada correctamente');
        }
    } catch (error) {
        logger.error(`Error al cerrar conexión MongoDB: ${error.message}`);
    }
    process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    logger.error(`Error no capturado: ${error.message}`);
    logger.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Promesa rechazada no manejada:');
    logger.error(reason);
});