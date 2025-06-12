/**
 * Demo simple del servicio especializado de detección de intenciones con Ollama
 * Este script muestra cómo utilizar el servicio directamente
 */

require('dotenv').config();
const { logger } = require('../src/utils/logger');
const ollamaIntentService = require('../src/services/ollamaIntentDetectionService');
const { getIntentsForNLP } = require('../src/services/intentService');
const { connectDB } = require('../src/config/database');
const mongoose = require('mongoose');

/**
 * Mensajes de prueba para la demostración
 */
const demoMessages = [
  "Hola, buenos días",
  "Quiero saber cómo crear un reporte de ventas mensual",
  "¿Cuánto cuesta la licencia del sistema?",
  "Estoy teniendo un problema con la facturación",
  "Me gustaría probar el sistema durante 15 días"
];

/**
 * Función principal de demostración
 */
async function runDemo() {
  try {
    logger.info('🚀 DEMO: Detección de Intenciones con Ollama\n');
    
    // Conectar a MongoDB
    await connectDB();
    logger.info('✅ Conectado a MongoDB\n');
    
    // Verificar conexión con Ollama
    logger.info('🔌 Verificando conexión con Ollama...');
    const connected = await ollamaIntentService.testConnection();
    
    if (!connected) {
      logger.error('❌ No se pudo conectar con Ollama. Verifique que esté ejecutándose.');
      process.exit(1);
    }
    
    // Obtener información del modelo
    const modelInfo = await ollamaIntentService.getModelInfo();
    logger.info(`✅ Conectado a Ollama. Usando modelo: ${modelInfo.model}\n`);
    
    // Obtener intenciones disponibles
    const nlpData = await getIntentsForNLP();
    logger.info(`📚 Intenciones disponibles: ${nlpData.supportedIntents.length}`);
    logger.info(`📊 Ejemplos disponibles: ${Object.keys(nlpData.intentExamples).length}\n`);
    
    // Procesar cada mensaje de demostración
    logger.info('🧪 EJEMPLOS DE DETECCIÓN DE INTENCIONES:');
    logger.info('======================================\n');
    
    for (const message of demoMessages) {
      logger.info(`📝 MENSAJE: "${message}"`);
      
      // Iniciar temporizador
      const startTime = Date.now();
      
      // Detectar intenciones
      const result = await ollamaIntentService.detectIntentions(message);
      
      // Calcular tiempo transcurrido
      const elapsed = Date.now() - startTime;
      
      // Mostrar resultados
      logger.info(`✨ INTENCIONES DETECTADAS: ${JSON.stringify(result.intents)}`);
      logger.info(`⏱️ Tiempo de respuesta: ${elapsed}ms\n`);
      
      // Si hay intenciones, mostrar posibles acciones
      if (result.intents && result.intents.length > 0) {
        logger.info('🔍 POSIBLES ACCIONES BASADAS EN INTENCIONES:');
        
        result.intents.forEach(intent => {
          switch(intent) {
            case 'saludo':
              logger.info('  - Responder con un saludo personalizado');
              break;
            case 'guia_reportes':
              logger.info('  - Mostrar tutorial de creación de reportes');
              logger.info('  - Ofrecer plantillas de reportes comunes');
              break;
            case 'consulta_precio':
              logger.info('  - Mostrar información de precios');
              logger.info('  - Ofrecer contacto con ventas');
              break;
            case 'soporte_tecnico':
              logger.info('  - Crear ticket de soporte');
              logger.info('  - Ofrecer documentación relevante');
              break;
            case 'solicitud_prueba':
              logger.info('  - Iniciar flujo de creación de cuenta de prueba');
              logger.info('  - Solicitar datos de contacto');
              break;
            default:
              logger.info(`  - Manejar intención: ${intent}`);
          }
        });
        
        logger.info('');
      }
      
      // Pequeña pausa entre ejemplos
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    logger.info('✅ DEMOSTRACIÓN COMPLETADA\n');
    logger.info('💡 Para usar en producción, configure:');
    logger.info('  - NLP_SERVICE_VERSION=v2 en .env');
    logger.info('  - OLLAMA_INTENT_MODEL=<modelo-preferido> en .env');
    logger.info('\nConsulte OLLAMA_INTENT_MIGRATION.md para más detalles');
    
  } catch (error) {
    logger.error(`❌ Error en la demostración: ${error.message}`);
    console.error(error);
  } finally {
    // Cerrar conexión a MongoDB
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Ejecutar la demostración
runDemo();