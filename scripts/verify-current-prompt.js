require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { getIntentsForNLP } = require('../src/services/intentService');
const { renderTemplate } = require('../src/utils/promptTemplates');
const { baseTemplates } = require('../src/utils/promptTemplates');

/**
 * Script para verificar el prompt actual después de los cambios
 */
async function verifyCurrentPrompt() {
    try {
        logger.info('🔍 Verificando el prompt actual después de los cambios...\n');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB\n');
        
        // Obtener datos de intenciones
        const nlpData = await getIntentsForNLP();
        
        logger.info('📊 Datos de NLP:');
        logger.info(`Total intenciones: ${nlpData.supportedIntents.length}`);
        logger.info(`Incluye guia_reportes: ${nlpData.supportedIntents.includes('guia_reportes') ? '✅' : '❌'}\n`);
        
        // Generar el prompt con el template actualizado
        const variables = {
            supportedIntents: nlpData.supportedIntents,
            intentExamples: nlpData.intentExamples,
            conversationExamples: nlpData.conversationExamples,
            serviceType: 'ERP'
        };
        
        const currentPrompt = renderTemplate(baseTemplates['intent-detection'], variables);
        
        logger.info('📄 PROMPT ACTUAL GENERADO:');
        logger.info('==========================\n');
        logger.info(currentPrompt);
        logger.info('\n==========================\n');
        
        // Verificar si incluye guia_reportes
        if (currentPrompt.includes('guia_reportes')) {
            logger.info('✅ El prompt INCLUYE guia_reportes');
            
            // Contar cuántas veces aparece
            const matches = currentPrompt.match(/guia_reportes/g);
            logger.info(`Aparece ${matches.length} veces en el prompt\n`);
        } else {
            logger.error('❌ El prompt NO incluye guia_reportes\n');
        }
        
        // Verificar formato de intenciones
        logger.info('🔍 Verificando formato de intenciones en el prompt:');
        const intentLines = currentPrompt.split('\n').filter(line => line.startsWith('- '));
        logger.info(`Total de líneas de intenciones: ${intentLines.length}`);
        
        // Mostrar solo las relacionadas con reportes
        logger.info('\nIntenciones relacionadas con reportes:');
        intentLines.filter(line => line.includes('report') || line.includes('guia')).forEach(line => {
            logger.info(line);
        });
        
        // Verificar si hay ejemplos
        logger.info('\n🔍 Buscando sección de ejemplos:');
        const examplesSection = currentPrompt.match(/EJEMPLOS.*?(?=\n[A-Z]|$)/s);
        if (examplesSection) {
            logger.info('Sección de ejemplos encontrada:');
            logger.info(examplesSection[0].substring(0, 200) + '...');
        } else {
            logger.error('❌ No se encontró sección de ejemplos');
        }
        
    } catch (error) {
        logger.error(`❌ Error: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('\n🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar verificación
verifyCurrentPrompt();