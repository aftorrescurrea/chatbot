require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { getIntentsForNLP } = require('../src/services/intentService');
const Intent = require('../src/models/Intent');

/**
 * Script para debuggear la generación del prompt
 */
async function debugPromptGeneration() {
    try {
        logger.info('🔍 Debuggeando generación de prompts para detección de intenciones...\n');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB\n');
        
        // 1. Verificar intenciones en la base de datos
        logger.info('📊 PASO 1: Verificando intenciones en BD');
        logger.info('=====================================');
        
        const allIntents = await Intent.find({ isActive: true }).sort({ priority: 1 });
        logger.info(`Total de intenciones activas: ${allIntents.length}\n`);
        
        // Buscar específicamente guia_reportes
        const guiaReportes = await Intent.findOne({ name: 'guia_reportes' });
        if (guiaReportes) {
            logger.info('✅ "guia_reportes" EXISTE en BD:');
            logger.info(`   - ID: ${guiaReportes._id}`);
            logger.info(`   - Activa: ${guiaReportes.isActive}`);
            logger.info(`   - Prioridad: ${guiaReportes.priority}`);
            logger.info(`   - Categoría: ${guiaReportes.category}`);
            logger.info(`   - Ejemplos: ${guiaReportes.examples.length}`);
            logger.info('   Primeros 5 ejemplos:');
            guiaReportes.examples.slice(0, 5).forEach(ex => {
                logger.info(`     • "${ex}"`);
            });
        } else {
            logger.error('❌ "guia_reportes" NO EXISTE en BD');
        }
        
        // 2. Verificar qué devuelve getIntentsForNLP
        logger.info('\n📊 PASO 2: Verificando getIntentsForNLP()');
        logger.info('=========================================');
        
        const nlpData = await getIntentsForNLP();
        logger.info(`Intenciones soportadas: ${nlpData.supportedIntents.length}`);
        
        // Verificar si incluye las nuevas intenciones
        const newIntents = ['guia_reportes', 'tutorial_general', 'guia_inventario', 'guia_facturacion', 'guia_usuarios'];
        logger.info('\nVerificando intenciones nuevas:');
        for (const intent of newIntents) {
            const included = nlpData.supportedIntents.includes(intent);
            logger.info(`  ${intent}: ${included ? '✅ SÍ' : '❌ NO'}`);
        }
        
        // 3. Mostrar lista completa de intenciones soportadas
        logger.info('\n📋 Lista completa de intenciones soportadas:');
        nlpData.supportedIntents.forEach((intent, index) => {
            logger.info(`  ${index + 1}. ${intent}`);
        });
        
        // 4. Verificar ejemplos para guia_reportes
        if (nlpData.intentExamples['guia_reportes']) {
            logger.info('\n📝 Ejemplos de guia_reportes en nlpData:');
            logger.info(`Total: ${nlpData.intentExamples['guia_reportes'].length}`);
            nlpData.intentExamples['guia_reportes'].slice(0, 5).forEach(ex => {
                logger.info(`  • "${ex}"`);
            });
        } else {
            logger.error('\n❌ NO HAY ejemplos para guia_reportes en nlpData');
        }
        
        // 5. Verificar ejemplos de conversación
        logger.info('\n💬 Ejemplos de conversación generados:');
        const reportExamples = nlpData.conversationExamples.filter(ex => 
            ex.assistant.includes('guia_reportes')
        );
        logger.info(`Ejemplos con guia_reportes: ${reportExamples.length}`);
        reportExamples.slice(0, 3).forEach(ex => {
            logger.info(`  Usuario: "${ex.user}"`);
            logger.info(`  Asistente: ${ex.assistant}\n`);
        });
        
        // 6. Simular el prompt que se enviaría
        logger.info('\n📄 SIMULACIÓN DE PROMPT');
        logger.info('======================');
        logger.info('El prompt incluiría estas intenciones:');
        logger.info(nlpData.supportedIntents.join(', '));
        
        // 7. Verificar si hay algún problema de cache o actualización
        logger.info('\n🔄 Verificando posibles problemas:');
        
        // Contar intenciones por categoría
        const intentsByCategory = {};
        for (const intent of allIntents) {
            const category = intent.category || 'general';
            intentsByCategory[category] = (intentsByCategory[category] || 0) + 1;
        }
        
        logger.info('\nIntenciones por categoría:');
        Object.entries(intentsByCategory).forEach(([cat, count]) => {
            logger.info(`  ${cat}: ${count}`);
        });
        
        // Verificar si hay intenciones duplicadas
        const intentNames = allIntents.map(i => i.name);
        const duplicates = intentNames.filter((name, index) => intentNames.indexOf(name) !== index);
        if (duplicates.length > 0) {
            logger.error(`\n⚠️  Intenciones duplicadas encontradas: ${duplicates.join(', ')}`);
        }
        
    } catch (error) {
        logger.error(`❌ Error durante el debug: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('\n🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar debug
debugPromptGeneration();