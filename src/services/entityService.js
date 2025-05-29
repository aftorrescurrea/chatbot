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
    
    // Función auxiliar para extraer valores según el tipo de entidad
    const extractValueFromExample = (text, entityName) => {
      let value = text;
      
      try {
        switch (entityName) {
          case 'nombre':
            const nameMatch = text.match(/(?:llamo|soy|nombre es|llamarme|Nombre:)\s*(.+)/i);
            if (nameMatch) value = nameMatch[1].trim();
            break;
            
          case 'email':
            const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
            if (emailMatch) value = emailMatch[0];
            break;
            
          case 'telefono':
            // Múltiples patrones para diferentes formatos de teléfono
            const phonePatterns = [
              /(?:número es|Tel:|Teléfono:|celular:|whatsapp:|Contacto:)?\s*(\+?\d[\d\s\-()]+\d)/i,
              /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
              /(\(\d{2,3}\)\s?\d{4}[-.\s]?\d{4})/,
              /(\+\d{1,3}\s?\d{2,3}\s?\d{3}\s?\d{4})/,
              /(\d{10,15})/
            ];
            
            for (const pattern of phonePatterns) {
              const match = text.match(pattern);
              if (match) {
                value = match[1].trim();
                break;
              }
            }
            
            // Si no se encontró con patrones, buscar cualquier secuencia de números
            if (value === text) {
              const numbers = text.match(/[\d\s\-+()]+/g);
              if (numbers) {
                // Tomar la secuencia más larga de números
                const longestNumber = numbers.reduce((a, b) => 
                  b.replace(/\D/g, '').length > a.replace(/\D/g, '').length ? b : a
                );
                if (longestNumber.replace(/\D/g, '').length >= 7) {
                  value = longestNumber.trim();
                }
              }
            }
            break;
            
          case 'empresa':
            const companyMatch = text.match(/(?:Trabajo en|empresa es|Vengo de parte de|Empresa:|compañía:|Representando a|Somos de)\s*(.+)/i);
            if (companyMatch) value = companyMatch[1].trim();
            break;
            
          case 'cargo':
            const positionMatch = text.match(/(?:Soy|puesto es|Trabajo como|Cargo:|desempeño como|Puesto:)\s*(.+)/i);
            if (positionMatch) value = positionMatch[1].trim();
            break;
            
          case 'usuario':
            const userMatch = text.match(/(?:usuario será|Nombre de usuario:|Quiero el usuario|Usuario:|como nombre de usuario|Prefiero usar|id de acceso:)\s*(.+)/i);
            if (userMatch) value = userMatch[1].trim();
            break;
            
          case 'clave':
            const passwordMatch = text.match(/(?:contraseña es|Clave:|Usaré|Contraseña:|pass:|Clave de acceso:)\s*(.+)/i);
            if (passwordMatch) value = passwordMatch[1].trim();
            break;
            
          case 'fecha':
            const dateMatch = text.match(/(?:Desde el|Para el|Ocurrió el|Fecha:|Programado para|próximo)\s*(.+)/i);
            if (dateMatch) value = dateMatch[1].trim();
            break;
            
          case 'numero_empleados':
            const employeeMatch = text.match(/(\d+)\s*(?:empleados|trabajadores|personas|colaboradores|profesionales)/i);
            if (employeeMatch) value = employeeMatch[1];
            break;
            
          case 'industria':
            const industryMatch = text.match(/(?:Sector|Trabajamos en|Industria:|dedicamos a la)\s*(.+)/i);
            if (industryMatch) value = industryMatch[1].trim();
            break;
        }
      } catch (error) {
        logger.warn(`Error extrayendo valor para ${entityName}: ${error.message}`);
      }
      
      return value;
    };
    
    for (const entityName of entityConfig.supportedEntities) {
      const existingEntity = await Entity.findByName(entityName);
      
      if (!existingEntity) {
        const examples = entityConfig.entityExamples[entityName] || [];
        const displayName = entityName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        // Convertir ejemplos simples a formato con texto y valor
        const formattedExamples = [];
        
        for (const exampleText of examples) {
          const value = extractValueFromExample(exampleText, entityName);
          
          // Solo agregar ejemplos con valores válidos
          if (value && value.trim() !== '' && value !== exampleText.trim()) {
            formattedExamples.push({
              text: exampleText,
              value: value
            });
          } else {
            // Si no se pudo extraer un valor diferente, usar el texto completo pero registrar advertencia
            logger.warn(`Usando texto completo como valor para ${entityName}: "${exampleText}"`);
            formattedExamples.push({
              text: exampleText,
              value: exampleText
            });
          }
        }
        
        // Solo crear la entidad si hay ejemplos válidos
        if (formattedExamples.length > 0) {
          try {
            const entity = await createEntity({
              name: entityName,
              displayName: displayName,
              type: typeMapping[entityName] || 'text',
              examples: formattedExamples
            });
            
            imported.push(entity);
            logger.info(`Entidad ${entityName} creada con ${formattedExamples.length} ejemplos`);
          } catch (createError) {
            logger.error(`Error creando entidad ${entityName}: ${createError.message}`);
          }
        } else {
          logger.warn(`No se creó la entidad ${entityName} porque no hay ejemplos válidos`);
        }
      }
    }
    
    // Importar ejemplos complejos si existen
    if (entityConfig.complexExamples) {
      for (const complex of entityConfig.complexExamples) {
        // Los ejemplos complejos se pueden usar para mejorar el entrenamiento
        // pero no se almacenan directamente en las entidades individuales
        logger.debug(`Ejemplo complejo procesado: ${complex.text}`);
      }
    }
    
    logger.info(`${imported.length} entidades importadas exitosamente`);
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