require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { detectIntentsWithContext } = require('../src/services/nlpService');
const { getConversationMemory } = require('../src/services/MemoryService');

/**
 * Script para probar la detección de intenciones
 */
async function testIntentDetection() {
    try {
        logger.info('🧪 Probando detección de intenciones...');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB');
        
        // Mensajes de prueba
        const testMessages = [
            { message: 'hola', expected: ['saludo'] },
            { message: 'como creo un reporte?', expected: ['guia_reportes'] },
            { message: 'Cómo genero reportes', expected: ['guia_reportes'] },
            { message: 'quiero crear un reporte de ventas', expected: ['guia_reportes'] },
            { message: 'qué características tiene el sistema?', expected: ['consulta_caracteristicas'] },
            { message: 'necesito ayuda para crear reportes', expected: ['guia_reportes', 'soporte_tecnico'] },
            { message: 'tutorial de reportes', expected: ['guia_reportes', 'tutorial_general'] }
        ];
        
        const phoneNumber = '573008475552@c.us'; // Número de prueba
        
        logger.info('\n📋 Ejecutando pruebas de detección...\n');
        
        for (const test of testMessages) {
            logger.info(`Mensaje: "${test.message}"`);
            logger.info(`Esperado: ${JSON.stringify(test.expected)}`);
            
            try {
                // Obtener memoria (crear una vacía si no existe)
                const memory = await getConversationMemory(phoneNumber);
                
                // Detectar intenciones
                const result = await detectIntentsWithContext(test.message, phoneNumber);
                
                logger.info(`Detectado: ${JSON.stringify(result.intents)}`);
                
                // Verificar si coincide
                const correct = test.expected.every(intent => result.intents.includes(intent));
                if (correct && result.intents.length === test.expected.length) {
                    logger.info('✅ CORRECTO\n');
                } else {
                    logger.error('❌ INCORRECTO\n');
                }
            } catch (error) {
                logger.error(`❌ ERROR: ${error.message}\n`);
            }
        }
        
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
testIntentDetection();