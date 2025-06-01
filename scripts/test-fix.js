require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { detectIntentsWithContext } = require('../src/services/nlpService');

/**
 * Script rápido para probar la corrección
 */
async function testFix() {
    try {
        logger.info('🧪 Probando corrección del template...\n');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB\n');
        
        // Mensajes de prueba
        const testMessages = [
            'hola',
            'como creo un reporte?',
            'quiero generar reportes'
        ];
        
        const phoneNumber = '573008475552@c.us';
        
        logger.info('📋 Ejecutando pruebas con template corregido:\n');
        
        for (const message of testMessages) {
            logger.info(`\nMensaje: "${message}"`);
            
            try {
                const result = await detectIntentsWithContext(message, phoneNumber);
                logger.info(`Detectado: ${JSON.stringify(result.intents)}`);
                
                if (message.includes('reporte') && result.intents.includes('guia_reportes')) {
                    logger.info('✅ ¡ÉXITO! Detectó guia_reportes correctamente');
                } else if (message.includes('reporte') && !result.intents.includes('guia_reportes')) {
                    logger.error('❌ FALLO: No detectó guia_reportes');
                }
            } catch (error) {
                logger.error(`❌ Error: ${error.message}`);
            }
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
testFix();