/**
 * Script para restaurar la base de datos desde una copia de seguridad
 * 
 * Este script importa las colecciones desde archivos JSON a la base de datos.
 * 
 * Uso: node scripts/restore-db.js [directorio]
 * 
 * Si no se especifica un directorio, se utilizará la copia de seguridad más reciente
 * en el directorio ./backups/
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { logger } = require('../src/utils/logger');

// Función principal
async function restoreDatabase() {
    try {
        // Obtener directorio de origen
        let backupDir = process.argv[2];
        
        if (!backupDir) {
            // Buscar la copia de seguridad más reciente
            backupDir = findLatestBackup();
            
            if (!backupDir) {
                logger.error('No se encontraron copias de seguridad');
                process.exit(1);
            }
            
            logger.info(`Utilizando la copia de seguridad más reciente: ${backupDir}`);
        }
        
        // Verificar que el directorio existe
        if (!fs.existsSync(backupDir)) {
            logger.error(`El directorio de backup no existe: ${backupDir}`);
            process.exit(1);
        }
        
        // Verificar que existe el archivo de metadatos
        const metadataPath = path.join(backupDir, 'metadata.json');
        if (!fs.existsSync(metadataPath)) {
            logger.error(`No se encontró el archivo de metadatos: ${metadataPath}`);
            process.exit(1);
        }
        
        // Leer metadatos
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        logger.info(`Restaurando backup creado el: ${metadata.timestamp}`);
        logger.info(`Base de datos original: ${metadata.database}`);
        
        // Conectar a MongoDB
        logger.info('Conectando a MongoDB Atlas...');
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info(`MongoDB conectado: ${mongoose.connection.host}`);
        
        // Obtener referencia a la base de datos
        const db = mongoose.connection.db;
        
        // Solicitar confirmación antes de restaurar
        console.log('\n¡ADVERTENCIA! Esta operación reemplazará los datos existentes en la base de datos.');
        console.log(`Se restaurarán ${metadata.collections.length} colecciones desde: ${backupDir}`);
        console.log('¿Está seguro de que desea continuar? (s/n)');
        
        process.stdin.once('data', async (data) => {
            const answer = data.toString().trim().toLowerCase();
            
            if (answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes') {
                try {
                    // Restaurar cada colección
                    for (const collectionName of metadata.collections) {
                        const filePath = path.join(backupDir, `${collectionName}.json`);
                        
                        // Verificar que el archivo existe
                        if (!fs.existsSync(filePath)) {
                            logger.warn(`Archivo no encontrado para la colección ${collectionName}, omitiendo...`);
                            continue;
                        }
                        
                        logger.info(`Restaurando colección: ${collectionName}`);
                        
                        // Leer documentos del archivo
                        const documents = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        
                        if (documents.length === 0) {
                            logger.info(`La colección ${collectionName} está vacía, omitiendo...`);
                            continue;
                        }
                        
                        // Eliminar colección existente si existe
                        try {
                            await db.collection(collectionName).drop();
                            logger.info(`Colección existente eliminada: ${collectionName}`);
                        } catch (error) {
                            // La colección no existe, no es un error
                        }
                        
                        // Insertar documentos
                        await db.collection(collectionName).insertMany(documents);
                        logger.info(`Colección ${collectionName} restaurada: ${documents.length} documentos`);
                    }
                    
                    logger.info('Restauración completada con éxito');
                } catch (error) {
                    logger.error(`Error durante la restauración: ${error.message}`);
                }
                
                // Cerrar conexión y salir
                await mongoose.connection.close();
                process.exit(0);
            } else {
                logger.info('Operación cancelada');
                await mongoose.connection.close();
                process.exit(0);
            }
        });
        
        // Mantener el proceso en ejecución para esperar la respuesta
        return new Promise(resolve => {
            // Esta promesa no se resolverá, ya que el proceso terminará con process.exit()
        });
        
    } catch (error) {
        logger.error(`Error al restaurar backup: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Encuentra la copia de seguridad más reciente
 * @returns {string|null} - Ruta al directorio de la copia de seguridad más reciente
 */
function findLatestBackup() {
    const backupsDir = 'backups';
    
    // Verificar que el directorio de backups existe
    if (!fs.existsSync(backupsDir)) {
        return null;
    }
    
    // Obtener subdirectorios
    const subdirs = fs.readdirSync(backupsDir)
        .filter(file => fs.statSync(path.join(backupsDir, file)).isDirectory())
        .map(dir => ({
            name: dir,
            path: path.join(backupsDir, dir),
            time: fs.statSync(path.join(backupsDir, dir)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time); // Ordenar por fecha de modificación (más reciente primero)
    
    if (subdirs.length === 0) {
        return null;
    }
    
    return subdirs[0].path;
}

// Ejecutar la función principal
restoreDatabase().catch(error => {
    console.error(`Error no controlado: ${error.message}`);
    process.exit(1);
});