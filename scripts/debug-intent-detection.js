require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { getIntentsForNLP } = require('../src/services/intentService');
const { renderTemplate } = require('../src/utils/promptTemplates');
const { baseTemplates } = require('../src/utils/promptTemplates');

/**
 * Script para debuggear la detección de intenciones
 */
async function debugIntentDetection() {
    try {
        logger.info('🐛 Debug de detección de intenciones...');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB');
        
        // Obtener datos de intenciones para NLP
        const nlpData = await getIntentsForNLP();
        
        logger.info('\n📊 Datos de intenciones para NLP:');
        logger.info(`Total de intenciones: ${nlpData.supportedIntents.length}`);
        logger.info(`\nIntenciones soportadas:`);
        nlpData.supportedIntents.forEach(intent => {
            logger.info(`  - ${intent}`);
        });
        
        // Verificar si incluye guia_reportes
        const hasGuiaReportes = nlpData.supportedIntents.includes('guia_reportes');
        logger.info(`\n¿Incluye 'guia_reportes'? ${hasGuiaReportes ? '✅ SÍ' : '❌ NO'}`);
        
        if (hasGuiaReportes) {
            logger.info('\nEjemplos de guia_reportes:');
            if (nlpData.intentExamples['guia_reportes']) {
                nlpData.intentExamples['guia_reportes'].forEach(ex => {
                    logger.info(`  - "${ex}"`);
                });
            } else {
                logger.error('  ❌ No hay ejemplos para guia_reportes');
            }
        }
        
        // Renderizar el template para ver el prompt final
        logger.info('\n📝 Renderizando template de detección...');
        
        const variables = {
            supportedIntents: nlpData.supportedIntents,
            intentExamples: nlpData.intentExamples,
            conversationExamples: nlpData.conversationExamples,
            serviceType: 'ERP'
        };
        
        const promptContent = renderTemplate(baseTemplates['intent-detection'], variables);
        
        logger.info('\n=== PROMPT QUE SE ENVIARÍA AL MODELO ===');
        logger.info('(Mostrando solo parte relevante para guia_reportes)');
        
        // Buscar la sección de guia_reportes en el prompt
        const lines = promptContent.split('\n');
        let foundGuiaReportes = false;
        let inGuiaReportesSection = false;
        
        lines.forEach(line => {
            if (line.includes('guia_reportes')) {
                foundGuiaReportes = true;
                inGuiaReportesSection = true;
                logger.info(line);
            } else if (inGuiaReportesSection && line.startsWith('**')) {
                // Nueva sección, terminar
                inGuiaReportesSection = false;
            } else if (inGuiaReportesSection) {
                logger.info(line);
            }
        });
        
        if (!foundGuiaReportes) {
            logger.error('\n❌ NO SE ENCONTRÓ "guia_reportes" EN EL PROMPT');
        }
        
        // Simular detección con mensaje de prueba
        logger.info('\n🧪 Mensajes de prueba:');
        const testMessages = [
            'como creo un reporte?',
            'Cómo genero reportes',
            'quiero crear un reporte de ventas'
        ];
        
        logger.info('\nEstos mensajes DEBERÍAN detectar la intención "guia_reportes"');
        testMessages.forEach(msg => {
            logger.info(`  - "${msg}"`);
        });
        
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
debugIntentDetection();