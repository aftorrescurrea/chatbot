require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const Intent = require('../src/models/Intent');

/**
 * Script para actualizar intenciones con patrones de detección y relaciones
 */
async function updateIntentPatterns() {
    try {
        logger.info('🔄 Actualizando intenciones con patrones de detección...');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB');
        
        // Configuración de patrones para guia_reportes
        const reportPatterns = [
            'reporte', 'reportes', 'informe', 'informes', 
            'crear reporte', 'generar reporte', 'hacer reporte',
            'crear informe', 'generar informe', 'hacer informe',
            'como creo un reporte', 'cómo genero reportes',
            'crear un reporte', 'generar un reporte', 'hacer un reporte'
        ];
        
        // Actualizar guia_reportes
        const guiaReportesResult = await Intent.findOneAndUpdate(
            { name: 'guia_reportes' },
            {
                detectionPatterns: reportPatterns,
                keywordDetectionEnabled: true,
                // Solo relacionar con tutorial_general cuando se menciona explícitamente ayuda o tutorial
                relatedIntents: [{
                    intent: 'tutorial_general',
                    condition: 'contains',
                    keywords: ['ayuda', 'tutorial', 'guía', 'guia', 'enseña', 'enseñar', 'explicame']
                }]
            },
            { new: true }
        );
        
        if (guiaReportesResult) {
            logger.info(`✅ Intención 'guia_reportes' actualizada con ${reportPatterns.length} patrones de detección`);
            logger.info('Patrones configurados:');
            reportPatterns.forEach(pattern => {
                logger.info(`  - "${pattern}"`);
            });
        } else {
            logger.warn('⚠️ No se encontró la intención guia_reportes');
        }
        
        // Configuración para otras intenciones de guía
        const intentUpdates = [
            {
                name: 'guia_inventario',
                patterns: ['inventario', 'stock', 'producto', 'productos', 'gestión de inventario']
            },
            {
                name: 'guia_facturacion',
                patterns: ['factura', 'facturas', 'facturación', 'facturar', 'crear factura']
            },
            {
                name: 'guia_usuarios',
                patterns: ['usuario', 'usuarios', 'permisos', 'roles', 'gestión de usuarios']
            },
            {
                name: 'tutorial_general',
                patterns: ['ayuda', 'tutorial', 'guía', 'enseñar', 'aprender', 'explicar']
            }
        ];
        
        for (const update of intentUpdates) {
            const result = await Intent.findOneAndUpdate(
                { name: update.name },
                { 
                    detectionPatterns: update.patterns,
                    keywordDetectionEnabled: true
                },
                { new: true }
            );
            
            if (result) {
                logger.info(`✅ Intención '${update.name}' actualizada con ${update.patterns.length} patrones`);
            } else {
                logger.warn(`⚠️ No se encontró la intención ${update.name}`);
            }
        }
        
        // Resumen
        const updatedIntents = await Intent.countDocuments({ keywordDetectionEnabled: true });
        logger.info(`\n📊 Total de intenciones con detección por palabras clave: ${updatedIntents}`);
        
    } catch (error) {
        logger.error(`❌ Error al actualizar intenciones: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar script
updateIntentPatterns();