/**
 * Servicio de extracción de entidades
 * Extrae entidades relevantes de los mensajes de los usuarios
 */

const { logger } = require('../utils/logger');
const { entityConfig } = require('../config/promptConfig');
const promptService = require('./promptService');
const { validateEmail, validatePhone } = require('../utils/validators');

/**
 * Extrae entidades relevantes del mensaje del usuario
 * @param {string} message - Mensaje del usuario
 * @param {Object} options - Opciones adicionales para la extracción de entidades
 * @returns {Object} - Objeto con las entidades extraídas
 */
const extractEntities = async (message, options = {}) => {
    try {
        // Configurar variables específicas para este prompt
        const variables = {
            supportedEntities: options.supportedEntities || entityConfig.supportedEntities,
            entityExamples: options.entityExamples || entityConfig.entityExamples,
            complexExamples: options.complexExamples || entityConfig.complexExamples,
            serviceType: options.serviceType || 'ERP'
        };

        // Usar el servicio de prompts para extraer entidades
        const entities = await promptService.extractEntities(message, 'entity-extraction', variables);
        
        // Validar y normalizar entidades
        return validateAndNormalizeEntities(entities);
    } catch (error) {
        logger.error(`Error al extraer entidades: ${error.message}`);
        // Devolver un objeto vacío en caso de error
        return {};
    }
};

/**
 * Valida y normaliza las entidades extraídas
 * @param {Object} entities - Entidades extraídas
 * @returns {Object} - Entidades validadas y normalizadas
 */
const validateAndNormalizeEntities = (entities) => {
    const validatedEntities = { ...entities };
    
    // Validar y normalizar email
    if (validatedEntities.email) {
        if (!validateEmail(validatedEntities.email)) {
            logger.warn(`Email extraído inválido: ${validatedEntities.email}`);
            delete validatedEntities.email;
        } else {
            validatedEntities.email = validatedEntities.email.toLowerCase().trim();
        }
    }
    
    // Validar y normalizar teléfono
    if (validatedEntities.telefono) {
        if (!validatePhone(validatedEntities.telefono)) {
            logger.warn(`Teléfono extraído inválido: ${validatedEntities.telefono}`);
            delete validatedEntities.telefono;
        } else {
            // Normalizar formato de teléfono (eliminar caracteres no numéricos)
            validatedEntities.telefono = validatedEntities.telefono.replace(/\D/g, '');
        }
    }
    
    // Normalizar nombre
    if (validatedEntities.nombre) {
        // Capitalizar primera letra de cada palabra
        validatedEntities.nombre = validatedEntities.nombre
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim();
    }
    
    // Normalizar empresa
    if (validatedEntities.empresa) {
        validatedEntities.empresa = validatedEntities.empresa.trim();
    }
    
    // Normalizar usuario
    if (validatedEntities.usuario) {
        // Eliminar espacios y caracteres especiales
        validatedEntities.usuario = validatedEntities.usuario
            .replace(/[^\w.-]/g, '')
            .trim();
    }
    
    // No normalizar clave para mantener seguridad
    
    return validatedEntities;
};

/**
 * Determina qué información falta para completar un registro de usuario
 * @param {Object} entities - Entidades extraídas
 * @param {Object} userData - Datos del usuario existente (opcional)
 * @returns {Array} - Lista de campos faltantes
 */
const getMissingUserData = (entities, userData = null) => {
    const missingFields = [];
    
    // Combinar datos existentes con entidades extraídas
    const combinedData = {
        ...userData,
        ...entities
    };
    
    // Verificar campos obligatorios
    if (!combinedData.nombre) missingFields.push('nombre');
    if (!combinedData.email) missingFields.push('email');
    if (!combinedData.usuario) missingFields.push('usuario');
    if (!combinedData.clave) missingFields.push('clave');
    
    return missingFields;
};

/**
 * Extrae credenciales del mensaje del usuario
 * @param {string} message - Mensaje del usuario
 * @returns {Object} - Objeto con usuario y clave extraídos
 */
const extractCredentials = (message) => {
    try {
        // Patrón simple: dos palabras separadas por espacio
        const parts = message.trim().split(/\s+/);
        
        if (parts.length === 2) {
            return {
                usuario: parts[0],
                clave: parts[1]
            };
        }
        
        return {};
    } catch (error) {
        logger.error(`Error al extraer credenciales: ${error.message}`);
        return {};
    }
};

// Exportar funciones
module.exports = {
    extractEntities,
    validateAndNormalizeEntities,
    getMissingUserData,
    extractCredentials
};