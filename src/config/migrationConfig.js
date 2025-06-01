/**
 * Configuración de migración para el sistema de prompts
 * Permite cambiar entre versiones v1 y v2 de forma centralizada
 */

// Estado de la migración - cambiar a true cuando estés listo para usar v2
const USE_PROMPT_SERVICE_V2 = process.env.USE_PROMPT_SERVICE_V2 === 'true' || false;

// Importar el servicio correcto según la configuración
const promptService = USE_PROMPT_SERVICE_V2 
    ? require('../services/promptServiceV2')
    : require('../services/promptService');

// Configuración adicional para la migración
const migrationConfig = {
    // Activar logging detallado durante la migración
    enableDetailedLogging: true,
    
    // Comparar resultados entre v1 y v2 (útil para validación)
    compareVersions: process.env.COMPARE_PROMPT_VERSIONS === 'true' || false,
    
    // Límite de historial conversacional (para evitar contextos muy largos)
    maxConversationHistory: 10,
    
    // Tiempo máximo de respuesta en ms
    responseTimeout: 3000000,
    
    // Configuración específica para Qwen2.5
    modelConfig: {
        temperature: 0.2,
        maxTokens: 500,
        topP: 0.9,
        topK: 40
    }
};

// Función helper para obtener el servicio de prompts
function getPromptService() {
    if (migrationConfig.enableDetailedLogging && USE_PROMPT_SERVICE_V2) {
        console.log('[MIGRATION] Usando promptServiceV2 con formato de chat');
    }
    return promptService;
}

// Función para validar si el modelo soporta chat API
async function checkChatAPISupport() {
    try {
        const service = USE_PROMPT_SERVICE_V2 ? require('../services/promptServiceV2') : null;
        if (service && service.CONFIG) {
            return service.CONFIG.useChatAPI;
        }
        return false;
    } catch (error) {
        console.error('[MIGRATION] Error verificando soporte de chat API:', error.message);
        return false;
    }
}

module.exports = {
    USE_PROMPT_SERVICE_V2,
    migrationConfig,
    getPromptService,
    checkChatAPISupport,
    promptService // Exportar directamente el servicio configurado
};