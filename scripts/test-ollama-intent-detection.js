/**
 * Script para probar el servicio especializado de detección de intenciones con Ollama
 * Compara resultados entre la versión original y la nueva
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { migrationConfig } = require('../src/config/migrationConfig');
const nlpServiceOriginal = require('../src/services/nlpService');
const nlpServiceV2 = require('../src/services/nlpServiceV2');
const ollamaIntentService = require('../src/services/ollamaIntentDetectionService');
const { getIntentsForNLP } = require('../src/services/intentService');

// Mensajes de prueba para detección de intenciones
const testMessages = [
    { message: 'hola', expected: ['saludo'] },
    { message: 'como creo un reporte?', expected: ['guia_reportes'] },
    { message: 'Cómo genero reportes', expected: ['guia_reportes'] },
    { message: 'quiero crear un reporte de ventas', expected: ['guia_reportes'] },
    { message: 'qué características tiene el sistema?', expected: ['consulta_caracteristicas'] },
    { message: 'necesito ayuda para crear reportes', expected: ['guia_reportes', 'soporte_tecnico'] },
    { message: 'tutorial de reportes', expected: ['guia_reportes', 'tutorial_general'] },
    { message: 'cuánto cuesta el sistema?', expected: ['consulta_precio'] },
    { message: 'quiero probar el sistema', expected: ['solicitud_prueba'] },
    { message: 'tengo un error cuando intento facturar', expected: ['soporte_tecnico', 'guia_facturacion'] }
];

/**
 * Evalúa la precisión de las intenciones detectadas comparando con las esperadas
 * @param {Array} expected - Intenciones esperadas
 * @param {Array} detected - Intenciones detectadas
 * @returns {Object} - Métricas de precisión
 */
function evaluateAccuracy(expected, detected) {
    // Calcular verdaderos positivos, falsos positivos y falsos negativos
    const truePositives = expected.filter(intent => detected.includes(intent)).length;
    const falsePositives = detected.filter(intent => !expected.includes(intent)).length;
    const falseNegatives = expected.filter(intent => !detected.includes(intent)).length;
    
    // Calcular métricas
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    
    return {
        precision,
        recall,
        f1Score,
        truePositives,
        falsePositives,
        falseNegatives
    };
}

/**
 * Prueba el servicio especializado de detección de intenciones
 */
async function testOllamaIntentDetection() {
    try {
        logger.info('🧪 Probando servicio especializado de detección de intenciones con Ollama...\n');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB\n');
        
        // Verificar conexión con Ollama
        logger.info('🔌 Verificando conexión con Ollama...');
        const connected = await ollamaIntentService.testConnection();
        
        if (!connected) {
            logger.error('❌ No se pudo conectar con Ollama. Verifique que esté ejecutándose y configurado correctamente.');
            process.exit(1);
        }
        
        logger.info('✅ Conexión con Ollama establecida\n');
        
        // Obtener información del modelo
        logger.info('ℹ️ Información del modelo Ollama:');
        const modelInfo = await ollamaIntentService.getModelInfo();
        logger.info(JSON.stringify(modelInfo, null, 2) + '\n');
        
        // Cargar intenciones desde la base de datos
        const nlpData = await getIntentsForNLP();
        logger.info(`📊 Intenciones disponibles: ${nlpData.supportedIntents.length}`);
        logger.info(`Ejemplos de intenciones: ${Object.keys(nlpData.intentExamples).length}\n`);
        
        // Resultados globales
        const results = {
            original: { totalF1: 0, totalTests: 0 },
            v2: { totalF1: 0, totalTests: 0 }
        };
        
        // Ejecutar pruebas
        logger.info('🔍 Ejecutando pruebas de detección de intenciones...\n');
        
        for (const test of testMessages) {
            logger.info(`Mensaje: "${test.message}"`);
            logger.info(`Esperado: ${JSON.stringify(test.expected)}`);
            
            // Probar detección con servicio original
            const originalStart = Date.now();
            const originalResult = await nlpServiceOriginal.detectIntentsBasic(test.message);
            const originalTime = Date.now() - originalStart;
            
            logger.info(`Servicio Original: ${JSON.stringify(originalResult.intents)} (${originalTime}ms)`);
            
            // Probar con servicio especializado
            const v2Start = Date.now();
            const v2Result = await nlpServiceV2.detectIntentsBasic(test.message);
            const v2Time = Date.now() - v2Start;
            
            logger.info(`Servicio V2: ${JSON.stringify(v2Result.intents)} (${v2Time}ms)`);
            
            // Evaluar precisión
            const originalAccuracy = evaluateAccuracy(test.expected, originalResult.intents);
            const v2Accuracy = evaluateAccuracy(test.expected, v2Result.intents);
            
            logger.info(`F1-Score Original: ${originalAccuracy.f1Score.toFixed(2)}`);
            logger.info(`F1-Score V2: ${v2Accuracy.f1Score.toFixed(2)}\n`);
            
            // Acumular resultados
            results.original.totalF1 += originalAccuracy.f1Score;
            results.original.totalTests += 1;
            results.v2.totalF1 += v2Accuracy.f1Score;
            results.v2.totalTests += 1;
        }
        
        // Mostrar resultados generales
        logger.info('📈 RESULTADOS GENERALES:');
        logger.info(`F1-Score promedio (Original): ${(results.original.totalF1 / results.original.totalTests).toFixed(3)}`);
        logger.info(`F1-Score promedio (V2): ${(results.v2.totalF1 / results.v2.totalTests).toFixed(3)}\n`);
        
        // Probar generación de prompt optimizado
        logger.info('🔍 Ejemplo de prompt optimizado generado:');
        const sampleMessage = "cómo puedo crear un reporte de ventas";
        const samplePrompt = ollamaIntentService.createOptimizedPrompt(sampleMessage, nlpData);
        
        // Mostrar solo parte del prompt para no saturar la consola
        logger.info(samplePrompt.substring(0, 500) + '...\n');
        
    } catch (error) {
        logger.error(`❌ Error durante las pruebas: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar pruebas
testOllamaIntentDetection();