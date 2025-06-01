require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const { getIntentsForNLP } = require('../src/services/intentService');

/**
 * Script para verificar y corregir el formato del prompt
 */
async function fixPromptTemplate() {
    try {
        logger.info('🔧 Verificando formato del prompt...\n');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB\n');
        
        // Obtener datos de intenciones
        const nlpData = await getIntentsForNLP();
        
        // Verificar el formato de los ejemplos
        logger.info('📊 Verificando formato de ejemplos:');
        logger.info('=====================================\n');
        
        // Mostrar cómo se ven los ejemplos de guia_reportes
        if (nlpData.intentExamples['guia_reportes']) {
            const examples = nlpData.intentExamples['guia_reportes'];
            logger.info(`Tipo de dato: ${typeof examples}`);
            logger.info(`Es array: ${Array.isArray(examples)}`);
            logger.info(`Cantidad de ejemplos: ${examples.length}\n`);
            
            logger.info('Primeros 5 ejemplos (raw):');
            examples.slice(0, 5).forEach((ex, i) => {
                logger.info(`  ${i + 1}. ${JSON.stringify(ex)}`);
            });
        }
        
        // Crear una versión corregida del template
        logger.info('\n📝 Template correcto para Handlebars:');
        logger.info('=====================================');
        
        const correctTemplate = `
### EJEMPLOS DE INTENCIONES ###
{{#each intentExamples}}
**{{@key}}**: 
{{#each this}}
- "{{this}}"
{{/each}}
{{/each}}
`;
        
        logger.info(correctTemplate);
        
        // Probar el renderizado
        const Handlebars = require('handlebars');
        const testData = {
            intentExamples: {
                'guia_reportes': [
                    'Cómo creo un reporte',
                    'como creo un reporte?',
                    'Cómo genero reportes'
                ],
                'saludo': [
                    'Hola',
                    'Buenos días'
                ]
            }
        };
        
        const template = Handlebars.compile(correctTemplate);
        const rendered = template(testData);
        
        logger.info('\n✅ Resultado del renderizado de prueba:');
        logger.info('======================================');
        logger.info(rendered);
        
        // Verificar si el problema está en renderTemplate
        const { renderTemplate } = require('../src/utils/promptTemplates');
        const renderedWithUtil = renderTemplate(correctTemplate, testData);
        
        logger.info('\n📋 Renderizado con renderTemplate utility:');
        logger.info('=========================================');
        logger.info(renderedWithUtil);
        
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

// Ejecutar fix
fixPromptTemplate();