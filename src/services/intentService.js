const Intent = require('../models/Intent');
const { logger } = require('../utils/logger');

/**
 * Obtener todas las intenciones
 * @param {boolean} activeOnly - Si solo se quieren las activas
 * @returns {Array} - Array de intenciones
 */
const getAllIntents = async (activeOnly = true) => {
  try {
    if (activeOnly) {
      return await Intent.getActiveIntents();
    }
    return await Intent.find().sort({ priority: 1 });
  } catch (error) {
    logger.error(`Error al obtener intenciones: ${error.message}`);
    throw error;
  }
};

/**
 * Obtener una intención por ID
 * @param {string} id - ID de la intención
 * @returns {Object} - Intención encontrada
 */
const getIntentById = async (id) => {
  try {
    const intent = await Intent.findById(id);
    if (!intent) {
      throw new Error('Intención no encontrada');
    }
    return intent;
  } catch (error) {
    logger.error(`Error al obtener intención por ID: ${error.message}`);
    throw error;
  }
};

/**
 * Obtener una intención por nombre
 * @param {string} name - Nombre de la intención
 * @returns {Object} - Intención encontrada
 */
const getIntentByName = async (name) => {
  try {
    return await Intent.findByName(name);
  } catch (error) {
    logger.error(`Error al obtener intención por nombre: ${error.message}`);
    throw error;
  }
};

/**
 * Crear una nueva intención
 * @param {Object} intentData - Datos de la intención
 * @returns {Object} - Intención creada
 */
const createIntent = async (intentData) => {
  try {
    const intent = new Intent(intentData);
    await intent.save();
    logger.info(`Intención creada: ${intent.name}`);
    return intent;
  } catch (error) {
    logger.error(`Error al crear intención: ${error.message}`);
    throw error;
  }
};

/**
 * Actualizar una intención
 * @param {string} id - ID de la intención
 * @param {Object} updateData - Datos a actualizar
 * @returns {Object} - Intención actualizada
 */
const updateIntent = async (id, updateData) => {
  try {
    const intent = await Intent.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!intent) {
      throw new Error('Intención no encontrada');
    }
    
    logger.info(`Intención actualizada: ${intent.name}`);
    return intent;
  } catch (error) {
    logger.error(`Error al actualizar intención: ${error.message}`);
    throw error;
  }
};

/**
 * Eliminar una intención (soft delete)
 * @param {string} id - ID de la intención
 * @returns {Object} - Intención desactivada
 */
const deleteIntent = async (id) => {
  try {
    const intent = await Intent.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    
    if (!intent) {
      throw new Error('Intención no encontrada');
    }
    
    logger.info(`Intención desactivada: ${intent.name}`);
    return intent;
  } catch (error) {
    logger.error(`Error al eliminar intención: ${error.message}`);
    throw error;
  }
};

/**
 * Agregar ejemplos a una intención
 * @param {string} id - ID de la intención
 * @param {Array} examples - Nuevos ejemplos
 * @returns {Object} - Intención actualizada
 */
const addExamples = async (id, examples) => {
  try {
    const intent = await Intent.findById(id);
    if (!intent) {
      throw new Error('Intención no encontrada');
    }
    
    // Agregar ejemplos únicos
    const uniqueExamples = examples.filter(ex => !intent.examples.includes(ex));
    intent.examples.push(...uniqueExamples);
    
    await intent.save();
    logger.info(`${uniqueExamples.length} ejemplos agregados a la intención: ${intent.name}`);
    return intent;
  } catch (error) {
    logger.error(`Error al agregar ejemplos: ${error.message}`);
    throw error;
  }
};

/**
 * Obtener las intenciones formateadas para el servicio NLP
 * @returns {Object} - Objeto con intenciones y ejemplos
 */
const getIntentsForNLP = async () => {
  try {
    const intents = await Intent.getActiveIntents();
    
    const supportedIntents = intents.map(intent => intent.name);
    const intentExamples = {};
    const conversationExamples = [];
    const detectionPatterns = {};
    const intentRelationships = {};
    
    intents.forEach(intent => {
      // Ejemplos para la intención
      intentExamples[intent.name] = intent.examples;
      
      // Patrones de detección si están definidos
      if (intent.detectionPatterns && intent.detectionPatterns.length > 0) {
        detectionPatterns[intent.name] = intent.detectionPatterns;
      }
      
      // Relaciones entre intenciones
      if (intent.relatedIntents && intent.relatedIntents.length > 0) {
        intentRelationships[intent.name] = intent.relatedIntents;
      }
      
      // Generar ejemplos de conversación basados en los ejemplos
      if (intent.examples.length > 0) {
        conversationExamples.push({
          user: intent.examples[0],
          assistant: `Detectar intenciones: ${intent.name}`
        });
      }
    });
    
    return {
      supportedIntents,
      intentExamples,
      conversationExamples,
      detectionPatterns,
      intentRelationships
    };
  } catch (error) {
    logger.error(`Error al obtener intenciones para NLP: ${error.message}`);
    throw error;
  }
};

/**
 * Importar intenciones desde la configuración existente
 * @param {Object} intentConfig - Configuración de intenciones
 * @returns {Array} - Intenciones importadas
 */
const importIntentsFromConfig = async (intentConfig) => {
  try {
    const imported = [];
    
    for (const intentName of intentConfig.supportedIntents) {
      const existingIntent = await Intent.findByName(intentName);
      
      if (!existingIntent) {
        const examples = intentConfig.intentExamples[intentName] || [];
        const displayName = intentName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        const intent = await createIntent({
          name: intentName,
          displayName: displayName,
          examples: examples,
          priority: intentConfig.supportedIntents.indexOf(intentName) + 1
        });
        
        imported.push(intent);
      }
    }
    
    logger.info(`${imported.length} intenciones importadas`);
    return imported;
  } catch (error) {
    logger.error(`Error al importar intenciones: ${error.message}`);
    throw error;
  }
};

/**
 * Actualizar patrones de detección para una intención
 * @param {string} id - ID de la intención
 * @param {Array} patterns - Nuevos patrones de detección
 * @returns {Object} - Intención actualizada
 */
const updateDetectionPatterns = async (id, patterns) => {
  try {
    if (!Array.isArray(patterns)) {
      throw new Error('Los patrones deben ser un array de strings');
    }

    const intent = await Intent.findByIdAndUpdate(
      id,
      {
        detectionPatterns: patterns,
        keywordDetectionEnabled: patterns.length > 0 // Habilitar automáticamente si hay patrones
      },
      { new: true, runValidators: true }
    );
    
    if (!intent) {
      throw new Error('Intención no encontrada');
    }
    
    logger.info(`Patrones de detección actualizados para: ${intent.name}`);
    return intent;
  } catch (error) {
    logger.error(`Error al actualizar patrones: ${error.message}`);
    throw error;
  }
};

/**
 * Actualizar estado de detección por palabras clave
 * @param {string} id - ID de la intención
 * @param {boolean} enabled - Estado a establecer
 * @returns {Object} - Intención actualizada
 */
const updateKeywordDetection = async (id, enabled) => {
  try {
    const intent = await Intent.findByIdAndUpdate(
      id,
      { keywordDetectionEnabled: enabled },
      { new: true }
    );
    
    if (!intent) {
      throw new Error('Intención no encontrada');
    }
    
    logger.info(`Detección por palabras clave ${enabled ? 'habilitada' : 'deshabilitada'} para: ${intent.name}`);
    return intent;
  } catch (error) {
    logger.error(`Error al actualizar estado de detección: ${error.message}`);
    throw error;
  }
};

/**
 * Actualizar relaciones entre intenciones
 * @param {string} id - ID de la intención
 * @param {Array} relations - Relaciones a establecer
 * @returns {Object} - Intención actualizada
 */
const updateIntentRelations = async (id, relations) => {
  try {
    if (!Array.isArray(relations)) {
      throw new Error('Las relaciones deben ser un array');
    }

    // Validar estructura de relaciones
    for (const relation of relations) {
      if (!relation.intent) {
        throw new Error('Cada relación debe tener un campo "intent"');
      }
      if (!relation.condition) {
        throw new Error('Cada relación debe tener un campo "condition"');
      }
      if (relation.condition === 'contains' && (!relation.keywords || !Array.isArray(relation.keywords))) {
        throw new Error('Las relaciones con condición "contains" deben tener un array de palabras clave');
      }
    }

    const intent = await Intent.findByIdAndUpdate(
      id,
      { relatedIntents: relations },
      { new: true, runValidators: true }
    );
    
    if (!intent) {
      throw new Error('Intención no encontrada');
    }
    
    logger.info(`Relaciones actualizadas para: ${intent.name}`);
    return intent;
  } catch (error) {
    logger.error(`Error al actualizar relaciones: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getAllIntents,
  getIntentById,
  getIntentByName,
  createIntent,
  updateIntent,
  deleteIntent,
  addExamples,
  getIntentsForNLP,
  importIntentsFromConfig,
  updateDetectionPatterns,
  updateKeywordDetection,
  updateIntentRelations
};