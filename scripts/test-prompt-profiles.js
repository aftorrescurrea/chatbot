/**
 * Script para probar el sistema de perfiles de prompt
 * Ejecutar con: node scripts/test-prompt-profiles.js
 */

require('dotenv').config();
const { logger } = require('../src/utils/logger');
const { getPromptProfileForIntents } = require('../src/config/promptProfilesConfig');
const promptServiceV3 = require('../src/services/promptServiceV3');

// Configurar la versión v3 para esta prueba
process.env.PROMPT_SERVICE_VERSION = 'v3';

// Mensajes de prueba para diferentes categorías
const testMessages = {
    support: [
        { 
            message: "Tengo un error al generar reportes, no se muestra la información completa", 
            intents: ["soporte_tecnico", "guia_reportes"]
        },
        { 
            message: "La aplicación se cierra cuando intento imprimir una factura", 
            intents: ["soporte_tecnico", "error_sistema"]
        }
    ],
    credit: [
        { 
            message: "Necesito ver el saldo del cliente Juan Pérez con cédula 123456", 
            intents: ["consultar_saldo_cliente"]
        },
        { 
            message: "Quiero registrar un pago de $50,000 que hizo María López hoy", 
            intents: ["registrar_pago"]
        },
        { 
            message: "Dame el listado de clientes que no han pagado este mes", 
            intents: ["ver_clientes_pendientes"]
        }
    ],
    general: [
        { 
            message: "¿Qué características tiene el sistema de inventario?", 
            intents: ["consulta_caracteristicas", "guia_inventario"]
        },
        { 
            message: "Hola, me gustaría solicitar una prueba del sistema", 
            intents: ["saludo", "solicitud_prueba"]
        }
    ],
    tutorial: [
        { 
            message: "¿Cómo puedo crear un reporte de ventas por vendedor?", 
            intents: ["guia_reportes"]
        },
        { 
            message: "Necesito aprender a crear un nuevo usuario con permisos limitados", 
            intents: ["guia_usuarios", "tutorial_general"]
        }
    ],
    mixed: [
        { 
            message: "Hola, tengo un problema con un reporte y necesito crear un crédito urgente", 
            intents: ["saludo", "soporte_tecnico", "guia_reportes", "crear_credito"]
        },
        { 
            message: "¿Me puedes mostrar cómo ver los clientes pendientes y registrar un pago?", 
            intents: ["tutorial_general", "ver_clientes_pendientes", "registrar_pago"]
        }
    ]
};

// Función para probar la selección de perfiles
async function testProfileSelection() {
    logger.info('=== PRUEBA DE SELECCIÓN DE PERFILES ===');
    
    for (const [category, messages] of Object.entries(testMessages)) {
        logger.info(`\n--- Categoría: ${category.toUpperCase()} ---`);
        
        for (const testCase of messages) {
            const profile = getPromptProfileForIntents(testCase.intents);
            logger.info(`Mensaje: "${testCase.message}"`);
            logger.info(`Intenciones: ${JSON.stringify(testCase.intents)}`);
            logger.info(`Perfil seleccionado: ${profile.intentCategories[0]}`);
            logger.info(`Temperatura: ${profile.temperature}`);
            logger.info('------------------------');
        }
    }
}

// Función para probar generación de respuestas con diferentes perfiles
async function testResponseGeneration() {
    logger.info('\n=== PRUEBA DE GENERACIÓN DE RESPUESTAS ===');
    
    // Crear contexto de conversación simulado
    const conversationContext = {
        currentTopic: 'general',
        contextStrength: 0.7,
        recentMessages: [
            { isFromUser: true, message: "Hola, necesito ayuda" },
            { isFromUser: false, message: "¡Hola! Soy el asistente virtual. ¿En qué puedo ayudarte?" }
        ]
    };
    
    // Datos de usuario simulados
    const userData = {
        name: "Carlos Rodríguez",
        email: "carlos@ejemplo.com",
        company: "Distribuidora XYZ",
        position: "Gerente de Ventas"
    };
    
    // Probar un mensaje de cada categoría
    const categoriesToTest = ['support', 'credit', 'general', 'tutorial'];
    
    for (const category of categoriesToTest) {
        const testCase = testMessages[category][0];
        logger.info(`\n--- Respuesta para categoría: ${category.toUpperCase()} ---`);
        logger.info(`Mensaje: "${testCase.message}"`);
        logger.info(`Intenciones: ${JSON.stringify(testCase.intents)}`);
        
        try {
            // Generar respuesta con el perfil correspondiente
            const response = await promptServiceV3.generateResponse(
                testCase.message,
                testCase.intents,
                {}, // Sin entidades específicas para este test
                userData,
                conversationContext
            );
            
            logger.info('Respuesta generada:');
            logger.info(`"${response}"`);
        } catch (error) {
            logger.error(`Error generando respuesta: ${error.message}`);
        }
        
        logger.info('------------------------');
    }
}

// Función para probar generación de respuesta específica de crédito
async function testCreditResponse() {
    logger.info('\n=== PRUEBA DE RESPUESTA ESPECÍFICA DE CRÉDITO ===');
    
    const testCase = testMessages.credit[0]; // Consulta de saldo
    
    // Datos de crédito simulados
    const creditData = {
        cliente: {
            nombre: "Juan Pérez",
            cedula: "123456",
            telefono: "3001234567",
            ruta: "Ruta 5"
        },
        creditos: [
            {
                id: "CR-2023-001",
                monto: 500000,
                fechaCreacion: "2023-02-15",
                saldoPendiente: 200000,
                ultimoPago: "2023-05-20",
                cuotasMora: 1
            }
        ],
        ultimosMovimientos: [
            { tipo: "pago", fecha: "2023-05-20", monto: 50000 },
            { tipo: "pago", fecha: "2023-04-15", monto: 50000 },
            { tipo: "pago", fecha: "2023-03-15", monto: 50000 }
        ]
    };
    
    logger.info(`Mensaje: "${testCase.message}"`);
    logger.info(`Intenciones: ${JSON.stringify(testCase.intents)}`);
    
    try {
        // Generar respuesta específica de crédito
        const response = await promptServiceV3.generateCreditResponse(
            testCase.message,
            testCase.intents,
            { cliente: "Juan Pérez", cedula: "123456" }, // Entidades extraídas
            creditData,
            { currentTopic: "credit" }
        );
        
        logger.info('Respuesta generada:');
        logger.info(`"${response}"`);
    } catch (error) {
        logger.error(`Error generando respuesta de crédito: ${error.message}`);
    }
}

// Ejecutar las pruebas
async function runTests() {
    try {
        logger.info('Iniciando pruebas del sistema de perfiles de prompt...\n');
        
        // Verificar conexión con Ollama
        const connectionTest = await promptServiceV3.testConnection();
        logger.info(`Conexión con LLM: ${connectionTest.status}`);
        
        if (connectionTest.status === 'OK') {
            await testProfileSelection();
            await testResponseGeneration();
            await testCreditResponse();
        } else {
            logger.error('No se puede continuar sin conexión al LLM.');
        }
        
        logger.info('\nPruebas completadas.');
    } catch (error) {
        logger.error(`Error en las pruebas: ${error.message}`);
    }
}

// Ejecutar todas las pruebas
runTests();