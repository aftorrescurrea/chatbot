/**
 * Script para realizar copias de seguridad de la base de datos en MongoDB Atlas
 * 
 * Este script exporta las colecciones de la base de datos a archivos JSON
 * que pueden ser utilizados para restaurar la base de datos en caso de pérdida de datos.
 * 
 * Uso: node scripts/backup-db.js [directorio]
 * 
 * Si no se especifica un directorio, se utilizará ./backups/YYYY-MM-DD/
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { logger } = require('../src/utils/logger');

// Función principal
async function backupDatabase() {
    try {
        // Obtener directorio de destino
        let backupDir = process.argv[2];
        
        if (!backupDir) {
            // Crear directorio de backups con la fecha actual
            const date = new Date();
            const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
            backupDir = path.join('backups', dateStr);
        }
        
        // Crear directorio si no existe
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
            logger.info(`Directorio de backup creado: ${backupDir}`);
        }
        
        // Conectar a MongoDB
        logger.info('Conectando a MongoDB Atlas...');
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info(`MongoDB conectado: ${mongoose.connection.host}`);
        
        // Obtener referencia a la base de datos
        const db = mongoose.connection.db;
        
        // Obtener lista de colecciones
        const collections = await db.listCollections().toArray();
        
        // Exportar cada colección
        for (const collection of collections) {
            const collectionName = collection.name;
            logger.info(`Exportando colección: ${collectionName}`);
            
            // Obtener todos los documentos de la colección
            const documents = await db.collection(collectionName).find({}).toArray();
            
            // Guardar documentos en un archivo JSON
            const filePath = path.join(backupDir, `${collectionName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(documents, null, 2));
            
            logger.info(`Colección ${collectionName} exportada: ${documents.length} documentos`);
        }
        
        logger.info(`Backup completado en: ${backupDir}`);
        
        // Crear archivo de metadatos
        const metadata = {
            timestamp: new Date().toISOString(),
            database: db.databaseName,
            server: mongoose.connection.host,
            collections: collections.map(c => c.name)
        };
        
        fs.writeFileSync(
            path.join(backupDir, 'metadata.json'),
            JSON.stringify(metadata, null, 2)
        );
        
    } catch (error) {
        logger.error(`Error al realizar backup: ${error.message}`);
        process.exit(1);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('Conexión a MongoDB cerrada');
    }
}

// Ejecutar la función principal
backupDatabase().then(() => {
    process.exit(0);
});