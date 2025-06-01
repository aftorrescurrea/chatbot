require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const Intent = require('../src/models/Intent');

/**
 * Script para corregir y mejorar la detección de intenciones
 */
async function fixIntentDetection() {
    try {
        logger.info('🔧 Corrigiendo detección de intenciones...');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB');
        
        // 1. Actualizar la intención "guia_reportes" con más ejemplos y mejor prioridad
        const guiaReportesUpdate = {
            priority: 50, // Mayor prioridad (menor número = mayor prioridad)
            examples: [
                // Ejemplos existentes
                'Cómo creo un reporte',
                'Cómo genero reportes',
                'Pasos para hacer un reporte',
                'Crear informe',
                'Generar reporte de ventas',
                'Exportar reporte',
                'Personalizar reportes',
                'Cómo hago un informe',
                'Quiero crear un reporte',
                // Nuevos ejemplos más naturales
                'como creo un reporte?',
                'como creo un reporte',
                'cómo crear reportes',
                'como hacer un reporte',
                'como genero un reporte',
                'necesito crear un reporte',
                'quiero hacer un reporte',
                'ayuda con reportes',
                'tutorial reportes',
                'guía de reportes',
                'explicame como hacer reportes',
                'enseñame a crear reportes',
                'como se hacen los reportes',
                'como puedo generar un informe',
                'necesito generar un reporte',
                'quiero sacar un reporte'
            ]
        };
        
        const guiaReportes = await Intent.findOneAndUpdate(
            { name: 'guia_reportes' },
            guiaReportesUpdate,
            { new: true }
        );
        
        if (guiaReportes) {
            logger.info(`✅ Actualizada intención "guia_reportes" con ${guiaReportes.examples.length} ejemplos`);
        }
        
        // 2. Actualizar otras intenciones de tutorial con más ejemplos
        const tutorialUpdates = [
            {
                name: 'tutorial_general',
                priority: 55,
                additionalExamples: [
                    'ayuda',
                    'necesito ayuda',
                    'ayudame',
                    'no sé cómo',
                    'no se como',
                    'explicame',
                    'muéstrame',
                    'tutorial',
                    'guía'
                ]
            },
            {
                name: 'guia_inventario',
                priority: 50,
                additionalExamples: [
                    'como manejo inventario',
                    'como gestiono productos',
                    'como agrego items',
                    'ayuda con inventario'
                ]
            },
            {
                name: 'guia_facturacion',
                priority: 50,
                additionalExamples: [
                    'como hago facturas',
                    'como emito facturas',
                    'ayuda facturacion',
                    'tutorial facturas'
                ]
            },
            {
                name: 'guia_usuarios',
                priority: 50,
                additionalExamples: [
                    'como creo usuarios',
                    'como agrego personas',
                    'ayuda con usuarios',
                    'permisos usuarios'
                ]
            }
        ];
        
        for (const update of tutorialUpdates) {
            const intent = await Intent.findOne({ name: update.name });
            if (intent) {
                // Agregar nuevos ejemplos sin duplicar
                const currentExamples = intent.examples || [];
                const newExamples = [...new Set([...currentExamples, ...update.additionalExamples])];
                
                await Intent.findOneAndUpdate(
                    { name: update.name },
                    { 
                        priority: update.priority,
                        examples: newExamples
                    }
                );
                
                logger.info(`✅ Actualizada intención "${update.name}"`);
            }
        }
        
        // 3. Reducir prioridad de consulta_caracteristicas para evitar conflictos
        await Intent.findOneAndUpdate(
            { name: 'consulta_caracteristicas' },
            { priority: 90 } // Menor prioridad
        );
        logger.info('✅ Ajustada prioridad de "consulta_caracteristicas"');
        
        // 4. Verificar el resultado
        const allIntents = await Intent.getActiveIntents();
        logger.info(`\n📊 Total de intenciones activas: ${allIntents.length}`);
        
        // Mostrar intenciones de tutorial
        const tutorialIntents = await Intent.getByCategory('tutorial');
        logger.info(`\n🎓 Intenciones de tutorial (${tutorialIntents.length}):`);
        tutorialIntents.forEach(intent => {
            logger.info(`  - ${intent.displayName}: ${intent.examples.length} ejemplos, prioridad ${intent.priority}`);
        });
        
    } catch (error) {
        logger.error(`❌ Error durante la corrección: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('\n🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar corrección
fixIntentDetection();