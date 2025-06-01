require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const Intent = require('../src/models/Intent');

/**
 * Script para corregir las relaciones entre intenciones
 * Ajusta específicamente la relación entre guia_reportes y tutorial_general
 */
async function fixIntentRelationships() {
    try {
        logger.info('🔧 Corrigiendo relaciones entre intenciones...');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB');
        
        // Obtener las intenciones actuales
        const guiaReportes = await Intent.findOne({ name: 'guia_reportes' });
        
        if (!guiaReportes) {
            logger.error('❌ No se encontró la intención guia_reportes');
            return;
        }
        
        logger.info('📊 Analizando intención guia_reportes:');
        
        if (guiaReportes.relatedIntents && guiaReportes.relatedIntents.length > 0) {
            logger.info(`Relaciones actuales: ${JSON.stringify(guiaReportes.relatedIntents)}`);
            
            // Eliminar completamente las relaciones actuales
            const updateResult = await Intent.findOneAndUpdate(
                { name: 'guia_reportes' },
                { $set: { relatedIntents: [] } },
                { new: true }
            );
            
            logger.info('✅ Relaciones entre intenciones eliminadas correctamente');
        } else {
            logger.info('ℹ️ No hay relaciones definidas actualmente');
        }
        
        // Actualizar el modo de detección por patrones
        // Mantener los patrones pero sin relaciones automáticas
        const updatePatternsResult = await Intent.findOneAndUpdate(
            { name: 'guia_reportes' },
            { 
                $set: { 
                    keywordDetectionEnabled: true,
                    // Asegurar que los patrones están correctos para la detección
                    detectionPatterns: [
                        'reporte', 'reportes', 'informe', 'informes', 
                        'crear reporte', 'generar reporte', 'hacer reporte',
                        'crear informe', 'generar informe', 'hacer informe',
                        'como creo un reporte', 'cómo genero reportes',
                        'crear un reporte', 'generar un reporte', 'hacer un reporte'
                    ]
                }
            },
            { new: true }
        );
        
        if (updatePatternsResult) {
            logger.info('✅ Patrones de detección para guia_reportes actualizados');
            logger.info(`Total de patrones: ${updatePatternsResult.detectionPatterns.length}`);
        }
        
        // Actualizar la intención tutorial_general
        const tutorialGeneralResult = await Intent.findOneAndUpdate(
            { name: 'tutorial_general' },
            { 
                $set: { 
                    keywordDetectionEnabled: true,
                    detectionPatterns: [
                        'ayuda', 'tutorial', 'guía', 'enseñar', 'aprender', 
                        'explicar', 'como puedo', 'necesito ayuda', 'ayudame con'
                    ]
                }
            },
            { new: true }
        );
        
        if (tutorialGeneralResult) {
            logger.info('✅ Patrones de detección para tutorial_general actualizados');
            logger.info(`Total de patrones: ${tutorialGeneralResult.detectionPatterns.length}`);
        }
        
        // Verificar casos de prueba
        logger.info('\n🧪 Verificando casos de prueba:');
        const testCases = [
            { message: 'como creo un reporte?', expected: ['guia_reportes'] },
            { message: 'Cómo genero reportes', expected: ['guia_reportes'] },
            { message: 'quiero crear un reporte de ventas', expected: ['guia_reportes'] },
            { message: 'necesito ayuda para crear reportes', expected: ['guia_reportes', 'tutorial_general'] },
            { message: 'hola, como creo un reporte?', expected: ['saludo', 'guia_reportes'] }
        ];
        
        logger.info('\nEs importante que estos casos sean detectados correctamente por el sistema.');
        logger.info('Por favor, ejecuta el script de prueba para verificar los resultados:');
        logger.info('\n  node scripts/test-final-solution.js\n');
        
    } catch (error) {
        logger.error(`❌ Error al corregir relaciones: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar script
fixIntentRelationships();