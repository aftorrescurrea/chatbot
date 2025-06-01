require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { getIntentsForNLP } = require('../src/services/intentService');
const { renderTemplate } = require('../src/utils/promptTemplates');
const { baseTemplates } = require('../src/utils/promptTemplates');
const promptServiceV2 = require('../src/services/promptServiceV2');

/**
 * Script para probar directamente el prompt con el modelo
 */
async function testDirectPrompt() {
    try {
        logger.info('🧪 Probando prompt directo con Ollama...\n');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB\n');
        
        // Obtener datos de intenciones
        const nlpData = await getIntentsForNLP();
        
        // Verificar que guia_reportes está incluida
        logger.info('📊 Verificación rápida:');
        logger.info(`Total intenciones: ${nlpData.supportedIntents.length}`);
        logger.info(`Incluye guia_reportes: ${nlpData.supportedIntents.includes('guia_reportes') ? '✅' : '❌'}\n`);
        
        // Mensaje de prueba
        const testMessage = "como creo un reporte?";
        logger.info(`📝 Mensaje de prueba: "${testMessage}"\n`);
        
        // Generar el prompt completo
        const variables = {
            supportedIntents: nlpData.supportedIntents,
            intentExamples: nlpData.intentExamples,
            conversationExamples: nlpData.conversationExamples,
            serviceType: 'ERP'
        };
        
        const systemPrompt = renderTemplate(baseTemplates['intent-detection'], variables);
        
        // Mostrar parte del prompt
        logger.info('📄 PROMPT GENERADO (extracto):');
        logger.info('================================');
        
        // Mostrar intenciones soportadas
        const intentSection = systemPrompt.match(/### INTENCIONES SOPORTADAS ###[\s\S]*?###/);
        if (intentSection) {
            logger.info(intentSection[0].substring(0, 500) + '...\n');
        }
        
        // Mostrar ejemplos de guia_reportes
        const guiaReportesSection = systemPrompt.match(/\*\*guia_reportes\*\*:[\s\S]*?(?=\*\*|###)/);
        if (guiaReportesSection) {
            logger.info('Sección guia_reportes:');
            logger.info(guiaReportesSection[0] + '\n');
        }
        
        // Intentar detectar intenciones usando el servicio
        logger.info('🤖 Enviando al modelo Ollama...');
        logger.info('Esperando respuesta (puede tomar varios segundos)...\n');
        
        try {
            // Usar directamente el servicio de prompts
            const result = await promptServiceV2.detectIntentions(
                testMessage,
                'intent-detection',
                variables,
                { maxRetries: 1 }
            );
            
            logger.info('✅ Respuesta del modelo:');
            logger.info(JSON.stringify(result, null, 2));
            
            if (result.intents && result.intents.includes('guia_reportes')) {
                logger.info('\n🎉 ¡ÉXITO! El modelo detectó "guia_reportes"');
            } else {
                logger.error('\n❌ FALLO: El modelo NO detectó "guia_reportes"');
                logger.info('\nPosibles causas:');
                logger.info('1. El modelo necesita más ejemplos variados');
                logger.info('2. Conflicto con otras intenciones similares');
                logger.info('3. El prompt es demasiado largo y el modelo se confunde');
                logger.info('4. Necesita ajuste en la temperatura o parámetros del modelo');
            }
            
        } catch (error) {
            logger.error(`❌ Error al consultar el modelo: ${error.message}`);
            
            // Si es timeout, sugerir soluciones
            if (error.message.includes('timeout') || error.message.includes('Timeout')) {
                logger.info('\n⏱️  El modelo tardó demasiado. Posibles soluciones:');
                logger.info('1. Reducir el número de intenciones');
                logger.info('2. Simplificar los ejemplos');
                logger.info('3. Usar un modelo más pequeño/rápido');
            }
        }
        
        // Probar con un prompt simplificado
        logger.info('\n🔄 Probando con prompt simplificado...');
        
        const simplifiedIntents = nlpData.supportedIntents.filter(intent => 
            intent.includes('guia') || intent.includes('tutorial') || intent === 'saludo'
        );
        
        const simplifiedVariables = {
            supportedIntents: simplifiedIntents,
            intentExamples: Object.fromEntries(
                Object.entries(nlpData.intentExamples).filter(([key]) => 
                    simplifiedIntents.includes(key)
                )
            ),
            conversationExamples: [],
            serviceType: 'ERP'
        };
        
        logger.info(`Intenciones simplificadas (${simplifiedIntents.length}): ${simplifiedIntents.join(', ')}\n`);
        
        try {
            const simplifiedResult = await promptServiceV2.detectIntentions(
                testMessage,
                'intent-detection',
                simplifiedVariables,
                { maxRetries: 1 }
            );
            
            logger.info('✅ Respuesta con prompt simplificado:');
            logger.info(JSON.stringify(simplifiedResult, null, 2));
            
            if (simplifiedResult.intents && simplifiedResult.intents.includes('guia_reportes')) {
                logger.info('\n🎉 ¡ÉXITO con prompt simplificado! El problema puede ser la cantidad de intenciones.');
            }
            
        } catch (error) {
            logger.error(`❌ Error con prompt simplificado: ${error.message}`);
        }
        
    } catch (error) {
        logger.error(`❌ Error general: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('\n🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar prueba
testDirectPrompt();