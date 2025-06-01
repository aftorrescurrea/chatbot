require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { getIntentsForNLP } = require('../src/services/intentService');
const { renderTemplate } = require('../src/utils/promptTemplates');
const { baseTemplates } = require('../src/utils/promptTemplates');
const fetch = require('node-fetch');

/**
 * Script para debuggear exactamente qué se envía a Ollama
 */
async function debugOllamaRequest() {
    try {
        logger.info('🔍 Debug detallado de request a Ollama...\n');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB\n');
        
        // Obtener datos de intenciones
        const nlpData = await getIntentsForNLP();
        
        // Mensaje de prueba
        const testMessage = "como creo un reporte?";
        
        // Generar el prompt exacto
        const variables = {
            supportedIntents: nlpData.supportedIntents,
            intentExamples: nlpData.intentExamples,
            conversationExamples: nlpData.conversationExamples,
            serviceType: 'ERP'
        };
        
        const systemPrompt = renderTemplate(baseTemplates['intent-detection'], variables);
        
        // Mostrar el prompt completo
        logger.info('📄 PROMPT COMPLETO GENERADO:');
        logger.info('===========================\n');
        logger.info(systemPrompt);
        logger.info('\n===========================\n');
        
        // Verificar específicamente la sección de guia_reportes
        const guiaReportesMatch = systemPrompt.match(/\*\*guia_reportes\*\*:[\s\S]*?(?=\*\*|###|$)/);
        if (guiaReportesMatch) {
            logger.info('✅ Sección guia_reportes encontrada:');
            logger.info(guiaReportesMatch[0]);
        } else {
            logger.error('❌ NO se encontró sección guia_reportes en el prompt');
        }
        
        // Construir el request exacto
        const requestBody = {
            model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
            prompt: systemPrompt + '\n\nUsuario: "' + testMessage + '"\nAsistente:',
            stream: false,
            options: {
                temperature: 0.2,
                top_p: 0.9,
                top_k: 40
            }
        };
        
        logger.info('\n📤 REQUEST BODY A OLLAMA:');
        logger.info('========================');
        logger.info(JSON.stringify(requestBody, null, 2).substring(0, 1000) + '...');
        
        // Hacer el request manualmente
        logger.info('\n🤖 Enviando request manual a Ollama...');
        
        try {
            const response = await fetch('http://172.17.0.2:11434/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                timeout: 300000 // 5 minutos
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            logger.info('\n✅ RESPUESTA DE OLLAMA:');
            logger.info('======================');
            logger.info(result.response);
            
            // Intentar parsear la respuesta
            try {
                const jsonMatch = result.response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    logger.info('\n📊 RESPUESTA PARSEADA:');
                    logger.info(JSON.stringify(parsed, null, 2));
                    
                    if (parsed.intents && parsed.intents.includes('guia_reportes')) {
                        logger.info('\n🎉 ¡ÉXITO! Detectó guia_reportes');
                    } else {
                        logger.error('\n❌ NO detectó guia_reportes');
                    }
                }
            } catch (parseError) {
                logger.error('Error al parsear respuesta JSON:', parseError.message);
            }
            
        } catch (error) {
            logger.error(`\n❌ Error en request a Ollama: ${error.message}`);
        }
        
        // Probar con un prompt más simple y directo
        logger.info('\n\n🔄 PROBANDO CON PROMPT SIMPLIFICADO');
        logger.info('====================================\n');
        
        const simplePrompt = `Eres un asistente que detecta intenciones. 

INTENCIONES DISPONIBLES:
- guia_reportes: cuando el usuario pregunta cómo crear, generar o hacer reportes
- consulta_caracteristicas: cuando pregunta sobre características del sistema
- saludo: cuando saluda

Ejemplos para guia_reportes:
- "como creo un reporte?"
- "Cómo genero reportes"
- "quiero hacer un informe"

Responde SOLO con JSON en formato: {"intents": ["nombre_intencion"]}

Usuario: "${testMessage}"
Respuesta:`;

        const simpleRequest = {
            model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
            prompt: simplePrompt,
            stream: false,
            options: {
                temperature: 0.1
            }
        };
        
        logger.info('Prompt simplificado:');
        logger.info(simplePrompt);
        
        try {
            const simpleResponse = await fetch('http://172.17.0.2:11434/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(simpleRequest),
                timeout: 300000
            });
            
            const simpleResult = await simpleResponse.json();
            
            logger.info('\n✅ RESPUESTA AL PROMPT SIMPLIFICADO:');
            logger.info(simpleResult.response);
            
        } catch (error) {
            logger.error(`Error con prompt simplificado: ${error.message}`);
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

// Ejecutar debug
debugOllamaRequest();