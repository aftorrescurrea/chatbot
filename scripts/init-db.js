/**
 * Script para inicializar la estructura de la base de datos en MongoDB Atlas
 * 
 * Este script crea las colecciones necesarias y algunos documentos iniciales
 * para el funcionamiento del chatbot de WhatsApp.
 * 
 * Uso: node scripts/init-db.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { logger } = require('../src/utils/logger');

// Modelos
const User = require('../src/models/User');
const Credential = require('../src/models/Credential');
const Conversation = require('../src/models/Conversation');

// Configurar mongoose para depuración
mongoose.set('debug', true);

// Función principal
async function initializeDatabase() {
    try {
        logger.info('Iniciando conexión a MongoDB Atlas...');
        
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info(`MongoDB conectado: ${mongoose.connection.host}`);
        
        // Obtener referencia a la base de datos
        const db = mongoose.connection.db;
        
        // Crear colecciones si no existen
        logger.info('Creando colecciones...');
        
        // Lista de colecciones a crear
        const collections = [
            'users',           // Usuarios registrados
            'credentials',     // Credenciales generadas
            'conversations',   // Historial de conversaciones
            'logs'             // Logs del sistema
        ];
        
        // Obtener colecciones existentes
        const existingCollections = await db.listCollections().toArray();
        const existingCollectionNames = existingCollections.map(col => col.name);
        
        // Crear colecciones que no existen
        for (const collection of collections) {
            if (!existingCollectionNames.includes(collection)) {
                await db.createCollection(collection);
                logger.info(`Colección creada: ${collection}`);
            } else {
                logger.info(`Colección ya existe: ${collection}`);
            }
        }
        
        // Verificar que las colecciones se hayan creado correctamente
        const updatedCollections = await db.listCollections().toArray();
        const updatedCollectionNames = updatedCollections.map(col => col.name);
        logger.info(`Colecciones actuales: ${updatedCollectionNames.join(', ')}`);
        
        // Crear índices para mejorar el rendimiento
        logger.info('Creando índices...');
        
        // Índices para la colección de usuarios
        try {
            await User.collection.createIndex({ phone: 1 }, { unique: true });
            await User.collection.createIndex({ email: 1 }, { unique: true });
            // Ya no necesitamos el índice para conversationHistory
            logger.info('Índices de usuarios creados correctamente');
            
            // Verificar índices de usuarios
            const userIndexes = await User.collection.indexes();
            logger.info(`Índices de usuarios: ${JSON.stringify(userIndexes.map(idx => idx.name))}`);
        } catch (indexError) {
            logger.error(`Error al crear índices de usuarios: ${indexError.message}`);
        }
        
        // Índices para la colección de credenciales
        try {
            if (db.collection('credentials')) {
                await Credential.collection.createIndex({ userId: 1 });
                await Credential.collection.createIndex({ username: 1 }, { unique: true });
                await Credential.collection.createIndex({ expirationDate: 1 });
                await Credential.collection.createIndex({ serviceId: 1 });
                logger.info('Índices de credenciales creados correctamente');
                
                // Verificar índices de credenciales
                const credentialIndexes = await Credential.collection.indexes();
                logger.info(`Índices de credenciales: ${JSON.stringify(credentialIndexes.map(idx => idx.name))}`);
            }
        } catch (indexError) {
            logger.error(`Error al crear índices de credenciales: ${indexError.message}`);
        }
        
        // Índices para la colección de conversaciones
        try {
            if (db.collection('conversations')) {
                await Conversation.collection.createIndex({ userId: 1, timestamp: 1 });
                await Conversation.collection.createIndex({ phone: 1, timestamp: 1 });
                await Conversation.collection.createIndex({ timestamp: 1 });
                logger.info('Índices de conversaciones creados correctamente');
                
                // Verificar índices de conversaciones
                const conversationIndexes = await Conversation.collection.indexes();
                logger.info(`Índices de conversaciones: ${JSON.stringify(conversationIndexes.map(idx => idx.name))}`);
            }
        } catch (indexError) {
            logger.error(`Error al crear índices de conversaciones: ${indexError.message}`);
        }
        
        logger.info('Índices creados correctamente');
        
        // Crear usuario administrador si no existe
        const adminExists = await User.findOne({ email: process.env.ADMIN_EMAIL });
        
        if (!adminExists && process.env.ADMIN_EMAIL) {
            logger.info('Creando usuario administrador...');
            
            const adminUser = new User({
                phone: 'admin',
                name: 'Administrador',
                email: process.env.ADMIN_EMAIL,
                registrationDate: new Date(),
                lastActivity: new Date(),
                isAdmin: true
            });
            
            await adminUser.save();
            logger.info('Usuario administrador creado correctamente');
        }
        
        // Verificar que el modelo Conversation esté correctamente definido
        const conversationSchema = mongoose.model('Conversation').schema;
        if (conversationSchema.path('userId') && conversationSchema.path('message')) {
            logger.info('Modelo Conversation está correctamente definido');
        } else {
            logger.error('Modelo Conversation NO está correctamente definido');
        }
        
        logger.info('Inicialización de la base de datos completada con éxito');
    } catch (error) {
        logger.error(`Error al inicializar la base de datos: ${error.message}`);
        logger.error(error.stack);
        process.exit(1);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('Conexión a MongoDB cerrada');
    }
}

// Ejecutar la función principal
initializeDatabase().then(() => {
    process.exit(0);
});