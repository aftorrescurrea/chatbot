const entityService = require('../services/entityService');
const { logger } = require('../utils/logger');

/**
 * Obtener todas las entidades
 */
const getAllEntities = async (req, res) => {
  try {
    const { includeInactive, type } = req.query;
    let entities;
    
    if (type) {
      entities = await entityService.getEntitiesByType(type);
    } else {
      entities = await entityService.getAllEntities(!includeInactive);
    }
    
    res.json({
      success: true,
      count: entities.length,
      data: entities
    });
  } catch (error) {
    logger.error(`Error en getAllEntities controller: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener las entidades',
      message: error.message
    });
  }
};

/**
 * Obtener una entidad por ID
 */
const getEntityById = async (req, res) => {
  try {
    const { id } = req.params;
    const entity = await entityService.getEntityById(id);
    
    res.json({
      success: true,
      data: entity
    });
  } catch (error) {
    logger.error(`Error en getEntityById controller: ${error.message}`);
    const status = error.message === 'Entidad no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Crear una nueva entidad
 */
const createEntity = async (req, res) => {
  try {
    const { name, displayName, description, type, examples, patterns, validators, metadata } = req.body;
    
    // Validación básica
    if (!name || !displayName || !examples || examples.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: name, displayName y examples son obligatorios'
      });
    }
    
    // Validar formato de ejemplos
    const validExamples = examples.every(ex => 
      ex.text && ex.value && typeof ex.text === 'string' && typeof ex.value === 'string'
    );
    
    if (!validExamples) {
      return res.status(400).json({
        success: false,
        error: 'Los ejemplos deben tener formato: { text: string, value: string }'
      });
    }
    
    const entity = await entityService.createEntity({
      name,
      displayName,
      description,
      type,
      examples,
      patterns,
      validators,
      metadata
    });
    
    res.status(201).json({
      success: true,
      data: entity,
      message: 'Entidad creada exitosamente'
    });
  } catch (error) {
    logger.error(`Error en createEntity controller: ${error.message}`);
    const status = error.code === 11000 ? 409 : 500; // 409 para duplicados
    res.status(status).json({
      success: false,
      error: error.code === 11000 
        ? 'Ya existe una entidad con ese nombre' 
        : 'Error al crear la entidad',
      message: error.message
    });
  }
};

/**
 * Actualizar una entidad
 */
const updateEntity = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Eliminar campos que no deben actualizarse directamente
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    
    // Validar formato de ejemplos si se están actualizando
    if (updateData.examples) {
      const validExamples = updateData.examples.every(ex => 
        ex.text && ex.value && typeof ex.text === 'string' && typeof ex.value === 'string'
      );
      
      if (!validExamples) {
        return res.status(400).json({
          success: false,
          error: 'Los ejemplos deben tener formato: { text: string, value: string }'
        });
      }
    }
    
    const entity = await entityService.updateEntity(id, updateData);
    
    res.json({
      success: true,
      data: entity,
      message: 'Entidad actualizada exitosamente'
    });
  } catch (error) {
    logger.error(`Error en updateEntity controller: ${error.message}`);
    const status = error.message === 'Entidad no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Eliminar una entidad (soft delete)
 */
const deleteEntity = async (req, res) => {
  try {
    const { id } = req.params;
    const entity = await entityService.deleteEntity(id);
    
    res.json({
      success: true,
      data: entity,
      message: 'Entidad desactivada exitosamente'
    });
  } catch (error) {
    logger.error(`Error en deleteEntity controller: ${error.message}`);
    const status = error.message === 'Entidad no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Agregar ejemplos a una entidad
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
    
    // Validar formato de ejemplos
    const validExamples = examples.every(ex => 
      ex.text && ex.value && typeof ex.text === 'string' && typeof ex.value === 'string'
    );
    
    if (!validExamples) {
      return res.status(400).json({
        success: false,
        error: 'Los ejemplos deben tener formato: { text: string, value: string }'
      });
    }
    
    const entity = await entityService.addExamples(id, examples);
    
    res.json({
      success: true,
      data: entity,
      message: `${examples.length} ejemplos agregados exitosamente`
    });
  } catch (error) {
    logger.error(`Error en addExamples controller: ${error.message}`);
    const status = error.message === 'Entidad no encontrada' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Importar entidades desde la configuración
 */
const importEntities = async (req, res) => {
  try {
    const { entityConfig } = require('../config/promptConfig');
    const imported = await entityService.importEntitiesFromConfig(entityConfig);
    
    res.json({
      success: true,
      count: imported.length,
      data: imported,
      message: `${imported.length} entidades importadas exitosamente`
    });
  } catch (error) {
    logger.error(`Error en importEntities controller: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al importar entidades',
      message: error.message
    });
  }
};

/**
 * Obtener entidades formateadas para NLP
 */
const getEntitiesForNLP = async (req, res) => {
  try {
    const nlpData = await entityService.getEntitiesForNLP();
    
    res.json({
      success: true,
      data: nlpData
    });
  } catch (error) {
    logger.error(`Error en getEntitiesForNLP controller: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener entidades para NLP',
      message: error.message
    });
  }
};

/**
 * Obtener tipos de entidad disponibles
 */
const getEntityTypes = async (req, res) => {
  try {
    const types = ['text', 'email', 'phone', 'date', 'number', 'url', 'custom'];
    
    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    logger.error(`Error en getEntityTypes controller: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error al obtener tipos de entidad'
    });
  }
};

module.exports = {
  getAllEntities,
  getEntityById,
  createEntity,
  updateEntity,
  deleteEntity,
  addExamples,
  importEntities,
  getEntitiesForNLP,
  getEntityTypes
};