#!/usr/bin/env node

/**
 * Script de migración para transicionar del formato de prompts antiguo al nuevo formato de chat
 * Este script permite probar y validar el nuevo servicio antes de hacer el cambio completo
 */

const path = require('path');
const { logger } = require('../src/utils/logger');

// Cargar variables de entorno
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Servicios antiguos y nuevos
const promptServiceV1 = require('../src/services/promptService');
const promptServiceV2 = require('../src/services/promptServiceV2');

// Casos de prueba para validar la migración
const testCases = [
    {
        name: "Detección de intenciones simple",
        message: "Hola, me interesa probar su sistema ERP",
        expectedIntents: ['saludo', 'interes_en_servicio']
    },
    {
        name: "Extracción de entidades",
        message: "Mi nombre es Juan Pérez y mi email es juan@empresa.com",
        expectedEntities: ['nombre', 'email']
    },
    {
        name: "Solicitud de prueba completa",
        message: "Quiero crear una cuenta con usuario admin123 y clave Secure123!",
        expectedIntents: ['solicitud_prueba'],
        expectedEntities: ['usuario', 'clave']
    },
    {
        name: "Confirmación contextual",
        message: "Sí, confirmo los datos",
        expectedIntents: ['confirmacion']
    },
    {
        name: "Consulta técnica",
        message: "No puedo acceder al sistema, me aparece un error",
        expectedIntents: ['soporte_tecnico']
    }
];

// Contexto de prueba para funciones contextuales
const testContext = {
    userProfile: {
        isRegistered: true,
        name: "Juan Pérez",
        email: "juan@empresa.com",
        company: "Tech Solutions SA",
        position: "Gerente de TI"
    },
    knownEntities: {
        nombre: "Juan Pérez",
        email: "juan@empresa.com",
        empresa: "Tech Solutions SA",
        cargo: "Gerente de TI"
    },
    currentTopic: "trial_request",
    contextStrength: 0.8,
    recentMessages: [
        {
            isFromUser: false,
            message: "¡Hola! Soy el asistente virtual de ERP Demo. ¿En qué puedo ayudarte?"
        },
        {
            isFromUser: true,
            message: "Hola, me interesa probar el sistema"
        },
        {
            isFromUser: false,
            message: "¡Excelente! Puedo crear una cuenta de prueba para ti. ¿Cuál es tu nombre completo?"
        },
        {
            isFromUser: true,
            message: "Juan Pérez"
        }
    ],
    recentIntents: ['saludo', 'interes_en_servicio'],
    topicHistory: ['greeting', 'service_interest', 'trial_request']
};

/**
 * Compara los resultados de ambos servicios
 * @param {Object} resultV1 - Resultado del servicio antiguo
 * @param {Object} resultV2 - Resultado del servicio nuevo
 * @returns {Object} - Análisis de las diferencias
 */
function compareResults(resultV1, resultV2) {
    const comparison = {
        isEqual: true,
        differences: [],
        improvements: [],
        regressions: []
    };

    // Comparar intenciones si existen
    if (resultV1.intents && resultV2.intents) {
        const intentsV1 = new Set(resultV1.intents);
        const intentsV2 = new Set(resultV2.intents);
        
        const onlyInV1 = [...intentsV1].filter(x => !intentsV2.has(x));
        const onlyInV2 = [...intentsV2].filter(x => !intentsV1.has(x));
        
        if (onlyInV1.length > 0) {
            comparison.isEqual = false;
            comparison.regressions.push(`Intenciones perdidas: ${onlyInV1.join(', ')}`);
        }
        
        if (onlyInV2.length > 0) {
            comparison.isEqual = false;
            comparison.improvements.push(`Nuevas intenciones detectadas: ${onlyInV2.join(', ')}`);
        }
    }

    // Comparar entidades si es una respuesta de extracción
    if (typeof resultV1 === 'object' && typeof resultV2 === 'object' && 
        !resultV1.intents && !resultV2.intents) {
        const keysV1 = Object.keys(resultV1);
        const keysV2 = Object.keys(resultV2);
        
        const onlyInV1 = keysV1.filter(k => !keysV2.includes(k));
        const onlyInV2 = keysV2.filter(k => !keysV1.includes(k));
        
        if (onlyInV1.length > 0) {
            comparison.isEqual = false;
            comparison.regressions.push(`Entidades perdidas: ${onlyInV1.join(', ')}`);
        }
        
        if (onlyInV2.length > 0) {
            comparison.isEqual = false;
            comparison.improvements.push(`Nuevas entidades detectadas: ${onlyInV2.join(', ')}`);
        }
        
        // Comparar valores de entidades comunes
        const commonKeys = keysV1.filter(k => keysV2.includes(k));
        for (const key of commonKeys) {
            if (resultV1[key] !== resultV2[key]) {
                comparison.differences.push(`${key}: "${resultV1[key]}" → "${resultV2[key]}"`);
            }
        }
    }

    return comparison;
}

/**
 * Ejecuta una prueba individual
 * @param {Object} testCase - Caso de prueba
 * @returns {Object} - Resultados de la prueba
 */
async function runTest(testCase) {
    const results = {
        name: testCase.name,
        message: testCase.message,
        v1: {},
        v2: {},
        comparison: {},
        timing: {}
    };

    try {
        // Probar detección de intenciones si se esperan
        if (testCase.expectedIntents) {
            // V1
            const startV1 = Date.now();
            results.v1.intents = await promptServiceV1.detectIntentions(testCase.message);
            results.timing.v1IntentsMs = Date.now() - startV1;
            
            // V2
            const startV2 = Date.now();
            results.v2.intents = await promptServiceV2.detectIntentions(testCase.message);
            results.timing.v2IntentsMs = Date.now() - startV2;
            
            results.comparison.intents = compareResults(results.v1.intents, results.v2.intents);
        }

        // Probar extracción de entidades si se esperan
        if (testCase.expectedEntities) {
            // V1
            const startV1 = Date.now();
            results.v1.entities = await promptServiceV1.extractEntities(testCase.message);
            results.timing.v1EntitiesMs = Date.now() - startV1;
            
            // V2
            const startV2 = Date.now();
            results.v2.entities = await promptServiceV2.extractEntities(testCase.message);
            results.timing.v2EntitiesMs = Date.now() - startV2;
            
            results.comparison.entities = compareResults(results.v1.entities, results.v2.entities);
        }

        // Calcular mejora de velocidad
        if (results.timing.v1IntentsMs && results.timing.v2IntentsMs) {
            const speedup = ((results.timing.v1IntentsMs - results.timing.v2IntentsMs) / results.timing.v1IntentsMs * 100).toFixed(1);
            results.timing.intentsSpeedup = `${speedup}%`;
        }

        if (results.timing.v1EntitiesMs && results.timing.v2EntitiesMs) {
            const speedup = ((results.timing.v1EntitiesMs - results.timing.v2EntitiesMs) / results.timing.v1EntitiesMs * 100).toFixed(1);
            results.timing.entitiesSpeedup = `${speedup}%`;
        }

    } catch (error) {
        results.error = error.message;
    }

    return results;
}

/**
 * Ejecuta pruebas contextuales
 * @returns {Object} - Resultados de las pruebas contextuales
 */
async function runContextualTests() {
    const results = {
        name: "Pruebas Contextuales",
        tests: []
    };

    // Prueba 1: Detección de intenciones con contexto
    try {
        const message = "Sí, confirmo";
        
        const startV1 = Date.now();
        const v1Result = await promptServiceV1.detectIntentionsWithContext(
            message, 
            testContext
        );
        const v1Time = Date.now() - startV1;
        
        const startV2 = Date.now();
        const v2Result = await promptServiceV2.detectIntentionsWithContext(
            message, 
            testContext
        );
        const v2Time = Date.now() - startV2;
        
        results.tests.push({
            name: "Detección contextual de confirmación",
            message,
            v1: v1Result,
            v2: v2Result,
            comparison: compareResults(v1Result, v2Result),
            timing: {
                v1: v1Time,
                v2: v2Time,
                speedup: `${((v1Time - v2Time) / v1Time * 100).toFixed(1)}%`
            }
        });
    } catch (error) {
        results.tests.push({
            name: "Detección contextual de confirmación",
            error: error.message
        });
    }

    // Prueba 2: Extracción de entidades con contexto
    try {
        const message = "Mi teléfono es 555-1234";
        
        const startV1 = Date.now();
        const v1Result = await promptServiceV1.extractEntitiesWithContext(
            message, 
            testContext
        );
        const v1Time = Date.now() - startV1;
        
        const startV2 = Date.now();
        const v2Result = await promptServiceV2.extractEntitiesWithContext(
            message, 
            testContext
        );
        const v2Time = Date.now() - startV2;
        
        results.tests.push({
            name: "Extracción contextual de nueva entidad",
            message,
            v1: v1Result,
            v2: v2Result,
            comparison: compareResults(v1Result, v2Result),
            timing: {
                v1: v1Time,
                v2: v2Time,
                speedup: `${((v1Time - v2Time) / v1Time * 100).toFixed(1)}%`
            }
        });
    } catch (error) {
        results.tests.push({
            name: "Extracción contextual de nueva entidad",
            error: error.message
        });
    }

    return results;
}

/**
 * Genera un reporte de los resultados
 * @param {Array} results - Resultados de las pruebas
 */
function generateReport(results, contextualResults) {
    console.log('\n' + '='.repeat(80));
    console.log('REPORTE DE MIGRACIÓN - FORMATO DE CHAT PARA PROMPTS');
    console.log('='.repeat(80) + '\n');

    // Resumen de pruebas básicas
    console.log('PRUEBAS BÁSICAS:');
    console.log('-'.repeat(40));
    
    let totalTests = 0;
    let passedTests = 0;
    let improvements = 0;
    let regressions = 0;
    
    results.forEach(result => {
        console.log(`\n✓ ${result.name}`);
        console.log(`  Mensaje: "${result.message}"`);
        
        if (result.error) {
            console.log(`  ❌ Error: ${result.error}`);
            return;
        }
        
        totalTests++;
        
        // Reporte de intenciones
        if (result.comparison.intents) {
            const comp = result.comparison.intents;
            if (comp.isEqual) {
                console.log(`  ✅ Intenciones: Idénticas`);
                passedTests++;
            } else {
                console.log(`  ⚠️  Intenciones: Diferencias detectadas`);
                comp.improvements.forEach(imp => {
                    console.log(`    🔹 ${imp}`);
                    improvements++;
                });
                comp.regressions.forEach(reg => {
                    console.log(`    🔸 ${reg}`);
                    regressions++;
                });
            }
            if (result.timing.intentsSpeedup) {
                const speedup = parseFloat(result.timing.intentsSpeedup);
                const icon = speedup > 0 ? '⚡' : '🐌';
                console.log(`    ${icon} Velocidad: ${Math.abs(speedup)}% ${speedup > 0 ? 'más rápido' : 'más lento'}`);
            }
        }
        
        // Reporte de entidades
        if (result.comparison.entities) {
            const comp = result.comparison.entities;
            if (comp.isEqual && comp.differences.length === 0) {
                console.log(`  ✅ Entidades: Idénticas`);
                passedTests++;
            } else {
                console.log(`  ⚠️  Entidades: Diferencias detectadas`);
                comp.improvements.forEach(imp => {
                    console.log(`    🔹 ${imp}`);
                    improvements++;
                });
                comp.regressions.forEach(reg => {
                    console.log(`    🔸 ${reg}`);
                    regressions++;
                });
                comp.differences.forEach(diff => {
                    console.log(`    📝 ${diff}`);
                });
            }
            if (result.timing.entitiesSpeedup) {
                const speedup = parseFloat(result.timing.entitiesSpeedup);
                const icon = speedup > 0 ? '⚡' : '🐌';
                console.log(`    ${icon} Velocidad: ${Math.abs(speedup)}% ${speedup > 0 ? 'más rápido' : 'más lento'}`);
            }
        }
    });

    // Resumen de pruebas contextuales
    console.log('\n\nPRUEBAS CONTEXTUALES:');
    console.log('-'.repeat(40));
    
    contextualResults.tests.forEach(test => {
        console.log(`\n✓ ${test.name}`);
        console.log(`  Mensaje: "${test.message}"`);
        
        if (test.error) {
            console.log(`  ❌ Error: ${test.error}`);
            return;
        }
        
        if (test.comparison.isEqual) {
            console.log(`  ✅ Resultados idénticos`);
        } else {
            console.log(`  ⚠️  Diferencias detectadas`);
            test.comparison.improvements.forEach(imp => console.log(`    🔹 ${imp}`));
            test.comparison.regressions.forEach(reg => console.log(`    🔸 ${reg}`));
        }
        
        if (test.timing.speedup) {
            const speedup = parseFloat(test.timing.speedup);
            const icon = speedup > 0 ? '⚡' : '🐌';
            console.log(`    ${icon} Velocidad: ${Math.abs(speedup)}% ${speedup > 0 ? 'más rápido' : 'más lento'}`);
        }
    });

    // Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('RESUMEN:');
    console.log('='.repeat(80));
    console.log(`Total de pruebas: ${totalTests}`);
    console.log(`Pruebas idénticas: ${passedTests}`);
    console.log(`Mejoras detectadas: ${improvements}`);
    console.log(`Regresiones detectadas: ${regressions}`);
    console.log(`\nRecomendación: ${regressions === 0 ? '✅ SEGURO PARA MIGRAR' : '⚠️  REVISAR REGRESIONES ANTES DE MIGRAR'}`);
    console.log('='.repeat(80) + '\n');
}

/**
 * Función principal
 */
async function main() {
    try {
        console.log('Iniciando pruebas de migración...\n');

        // Verificar conexión con ambos servicios
        console.log('Verificando conexión con servicios...');
        const v1Connected = await promptServiceV1.testConnection();
        const v2Connected = await promptServiceV2.testConnection();
        
        if (!v1Connected || !v2Connected) {
            console.error('❌ Error: No se pudo conectar con uno o ambos servicios');
            console.error(`  V1 (actual): ${v1Connected ? '✅' : '❌'}`);
            console.error(`  V2 (nuevo): ${v2Connected ? '✅' : '❌'}`);
            process.exit(1);
        }
        
        console.log('✅ Conexión establecida con ambos servicios\n');

        // Obtener información del modelo
        const modelInfo = await promptServiceV2.getModelInfo();
        if (modelInfo) {
            console.log(`Modelo configurado: ${modelInfo.model}`);
            console.log(`API de chat disponible: ${promptServiceV2.CONFIG.useChatAPI ? '✅' : '❌'}\n`);
        }

        // Ejecutar pruebas básicas
        console.log('Ejecutando pruebas básicas...');
        const results = [];
        for (const testCase of testCases) {
            console.log(`  - ${testCase.name}`);
            const result = await runTest(testCase);
            results.push(result);
        }

        // Ejecutar pruebas contextuales
        console.log('\nEjecutando pruebas contextuales...');
        const contextualResults = await runContextualTests();

        // Generar reporte
        generateReport(results, contextualResults);

        // Instrucciones finales
        console.log('\nPRÓXIMOS PASOS:');
        console.log('1. Revisa los resultados anteriores');
        console.log('2. Si todo está correcto, actualiza los imports en tu código:');
        console.log('   - Cambia: require("./promptService")');
        console.log('   - Por: require("./promptServiceV2")');
        console.log('3. Ejecuta las pruebas de integración');
        console.log('4. Monitorea los logs en producción\n');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    main();
}

module.exports = {
    runTest,
    runContextualTests,
    compareResults
};