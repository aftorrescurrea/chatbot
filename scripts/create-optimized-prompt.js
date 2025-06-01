require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');

/**
 * Script para crear un prompt optimizado y simplificado
 */
async function createOptimizedPrompt() {
    try {
        logger.info('🔧 Creando template de prompt optimizado...\n');
        
        // Conectar a MongoDB
        await connectDB();
        
        // Template optimizado basado en el que funciona
        const optimizedTemplate = `
Eres un asistente especializado en análisis de intenciones para un chatbot de WhatsApp de un sistema {{serviceType}}.

INSTRUCCIONES:
- Analiza el mensaje del usuario
- Detecta TODAS las intenciones presentes basándote en la lista
- Responde SOLO con JSON: {"intents": ["intencion1", "intencion2"]}

INTENCIONES DISPONIBLES:
{{#each supportedIntents}}- {{this}}
{{/each}}

DEFINICIÓN DE INTENCIONES CLAVE:
- guia_reportes: preguntas sobre cómo crear, generar o hacer reportes/informes
- guia_inventario: preguntas sobre gestión de inventario/stock/productos
- guia_facturacion: preguntas sobre facturación/facturas
- guia_usuarios: preguntas sobre gestión de usuarios/permisos
- tutorial_general: solicitudes de ayuda general o tutoriales
- consulta_caracteristicas: preguntas sobre qué hace o incluye el sistema
- solicitud_prueba: cuando quieren probar el sistema
- soporte_tecnico: cuando reportan problemas o errores

EJEMPLOS ESPECÍFICOS:
{{#each intentExamples}}{{#if (isImportantIntent @key)}}
{{@key}}:
{{#each (limitExamples this 5)}}- "{{this}}"
{{/each}}
{{/if}}{{/each}}

Recuerda: detecta TODAS las intenciones presentes, puede haber múltiples.
`;

        logger.info('✅ Template optimizado creado\n');
        
        // Guardar el template optimizado
        const fs = require('fs');
        const path = require('path');
        const templatePath = path.join(__dirname, '..', 'src', 'utils', 'optimizedTemplate.js');
        
        const templateContent = `
/**
 * Template optimizado para detección de intenciones
 */

// Helper para identificar intenciones importantes
const isImportantIntent = (intent) => {
    const important = [
        'guia_reportes', 'guia_inventario', 'guia_facturacion', 
        'guia_usuarios', 'tutorial_general', 'consulta_caracteristicas',
        'solicitud_prueba', 'soporte_tecnico', 'saludo'
    ];
    return important.includes(intent);
};

// Helper para limitar ejemplos
const limitExamples = (examples, limit = 5) => {
    if (!Array.isArray(examples)) return [];
    return examples.slice(0, limit);
};

const optimizedIntentTemplate = \`${optimizedTemplate}\`;

module.exports = {
    optimizedIntentTemplate,
    helpers: {
        isImportantIntent,
        limitExamples
    }
};
`;

        fs.writeFileSync(templatePath, templateContent);
        logger.info(`📝 Template guardado en: ${templatePath}\n`);
        
        // Mostrar cómo se vería el template procesado
        logger.info('📋 Ejemplo de template procesado:');
        logger.info('=====================================\n');
        
        const exampleProcessed = `
Eres un asistente especializado en análisis de intenciones para un chatbot de WhatsApp de un sistema ERP.

INSTRUCCIONES:
- Analiza el mensaje del usuario
- Detecta TODAS las intenciones presentes basándote en la lista
- Responde SOLO con JSON: {"intents": ["intencion1", "intencion2"]}

INTENCIONES DISPONIBLES:
- saludo
- despedida
- guia_reportes
- guia_inventario
- guia_facturacion
- guia_usuarios
- tutorial_general
- consulta_caracteristicas
- solicitud_prueba
- soporte_tecnico
[... más intenciones ...]

DEFINICIÓN DE INTENCIONES CLAVE:
- guia_reportes: preguntas sobre cómo crear, generar o hacer reportes/informes
- guia_inventario: preguntas sobre gestión de inventario/stock/productos
[... más definiciones ...]

EJEMPLOS ESPECÍFICOS:

guia_reportes:
- "Cómo creo un reporte"
- "como creo un reporte?"
- "Cómo genero reportes"
- "quiero hacer un reporte"
- "tutorial reportes"

solicitud_prueba:
- "Quiero probar el sistema"
- "Me gustaría hacer una prueba"
- "Solicito una demo"
[... más ejemplos ...]
`;

        logger.info(exampleProcessed.substring(0, 800) + '\n[... continúa ...]');
        
    } catch (error) {
        logger.error(`❌ Error: ${error.message}`);
    } finally {
        await mongoose.connection.close();
        logger.info('\n✅ Proceso completado');
        process.exit(0);
    }
}

// Ejecutar
createOptimizedPrompt();