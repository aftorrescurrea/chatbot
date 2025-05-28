require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const intentService = require('../src/services/intentService');
const entityService = require('../src/services/entityService');
const { intentConfig, entityConfig } = require('../src/config/promptConfig');

/**
 * Script para migrar intenciones y entidades desde la configuración a MongoDB
 */
async function migrateData() {
    try {
        logger.info('🚀 Iniciando migración de intenciones y entidades...');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB');
        
        // Migrar intenciones
        logger.info('📝 Migrando intenciones...');
        const importedIntents = await intentService.importIntentsFromConfig(intentConfig);
        logger.info(`✅ ${importedIntents.length} intenciones migradas exitosamente`);
        
        // Migrar entidades
        logger.info('📝 Migrando entidades...');
        const importedEntities = await entityService.importEntitiesFromConfig(entityConfig);
        logger.info(`✅ ${importedEntities.length} entidades migradas exitosamente`);
        
        // Mostrar resumen
        logger.info('\n📊 === RESUMEN DE MIGRACIÓN ===');
        logger.info(`✅ Intenciones migradas: ${importedIntents.length}`);
        logger.info(`✅ Entidades migradas: ${importedEntities.length}`);
        
        // Listar intenciones migradas
        if (importedIntents.length > 0) {
            logger.info('\n📋 Intenciones migradas:');
            importedIntents.forEach(intent => {
                logger.info(`   - ${intent.displayName} (${intent.name})`);
            });
        }
        
        // Listar entidades migradas
        if (importedEntities.length > 0) {
            logger.info('\n📋 Entidades migradas:');
            importedEntities.forEach(entity => {
                logger.info(`   - ${entity.displayName} (${entity.name}) - Tipo: ${entity.type}`);
            });
        }
        
        logger.info('\n✅ Migración completada exitosamente');
        
    } catch (error) {
        logger.error(`❌ Error durante la migración: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar migración
migrateData();