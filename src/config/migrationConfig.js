/**
 * Configuración de migración para el sistema de prompts
 * Permite cambiar entre versiones v1, v2 y v3 de forma centralizada
 */

// Estado de la migración - elegir la versión a utilizar
const PROMPT_SERVICE_VERSION = process.env.PROMPT_SERVICE_VERSION || 'v1';

// Determinar qué servicio usar según la versión configurada
let promptService;
switch (PROMPT_SERVICE_VERSION) {
    case 'v3':
        promptService = require('../services/promptServiceV3');
        break;
    case 'v2':
        promptService = require('../services/promptServiceV2');
        break;
    default:
        promptService = require('../services/promptService');
        break;
}

// Configuración adicional para la migración
const migrationConfig = {
    // Activar logging detallado durante la migración
    enableDetailedLogging: true,
    
    // Comparar resultados entre versiones (útil para validación)
    compareVersions: process.env.COMPARE_PROMPT_VERSIONS === 'true' || false,
    
    // Límite de historial conversacional (para evitar contextos muy largos)
    maxConversationHistory: 10,
    
    // Tiempo máximo de respuesta en ms
    responseTimeout: 3000000,
    
    // Configuración específica para el modelo
    modelConfig: {
        temperature: 0.2,
        maxTokens: 500,
        topP: 0.9,
        topK: 40
    },
    
    // Características específicas de cada versión
    features: {
        v1: {
            contextualAwareness: true,
            templateRendering: true,
            retryMechanism: true
        },
        v2: {
            chatFormat: true,
            improvedContextHandling: true,
            enhancedPrompts: true
        },
        v3: {
            dynamicProfiles: true,
            intentBasedPrompts: true,
            domainSpecificResponses: true
        }
    }
};

// Función helper para obtener el servicio de prompts
function getPromptService() {
    if (migrationConfig.enableDetailedLogging) {
        console.log(`[MIGRATION] Usando promptService${PROMPT_SERVICE_VERSION}`);
        
        if (PROMPT_SERVICE_VERSION === 'v3') {
            console.log('[MIGRATION] Activado sistema de perfiles dinámicos por intención');
        } else if (PROMPT_SERVICE_VERSION === 'v2') {
            console.log('[MIGRATION] Usando formato de chat API');
        }
    }
    return promptService;
}

// Función para validar si el modelo soporta chat API
async function checkChatAPISupport() {
    try {
        if (promptService && promptService.CONFIG) {
            return promptService.CONFIG.useChatAPI || false;
        }
        return false;
    } catch (error) {
        console.error('[MIGRATION] Error verificando soporte de chat API:', error.message);
        return false;
    }
}

// Función para validar si está habilitado el sistema de perfiles
async function checkProfilesSupport() {
    try {
        if (PROMPT_SERVICE_VERSION === 'v3' && promptService && promptService.CONFIG) {
            return promptService.CONFIG.usePromptProfiles || false;
        }
        return false;
    } catch (error) {
        console.error('[MIGRATION] Error verificando soporte de perfiles:', error.message);
        return false;
    }
}

module.exports = {
    PROMPT_SERVICE_VERSION,
    migrationConfig,
    getPromptService,
    checkChatAPISupport,
    checkProfilesSupport,
    promptService // Exportar directamente el servicio configurado
};