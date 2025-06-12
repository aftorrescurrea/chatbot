/**
 * Script para probar el perfil especializado de NLP
 * Este script muestra cómo el perfil detallado mejora la detección de intenciones
 */

require('dotenv').config();
const { logger } = require('../src/utils/logger');
const { connectDB } = require('../src/config/database');
const mongoose = require('mongoose');
const { getIntentsForNLP } = require('../src/services/intentService');
const ollamaIntentService = require('../src/services/ollamaIntentDetectionService');
const { getNlpDetectionProfile } = require('../src/config/promptProfilesConfig');

// Mensajes de prueba para comparación
const testMessages = [
  { 
    message: "Quiero saber cómo hacer un reporte detallado con gráficos", 
    expectedIntents: ["guia_reportes"]
  },
  { 
    message: "Estoy intentando crear un inventario pero me sale error 404", 
    expectedIntents: ["guia_inventario", "soporte_tecnico"]
  },
  { 
    message: "Sí, soy el gerente de la empresa XYZ y necesito crear facturas", 
    expectedIntents: ["confirmacion", "guia_facturacion"]
  },
  { 
    message: "Me gustaría saber si tienen algún tutorial sobre cómo usar esta función", 
    expectedIntents: ["tutorial_general"]
  }
];

/**
 * Función principal para probar el perfil NLP
 */
async function testNlpProfile() {
  try {
    logger.info('🧪 Prueba del perfil especializado de NLP para detección de intenciones');
    
    // Conectar a la base de datos
    await connectDB();
    logger.info('✅ Conectado a MongoDB');
    
    // Obtener perfil NLP
    const profile = getNlpDetectionProfile();
    logger.info(`ℹ️ Perfil NLP cargado: temperatura=${profile.temperature}, modelo=${profile.model || 'default'}`);
    
    // Verificar conexión con Ollama
    const connected = await ollamaIntentService.testConnection();
    if (!connected) {
      logger.error('❌ No se pudo conectar con Ollama');
      process.exit(1);
    }
    
    // Obtener datos de intenciones
    const nlpData = await getIntentsForNLP();
    
    // Ejecutar pruebas
    logger.info('\n🔍 Probando mensajes con el perfil especializado...\n');
    
    for (const test of testMessages) {
      logger.info(`Mensaje: "${test.message}"`);
      logger.info(`Intenciones esperadas: ${JSON.stringify(test.expectedIntents)}`);
      
      // Generar prompt con perfil especializado
      const prompt = ollamaIntentService.createOptimizedPrompt(test.message, nlpData);
      logger.info(`Longitud del prompt: ${prompt.length} caracteres`);
      
      // Mostrar extracto del prompt (primeras 100 y últimas 100 caracteres)
      logger.info(`Inicio del prompt: ${prompt.substring(0, 100)}...`);
      logger.info(`Final del prompt: ...${prompt.substring(prompt.length - 100)}`);
      
      // Detectar intenciones
      const startTime = Date.now();
      const result = await ollamaIntentService.detectIntentions(test.message);
      const endTime = Date.now();
      
      // Mostrar resultados
      logger.info(`Intenciones detectadas: ${JSON.stringify(result.intents)}`);
      logger.info(`Tiempo de respuesta: ${endTime - startTime}ms`);
      
      // Calcular precisión
      const correctIntents = test.expectedIntents.filter(intent => 
        result.intents.includes(intent)
      ).length;
      
      const precision = correctIntents / test.expectedIntents.length;
      logger.info(`Precisión: ${(precision * 100).toFixed(2)}%`);
      
      // Separador para la siguiente prueba
      logger.info('\n' + '-'.repeat(80) + '\n');
    }
    
    // Mostrar ejemplo completo de prompt
    logger.info('📋 EJEMPLO COMPLETO DE PROMPT CON PERFIL ESPECIALIZADO:');
    logger.info('=======================================================\n');
    
    const samplePrompt = ollamaIntentService.createOptimizedPrompt(
      "Necesito ayuda con la creación de reportes y facturas", 
      nlpData
    );
    
    // Limitar la longitud del prompt si es muy largo
    if (samplePrompt.length > 2000) {
      logger.info(samplePrompt.substring(0, 2000) + '...\n[Prompt truncado por longitud]');
    } else {
      logger.info(samplePrompt);
    }
    
    logger.info('\n✅ Pruebas completadas');
    
  } catch (error) {
    logger.error(`❌ Error en pruebas: ${error.message}`);
    console.error(error);
  } finally {
    // Cerrar conexión a MongoDB
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Ejecutar pruebas
testNlpProfile();