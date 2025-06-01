require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const Intent = require('../src/models/Intent');
const { getIntentsForNLP } = require('../src/services/intentService');

/**
 * Script para verificar las intenciones en la base de datos
 */
async function verifyIntents() {
    try {
        logger.info('🔍 Verificando intenciones en la base de datos...');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB');
        
        // Obtener todas las intenciones activas
        const activeIntents = await Intent.getActiveIntents();
        logger.info(`\n📊 Total de intenciones activas: ${activeIntents.length}`);
        
        // Listar todas las intenciones
        logger.info('\n📋 Intenciones activas:');
        activeIntents.forEach(intent => {
            logger.info(`\n- ${intent.displayName} (${intent.name})`);
            logger.info(`  Categoría: ${intent.category || 'general'}`);
            logger.info(`  Tiene flujo: ${intent.hasSpecificFlow ? 'Sí' : 'No'}`);
            logger.info(`  Ejemplos (primeros 3):`);
            intent.examples.slice(0, 3).forEach(ex => {
                logger.info(`    * "${ex}"`);
            });
        });
        
        // Verificar intenciones de tutorial específicamente
        const tutorialIntents = await Intent.getByCategory('tutorial');
        logger.info(`\n🎓 Intenciones de tutorial: ${tutorialIntents.length}`);
        
        // Verificar si existe guia_reportes
        const guiaReportes = await Intent.findByName('guia_reportes');
        if (guiaReportes) {
            logger.info('\n✅ Intención "guia_reportes" encontrada:');
            logger.info(`  - Activa: ${guiaReportes.isActive ? 'Sí' : 'No'}`);
            logger.info(`  - Ejemplos: ${guiaReportes.examples.length}`);
            logger.info(`  - Pasos de flujo: ${guiaReportes.flowSteps ? guiaReportes.flowSteps.length : 0}`);
        } else {
            logger.error('❌ Intención "guia_reportes" NO encontrada');
        }
        
        // Verificar formato para NLP
        const nlpData = await getIntentsForNLP();
        logger.info('\n📤 Datos preparados para NLP:');
        logger.info(`  - Intenciones soportadas: ${nlpData.supportedIntents.length}`);
        logger.info(`  - Incluye guia_reportes: ${nlpData.supportedIntents.includes('guia_reportes') ? 'Sí' : 'No'}`);
        
        // Mostrar ejemplos de guia_reportes para NLP
        if (nlpData.intentExamples['guia_reportes']) {
            logger.info('\n📝 Ejemplos de guia_reportes para NLP:');
            nlpData.intentExamples['guia_reportes'].forEach(ex => {
                logger.info(`  - "${ex}"`);
            });
        }
        
    } catch (error) {
        logger.error(`❌ Error durante la verificación: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('\n🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar verificación
verifyIntents();