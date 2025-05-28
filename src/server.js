const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { logger } = require('./utils/logger');

// Importar rutas
const intentRoutes = require('./routes/intentRoutes');
const entityRoutes = require('./routes/entityRoutes');

// Crear aplicación Express
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});

// Rutas de la API
app.use('/api/intents', intentRoutes);
app.use('/api/entities', entityRoutes);

// Ruta de salud
app.get('/api/health', async (req, res) => {
    try {
        const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        
        res.json({
            success: true,
            status: 'healthy',
            services: {
                mongodb: mongoStatus,
                api: 'running'
            },
            timestamp: new Date()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Ruta raíz
app.get('/', (req, res) => {
    res.json({
        message: 'API de Gestión de Intenciones y Entidades',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            intents: '/api/intents',
            entities: '/api/entities'
        }
    });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado'
    });
});

// Manejo de errores global
app.use((err, req, res, next) => {
    logger.error(`Error en API: ${err.message}`);
    logger.error(err.stack);
    
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Error interno del servidor',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Función para iniciar el servidor
const startServer = (port = process.env.API_PORT || 3000) => {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            logger.info(`🚀 Servidor API iniciado en puerto ${port}`);
            logger.info(`📍 URL base: http://localhost:${port}`);
            logger.info(`📍 Documentación: http://localhost:${port}/`);
            resolve(server);
        });
        
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`❌ Puerto ${port} ya está en uso`);
            } else {
                logger.error(`❌ Error al iniciar servidor: ${error.message}`);
            }
            reject(error);
        });
    });
};

module.exports = {
    app,
    startServer
};