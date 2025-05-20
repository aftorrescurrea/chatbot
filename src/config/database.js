const mongoose = require('mongoose');
const { logger } = require('../utils/logger');

/**
 * Conecta a la base de datos MongoDB
 */
const connectDB = async () => {
    try {
        // Configurar mongoose para depuración
        mongoose.set('debug', process.env.NODE_ENV !== 'production');
        
        // Configurar manejo de errores global para mongoose
        mongoose.connection.on('error', (err) => {
            logger.error(`Error de conexión MongoDB: ${err.message}`);
        });
        
        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB desconectado, intentando reconectar...');
        });
        
        // Conectar a MongoDB con opciones adicionales
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Tiempo de espera para selección de servidor
            socketTimeoutMS: 45000, // Tiempo de espera para operaciones de socket
            maxPoolSize: 50, // Tamaño máximo del pool de conexiones
            wtimeoutMS: 2500 // Tiempo de espera para operaciones de escritura
        });
        
        logger.info(`MongoDB conectado: ${conn.connection.host}`);
        
        // Verificar la conexión
        await mongoose.connection.db.admin().ping();
        logger.info('Verificación de conexión MongoDB exitosa (ping)');
    } catch (error) {
        logger.error(`Error al conectar a MongoDB: ${error.message}`);
        logger.error(error.stack);
        
        // No salir del proceso, intentar continuar
        if (process.env.NODE_ENV === 'production') {
            logger.warn('Continuando a pesar del error de conexión a MongoDB...');
        } else {
            process.exit(1);
        }
    }
};

module.exports = { connectDB };