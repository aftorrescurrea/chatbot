require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { detectIntentsWithContext } = require('../src/services/nlpService');
const { getConversationMemory } = require('../src/services/MemoryService');

/**
 * Script para probar la solución final
 */
async function testFinalSolution() {
    try {
        logger.info('🎯 Probando solución final para detección de intenciones...\n');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB\n');
        
        // Casos de prueba críticos
        const testCases = [
            { 
                message: 'hola', 
                expected: ['saludo'],
                description: 'Saludo simple'
            },
            { 
                message: 'como creo un reporte?', 
                expected: ['guia_reportes'],
                description: 'Pregunta sobre reportes (caso problemático)'
            },
            { 
                message: 'Cómo genero reportes', 
                expected: ['guia_reportes'],
                description: 'Variación de pregunta sobre reportes'
            },
            { 
                message: 'quiero crear un reporte de ventas', 
                expected: ['guia_reportes'],
                description: 'Pregunta específica sobre reportes'
            },
            { 
                message: 'necesito ayuda para crear reportes', 
                expected: ['guia_reportes', 'tutorial_general'],
                description: 'Múltiples intenciones'
            },
            { 
                message: 'hola, como creo un reporte?', 
                expected: ['saludo', 'guia_reportes'],
                description: 'Saludo + pregunta'
            },
            {
                message: 'qué características tiene el sistema?',
                expected: ['consulta_caracteristicas'],
                description: 'Consulta de características'
            }
        ];
        
        const phoneNumber = '573008475552@c.us';
        let passed = 0;
        let failed = 0;
        
        logger.info('📋 Ejecutando pruebas con template optimizado:\n');
        logger.info('================================================\n');
        
        for (const test of testCases) {
            logger.info(`📝 ${test.description}`);
            logger.info(`   Mensaje: "${test.message}"`);
            logger.info(`   Esperado: ${JSON.stringify(test.expected)}`);
            
            try {
                // Obtener memoria conversacional
                await getConversationMemory(phoneNumber);
                
                // Detectar intenciones
                const startTime = Date.now();
                const result = await detectIntentsWithContext(test.message, phoneNumber);
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;
                
                logger.info(`   Detectado: ${JSON.stringify(result.intents)}`);
                logger.info(`   Tiempo: ${duration.toFixed(2)}s`);
                
                // Verificar resultado
                const isCorrect = test.expected.every(intent => result.intents.includes(intent)) &&
                                result.intents.length === test.expected.length;
                
                if (isCorrect) {
                    logger.info('   ✅ CORRECTO\n');
                    passed++;
                } else {
                    logger.error('   ❌ INCORRECTO\n');
                    failed++;
                }
                
            } catch (error) {
                logger.error(`   ❌ ERROR: ${error.message}\n`);
                failed++;
            }
        }
        
        // Resumen
        logger.info('\n📊 RESUMEN DE PRUEBAS');
        logger.info('====================');
        logger.info(`Total de pruebas: ${testCases.length}`);
        logger.info(`✅ Pasadas: ${passed}`);
        logger.info(`❌ Falladas: ${failed}`);
        logger.info(`Tasa de éxito: ${((passed / testCases.length) * 100).toFixed(1)}%`);
        
        if (passed === testCases.length) {
            logger.info('\n🎉 ¡TODAS LAS PRUEBAS PASARON! El sistema está funcionando correctamente.');
        } else {
            logger.error('\n⚠️  Algunas pruebas fallaron. Revisa los logs para más detalles.');
        }
        
        // Prueba específica del caso problemático
        logger.info('\n\n🔍 PRUEBA ESPECÍFICA DEL CASO PROBLEMÁTICO');
        logger.info('==========================================\n');
        
        const problematicMessage = "como creo un reporte?";
        logger.info(`Probando: "${problematicMessage}"`);
        
        const result = await detectIntentsWithContext(problematicMessage, phoneNumber);
        
        if (result.intents.includes('guia_reportes')) {
            logger.info('✅ ¡ÉXITO! El problema ha sido resuelto.');
            logger.info('El sistema ahora detecta correctamente "guia_reportes" cuando alguien pregunta sobre reportes.');
        } else {
            logger.error('❌ El problema persiste. El sistema NO detecta "guia_reportes".');
            logger.info('Intenciones detectadas:', result.intents);
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
testFinalSolution();