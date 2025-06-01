const { logger } = require('../utils/logger');
const Intent = require('../models/Intent');

/**
 * Servicio para manejar flujos de tutoriales dinámicamente
 */
class TutorialFlowService {
    constructor() {
        // Cache de flujos para mejorar rendimiento
        this.flowCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutos
    }
    
    /**
     * Obtiene el flujo de tutorial para una intención desde la base de datos
     * @param {string} intentName - Nombre de la intención
     * @returns {Object|null} - Configuración del flujo o null si no existe
     */
    async getTutorialFlow(intentName) {
        try {
            // Verificar cache
            const cached = this.flowCache.get(intentName);
            if (cached && cached.expiry > Date.now()) {
                return cached.data;
            }
            
            // Buscar en base de datos
            const intent = await Intent.findOne({
                name: intentName,
                hasSpecificFlow: true,
                category: 'tutorial'
            });
            
            if (!intent || !intent.flowSteps || intent.flowSteps.length === 0) {
                return null;
            }
            
            const flowData = {
                intentName: intent.name,
                displayName: intent.displayName,
                flowType: intent.flowType,
                steps: intent.flowSteps.sort((a, b) => a.stepNumber - b.stepNumber),
                totalSteps: intent.flowSteps.length
            };
            
            // Actualizar cache
            this.flowCache.set(intentName, {
                data: flowData,
                expiry: Date.now() + this.cacheExpiry
            });
            
            return flowData;
        } catch (error) {
            logger.error(`Error al obtener flujo de tutorial para ${intentName}: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Inicia un flujo de tutorial
     * @param {string} intentName - Nombre de la intención
     * @param {Object} entities - Entidades extraídas
     * @param {Object} user - Usuario
     * @param {string} phoneNumber - Número de teléfono
     * @param {Object} conversationContext - Contexto de conversación
     * @returns {Object} - Estado inicial del flujo
     */
    async startTutorialFlow(intentName, entities, user, phoneNumber, conversationContext) {
        try {
            const flow = await this.getTutorialFlow(intentName);
            
            if (!flow) {
                logger.warn(`No se encontró flujo de tutorial para intención: ${intentName}`);
                return {
                    started: false,
                    message: null
                };
            }
            
            // Estado inicial del flujo
            const flowState = {
                flowType: flow.flowType,
                intentName: flow.intentName,
                currentStep: 0,
                totalSteps: flow.totalSteps,
                startTime: new Date(),
                flowData: {
                    entities: entities,
                    responses: []
                }
            };
            
            // Obtener el primer paso
            const firstStep = flow.steps[0];
            
            return {
                started: true,
                flowState: flowState,
                message: this.formatStepMessage(firstStep, flowState, conversationContext),
                requiresInput: firstStep.requiresInput
            };
        } catch (error) {
            logger.error(`Error al iniciar flujo de tutorial: ${error.message}`);
            return {
                started: false,
                message: null
            };
        }
    }
    
    /**
     * Continúa un flujo de tutorial existente
     * @param {Object} activeFlow - Estado actual del flujo
     * @param {string} userResponse - Respuesta del usuario
     * @param {Object} entities - Entidades extraídas de la respuesta
     * @param {Object} conversationContext - Contexto de conversación
     * @returns {Object} - Siguiente paso del flujo
     */
    async continueFlow(activeFlow, userResponse, entities, conversationContext) {
        try {
            const flow = await this.getTutorialFlow(activeFlow.intentName);
            
            if (!flow) {
                return {
                    completed: true,
                    message: 'El flujo de tutorial ha finalizado.'
                };
            }
            
            // Guardar respuesta del usuario si es necesario
            if (userResponse) {
                activeFlow.flowData.responses.push({
                    step: activeFlow.currentStep,
                    response: userResponse,
                    timestamp: new Date()
                });
            }
            
            // Mover al siguiente paso
            const nextStepIndex = activeFlow.currentStep + 1;
            
            if (nextStepIndex >= flow.totalSteps) {
                // Flujo completado
                return {
                    completed: true,
                    message: this.generateCompletionMessage(activeFlow, conversationContext),
                    flowData: activeFlow.flowData
                };
            }
            
            // Obtener siguiente paso
            const nextStep = flow.steps[nextStepIndex];
            activeFlow.currentStep = nextStepIndex;
            
            return {
                completed: false,
                currentStep: nextStepIndex,
                totalSteps: flow.totalSteps,
                message: this.formatStepMessage(nextStep, activeFlow, conversationContext),
                requiresInput: nextStep.requiresInput,
                flowState: activeFlow
            };
        } catch (error) {
            logger.error(`Error al continuar flujo: ${error.message}`);
            return {
                completed: true,
                message: 'Ha ocurrido un error en el tutorial. Por favor, intenta nuevamente.'
            };
        }
    }
    
    /**
     * Formatea el mensaje de un paso del tutorial
     * @param {Object} step - Paso del tutorial
     * @param {Object} flowState - Estado del flujo
     * @param {Object} context - Contexto de conversación
     * @returns {string} - Mensaje formateado
     */
    formatStepMessage(step, flowState, context) {
        let message = step.message;
        
        // Agregar indicador de progreso
        const progress = `[Paso ${flowState.currentStep + 1} de ${flowState.totalSteps}]\n`;
        
        // Personalizar con nombre si está disponible
        const userName = context.userProfile?.name || context.knownEntities?.nombre;
        if (userName && flowState.currentStep === 0) {
            message = `Hola ${userName}, ${message}`;
        }
        
        return progress + message;
    }
    
    /**
     * Genera mensaje de completación del tutorial
     * @param {Object} flowState - Estado del flujo completado
     * @param {Object} context - Contexto de conversación
     * @returns {string} - Mensaje de completación
     */
    generateCompletionMessage(flowState, context) {
        const userName = context.userProfile?.name || context.knownEntities?.nombre;
        const duration = Math.round((Date.now() - new Date(flowState.startTime)) / 1000);
        
        let message = `¡Tutorial completado! 🎉\n`;
        
        if (userName) {
            message += `${userName}, has `;
        } else {
            message += `Has `;
        }
        
        message += `completado el tutorial en ${duration} segundos.\n`;
        message += `Si necesitas más ayuda, no dudes en preguntar.`;
        
        return message;
    }
    
    /**
     * Limpia el cache de flujos expirados
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.flowCache.entries()) {
            if (value.expiry < now) {
                this.flowCache.delete(key);
            }
        }
    }
}

// Singleton
const tutorialFlowService = new TutorialFlowService();

// Limpiar cache periódicamente
setInterval(() => {
    tutorialFlowService.cleanCache();
}, 60000); // Cada minuto

module.exports = tutorialFlowService;