const intentService = require('../services/intentService');
const { logger } = require('../utils/logger');

/**
 * Obtener todas las intenciones
 */
const getAllIntents = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const intents = await intentService.getAllIntents(!includeInactive);
    
    res.json({
      success: true,
      count: intents.length,
      data: intents
    });
  } catch (error) {
    logger.error(`Error en getAllIntents controller: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener las intenciones',
      message: error.message
    });
  }
};

/**
 * Obtener una intención por ID
 */
const getIntentById = async (req, res) => {
  try {
    const { id } = req.params;
    const intent = await intentService.getIntentById(id);
    
    res.json({
      success: true,
      data: intent
    });
  } catch (error) {
    logger.error(`Error en getIntentById controller: ${error.message}`);
    const status = error.message === 'Intención no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Crear una nueva intención
 */
const createIntent = async (req, res) => {
  try {
    const { name, displayName, description, examples, priority, metadata } = req.body;
    
    // Validación básica
    if (!name || !displayName || !examples || examples.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: name, displayName y examples son obligatorios'
      });
    }
    
    const intent = await intentService.createIntent({
      name,
      displayName,
      description,
      examples,
      priority,
      metadata
    });
    
    res.status(201).json({
      success: true,
      data: intent,
      message: 'Intención creada exitosamente'
    });
  } catch (error) {
    logger.error(`Error en createIntent controller: ${error.message}`);
    const status = error.code === 11000 ? 409 : 500; // 409 para duplicados
    res.status(status).json({
      success: false,
      error: error.code === 11000 
        ? 'Ya existe una intención con ese nombre' 
        : 'Error al crear la intención',
      message: error.message
    });
  }
};

/**
 * Actualizar una intención
 */
const updateIntent = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Eliminar campos que no deben actualizarse directamente
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    
    const intent = await intentService.updateIntent(id, updateData);
    
    res.json({
      success: true,
      data: intent,
      message: 'Intención actualizada exitosamente'
    });
  } catch (error) {
    logger.error(`Error en updateIntent controller: ${error.message}`);
    const status = error.message === 'Intención no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Eliminar una intención (soft delete)
 */
const deleteIntent = async (req, res) => {
  try {
    const { id } = req.params;
    const intent = await intentService.deleteIntent(id);
    
    res.json({
      success: true,
      data: intent,
      message: 'Intención desactivada exitosamente'
    });
  } catch (error) {
    logger.error(`Error en deleteIntent controller: ${error.message}`);
    const status = error.message === 'Intención no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Agregar ejemplos a una intención
 */
const addExamples = async (req, res) => {
  try {
    const { id } = req.params;
    const { examples } = req.body;
    
    if (!examples || !Array.isArray(examples) || examples.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de ejemplos'
      });
    }
    
    const intent = await intentService.addExamples(id, examples);
    
    res.json({
      success: true,
      data: intent,
      message: `${examples.length} ejemplos agregados exitosamente`
    });
  } catch (error) {
    logger.error(`Error en addExamples controller: ${error.message}`);
    const status = error.message === 'Intención no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Importar intenciones desde la configuración
 */
const importIntents = async (req, res) => {
  try {
    const { intentConfig } = require('../config/promptConfig');
    const imported = await intentService.importIntentsFromConfig(intentConfig);
    
    res.json({
      success: true,
      count: imported.length,
      data: imported,
      message: `${imported.length} intenciones importadas exitosamente`
    });
  } catch (error) {
    logger.error(`Error en importIntents controller: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al importar intenciones',
      message: error.message
    });
  }
};

/**
 * Obtener intenciones formateadas para NLP
 */
const getIntentsForNLP = async (req, res) => {
  try {
    const nlpData = await intentService.getIntentsForNLP();
    
    res.json({
      success: true,
      data: nlpData
    });
  } catch (error) {
    logger.error(`Error en getIntentsForNLP controller: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener intenciones para NLP',
      message: error.message
    });
  }
};

/**
 * Actualizar patrones de detección para una intención
 */
const updateDetectionPatterns = async (req, res) => {
  try {
    const { id } = req.params;
    const { patterns } = req.body;
    
    if (!patterns || !Array.isArray(patterns)) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de patrones'
      });
    }
    
    const intent = await intentService.updateDetectionPatterns(id, patterns);
    
    res.json({
      success: true,
      data: intent,
      message: `${patterns.length} patrones de detección actualizados`
    });
  } catch (error) {
    logger.error(`Error en updateDetectionPatterns controller: ${error.message}`);
    const status = error.message === 'Intención no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Actualizar estado de detección por palabras clave
 */
const updateKeywordDetection = async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    
    if (enabled === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el campo "enabled" (boolean)'
      });
    }
    
    const intent = await intentService.updateKeywordDetection(id, enabled);
    
    res.json({
      success: true,
      data: intent,
      message: `Detección por palabras clave ${enabled ? 'habilitada' : 'deshabilitada'}`
    });
  } catch (error) {
    logger.error(`Error en updateKeywordDetection controller: ${error.message}`);
    const status = error.message === 'Intención no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Actualizar relaciones entre intenciones
 */
const updateIntentRelations = async (req, res) => {
  try {
    const { id } = req.params;
    const { relations } = req.body;
    
    if (!relations || !Array.isArray(relations)) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de relaciones'
      });
    }
    
    const intent = await intentService.updateIntentRelations(id, relations);
    
    res.json({
      success: true,
      data: intent,
      message: `${relations.length} relaciones actualizadas`
    });
  } catch (error) {
    logger.error(`Error en updateIntentRelations controller: ${error.message}`);
    const status = error.message === 'Intención no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getAllIntents,
  getIntentById,
  createIntent,
  updateIntent,
  deleteIntent,
  addExamples,
  importIntents,
  getIntentsForNLP,
  updateDetectionPatterns,
  updateKeywordDetection,
  updateIntentRelations
};