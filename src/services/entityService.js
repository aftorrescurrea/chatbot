const Entity = require('../models/Entity');
const { logger } = require('../utils/logger');

/**
 * Obtener todas las entidades
 * @param {boolean} activeOnly - Si solo se quieren las activas
 * @returns {Array} - Array de entidades
 */
const getAllEntities = async (activeOnly = true) => {
  try {
    if (activeOnly) {
      return await Entity.getActiveEntities();
    }
    return await Entity.find();
  } catch (error) {
    logger.error(`Error al obtener entidades: ${error.message}`);
    throw error;
  }
};

/**
 * Obtener una entidad por ID
 * @param {string} id - ID de la entidad
 * @returns {Object} - Entidad encontrada
 */
const getEntityById = async (id) => {
  try {
    const entity = await Entity.findById(id);
    if (!entity) {
      throw new Error('Entidad no encontrada');
    }
    return entity;
  } catch (error) {
    logger.error(`Error al obtener entidad por ID: ${error.message}`);
    throw error;
  }
};

/**
 * Obtener una entidad por nombre
 * @param {string} name - Nombre de la entidad
 * @returns {Object} - Entidad encontrada
 */
const getEntityByName = async (name) => {
  try {
    return await Entity.findByName(name);
  } catch (error) {
    logger.error(`Error al obtener entidad por nombre: ${error.message}`);
    throw error;
  }
};

/**
 * Obtener entidades por tipo
 * @param {string} type - Tipo de entidad
 * @returns {Array} - Entidades del tipo especificado
 */
const getEntitiesByType = async (type) => {
  try {
    return await Entity.findByType(type);
  } catch (error) {
    logger.error(`Error al obtener entidades por tipo: ${error.message}`);
    throw error;
  }
};

/**
 * Crear una nueva entidad
 * @param {Object} entityData - Datos de la entidad
 * @returns {Object} - Entidad creada
 */
const createEntity = async (entityData) => {
  try {
    const entity = new Entity(entityData);
    await entity.save();
    logger.info(`Entidad creada: ${entity.name}`);
    return entity;
  } catch (error) {
    logger.error(`Error al crear entidad: ${error.message}`);
    throw error;
  }
};

/**
 * Actualizar una entidad
 * @param {string} id - ID de la entidad
 * @param {Object} updateData - Datos a actualizar
 * @returns {Object} - Entidad actualizada
 */
const updateEntity = async (id, updateData) => {
  try {
    const entity = await Entity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!entity) {
      throw new Error('Entidad no encontrada');
    }
    
    logger.info(`Entidad actualizada: ${entity.name}`);
    return entity;
  } catch (error) {
    logger.error(`Error al actualizar entidad: ${error.message}`);
    throw error;
  }
};

/**
 * Eliminar una entidad (soft delete)
 * @param {string} id - ID de la entidad
 * @returns {Object} - Entidad desactivada
 */
const deleteEntity = async (id) => {
  try {
    const entity = await Entity.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    
    if (!entity) {
      throw new Error('Entidad no encontrada');
    }
    
    logger.info(`Entidad desactivada: ${entity.name}`);
    return entity;
  } catch (error) {
    logger.error(`Error al eliminar entidad: ${error.message}`);
    throw error;
  }
};

/**
 * Agregar ejemplos a una entidad
 * @param {string} id - ID de la entidad
 * @param {Array} examples - Nuevos ejemplos
 * @returns {Object} - Entidad actualizada
 */
const addExamples = async (id, examples) => {
  try {
    const entity = await Entity.findById(id);
    if (!entity) {
      throw new Error('Entidad no encontrada');
    }
    
    // Agregar ejemplos únicos
    const existingTexts = entity.examples.map(ex => ex.text);
    const uniqueExamples = examples.filter(ex => !existingTexts.includes(ex.text));
    entity.examples.push(...uniqueExamples);
    
    await entity.save();
    logger.info(`${uniqueExamples.length} ejemplos agregados a la entidad: ${entity.name}`);
    return entity;
  } catch (error) {
    logger.error(`Error al agregar ejemplos: ${error.message}`);
    throw error;
  }
};

/**
 * Obtener las entidades formateadas para el servicio NLP
 * @returns {Object} - Objeto con entidades y ejemplos
 */
const getEntitiesForNLP = async () => {
  try {
    const entities = await Entity.getActiveEntities();
    
    const supportedEntities = entities.map(entity => entity.name);
    const entityExamples = {};
    const complexExamples = [];
    
    entities.forEach(entity => {
      entityExamples[entity.name] = entity.examples.map(ex => ex.text);
    });
    
    return {
      supportedEntities,
      entityExamples,
      complexExamples
    };
  } catch (error) {
    logger.error(`Error al obtener entidades para NLP: ${error.message}`);
    throw error;
  }
};

/**
 * Importar entidades desde la configuración existente
 * @param {Object} entityConfig - Configuración de entidades
 * @returns {Array} - Entidades importadas
 */
const importEntitiesFromConfig = async (entityConfig) => {
  try {
    const imported = [];
    
    // Mapeo de tipos de entidad
    const typeMapping = {
      'email': 'email',
      'telefono': 'phone',
      'fecha': 'date',
      'numero_empleados': 'number',
      'nombre': 'text',
      'empresa': 'text',
      'cargo': 'text',
      'usuario': 'text',
      'clave': 'text',
      'industria': 'text'
    };
    
    for (const entityName of entityConfig.supportedEntities) {
      const existingEntity = await Entity.findByName(entityName);
      
      if (!existingEntity) {
        const examples = entityConfig.entityExamples[entityName] || [];
        const displayName = entityName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        // Convertir ejemplos simples a formato con texto y valor
        const formattedExamples = examples.map(text => {
          // Extraer el valor del ejemplo
          let value = text;
          
          // Para algunos tipos, intentar extraer el valor real
          if (entityName === 'nombre') {
            const match = text.match(/(?:llamo|soy|nombre es|llamarme)\s+(.+)/i);
            if (match) value = match[1].trim();
          } else if (entityName === 'email') {
            const match = text.match(/[\w.-]+@[\w.-]+\.\w+/);
            if (match) value = match[0];
          } else if (entityName === 'telefono') {
            const match = text.match(/[\d\s\-+()]+/);
            if (match) value = match[0].trim();
          }
          
          return { text, value };
        });
        
        const entity = await createEntity({
          name: entityName,
          displayName: displayName,
          type: typeMapping[entityName] || 'text',
          examples: formattedExamples
        });
        
        imported.push(entity);
      }
    }
    
    // Importar ejemplos complejos si existen
    if (entityConfig.complexExamples) {
      for (const complex of entityConfig.complexExamples) {
        // Los ejemplos complejos se pueden usar para mejorar el entrenamiento
        // pero no se almacenan directamente en las entidades individuales
      }
    }
    
    logger.info(`${imported.length} entidades importadas`);
    return imported;
  } catch (error) {
    logger.error(`Error al importar entidades: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getAllEntities,
  getEntityById,
  getEntityByName,
  getEntitiesByType,
  createEntity,
  updateEntity,
  deleteEntity,
  addExamples,
  getEntitiesForNLP,
  importEntitiesFromConfig
};