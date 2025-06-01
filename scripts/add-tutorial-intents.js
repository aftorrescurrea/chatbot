require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/database');
const { logger } = require('../src/utils/logger');
const Intent = require('../src/models/Intent');

/**
 * Script para agregar nuevas intenciones de tutoriales a la base de datos
 */
async function addTutorialIntents() {
    try {
        logger.info('🚀 Iniciando adición de intenciones de tutoriales...');
        
        // Conectar a MongoDB
        await connectDB();
        logger.info('✅ Conectado a MongoDB');
        
        // Nuevas intenciones de tutoriales
        const tutorialIntents = [
            {
                name: 'tutorial_general',
                displayName: 'Tutorial General',
                description: 'Solicitudes generales de ayuda y tutoriales',
                category: 'tutorial',
                hasSpecificFlow: true,
                flowType: 'tutorial_flow',
                priority: 80,
                examples: [
                    'Cómo uso el sistema',
                    'Cómo empiezo',
                    'Cuáles son los pasos para',
                    'Necesito ayuda para',
                    'Enséñame a',
                    'Tutorial de',
                    'Guía para',
                    'Muéstrame cómo',
                    'Explícame cómo funciona'
                ],
                subIntents: [
                    {
                        name: 'tutorial_basico',
                        keywords: ['empezar', 'inicio', 'primeros pasos', 'básico'],
                        examples: ['cómo empiezo', 'primeros pasos'],
                        description: 'Tutoriales básicos para principiantes'
                    },
                    {
                        name: 'tutorial_avanzado',
                        keywords: ['avanzado', 'configuración', 'personalizar'],
                        examples: ['configuración avanzada', 'personalizar sistema'],
                        description: 'Tutoriales avanzados'
                    }
                ]
            },
            {
                name: 'guia_reportes',
                displayName: 'Guía de Reportes',
                description: 'Tutoriales específicos sobre creación y gestión de reportes',
                category: 'tutorial',
                hasSpecificFlow: true,
                flowType: 'report_tutorial_flow',
                priority: 75,
                examples: [
                    'Cómo creo un reporte',
                    'Cómo genero reportes',
                    'Pasos para hacer un reporte',
                    'Crear informe',
                    'Generar reporte de ventas',
                    'Exportar reporte',
                    'Personalizar reportes',
                    'Cómo hago un informe',
                    'Quiero crear un reporte'
                ],
                flowSteps: [
                    {
                        stepNumber: 1,
                        message: 'Para crear un reporte, primero ingresa al módulo de Reportes desde el menú principal 📊',
                        requiresInput: true
                    },
                    {
                        stepNumber: 2,
                        message: 'Excelente. Ahora selecciona el tipo de reporte que deseas crear: Ventas, Inventario, Clientes o Personalizado',
                        requiresInput: true
                    },
                    {
                        stepNumber: 3,
                        message: 'Perfecto. Define el rango de fechas y los filtros necesarios usando los campos en pantalla',
                        requiresInput: true
                    },
                    {
                        stepNumber: 4,
                        message: 'Muy bien. Haz clic en "Generar Reporte" y espera a que se procese',
                        requiresInput: true
                    },
                    {
                        stepNumber: 5,
                        message: '¡Listo! Ahora puedes exportarlo en PDF, Excel o visualizarlo en pantalla. ¿Te ayudó este tutorial?',
                        requiresInput: false
                    }
                ]
            },
            {
                name: 'guia_inventario',
                displayName: 'Guía de Inventario',
                description: 'Tutoriales sobre gestión de inventario',
                category: 'tutorial',
                hasSpecificFlow: true,
                flowType: 'inventory_tutorial_flow',
                priority: 75,
                examples: [
                    'Cómo gestiono el inventario',
                    'Cómo agrego productos',
                    'Cómo registro entradas',
                    'Gestión de stock',
                    'Control de inventario',
                    'Agregar items al inventario',
                    'Cómo manejo el almacén'
                ]
            },
            {
                name: 'guia_facturacion',
                displayName: 'Guía de Facturación',
                description: 'Tutoriales sobre el proceso de facturación',
                category: 'tutorial',
                hasSpecificFlow: true,
                flowType: 'billing_tutorial_flow',
                priority: 75,
                examples: [
                    'Cómo facturo',
                    'Cómo hago una factura',
                    'Crear factura electrónica',
                    'Proceso de facturación',
                    'Emitir factura',
                    'Generar factura a cliente'
                ]
            },
            {
                name: 'guia_usuarios',
                displayName: 'Guía de Usuarios',
                description: 'Tutoriales sobre gestión de usuarios y permisos',
                category: 'tutorial',
                hasSpecificFlow: true,
                flowType: 'users_tutorial_flow',
                priority: 75,
                examples: [
                    'Cómo agrego usuarios',
                    'Cómo creo un usuario',
                    'Gestión de permisos',
                    'Asignar roles',
                    'Crear cuenta de usuario',
                    'Administrar usuarios'
                ]
            }
        ];
        
        // Insertar o actualizar cada intención
        for (const intentData of tutorialIntents) {
            try {
                const result = await Intent.findOneAndUpdate(
                    { name: intentData.name },
                    intentData,
                    { upsert: true, new: true }
                );
                logger.info(`✅ Intención '${result.displayName}' agregada/actualizada`);
            } catch (error) {
                logger.error(`❌ Error al procesar intención '${intentData.name}': ${error.message}`);
            }
        }
        
        // Mostrar resumen
        const totalIntents = await Intent.countDocuments();
        const tutorialIntentsCount = await Intent.countDocuments({ category: 'tutorial' });
        
        logger.info('\n📊 === RESUMEN ===');
        logger.info(`Total de intenciones: ${totalIntents}`);
        logger.info(`Intenciones de tutorial: ${tutorialIntentsCount}`);
        
    } catch (error) {
        logger.error(`❌ Error durante la migración: ${error.message}`);
        logger.error(error.stack);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('🔌 Conexión a MongoDB cerrada');
        process.exit(0);
    }
}

// Ejecutar migración
addTutorialIntents();