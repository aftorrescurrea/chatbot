const bcrypt = require('bcrypt');
const { logger } = require('../utils/logger');
const Credential = require('../models/Credential');
const { updateUserActivity } = require('./userService');

/**
 * Genera credenciales para un usuario
 * @param {Object} user - Usuario para el que se generarán las credenciales
 * @returns {Object} - Credenciales generadas
 */
/**
 * Verifica si un nombre de usuario ya existe
 * @param {string} username - Nombre de usuario a verificar
 * @returns {boolean} - true si existe, false si no existe
 */
const usernameExists = async (username) => {
    try {
        const credential = await Credential.findOne({ username });
        return !!credential;
    } catch (error) {
        logger.error(`Error al verificar existencia de username: ${error.message}`);
        throw error;
    }
};

/**
 * Crea credenciales para un usuario con username y password proporcionados
 * @param {Object} user - Usuario para el que se crearán las credenciales
 * @param {string} username - Nombre de usuario proporcionado
 * @param {string} password - Contraseña proporcionada
 * @param {string} serviceType - Tipo de servicio (erp, crm, bi, etc.)
 * @returns {Object} - Credenciales creadas
 */
const createCredentials = async (user, username, password, serviceType = 'generic') => {
    try {
        // Encriptar la contraseña para almacenarla
        const saltRounds = parseInt(process.env.PASSWORD_SALT_ROUNDS) || 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Calcular fecha de expiración (7 días desde hoy)
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 7);
        
        // Determinar el ID del servicio según el tipo
        let serviceId = 'generic-trial';
        switch (serviceType) {
            case 'erp':
                serviceId = 'erp-trial';
                break;
            case 'crm':
                serviceId = 'crm-trial';
                break;
            case 'bi':
                serviceId = 'bi-trial';
                break;
        }
        
        // Crear nueva entrada de credenciales
        const credential = new Credential({
            userId: user._id,
            username: username,
            password: hashedPassword,
            isEncrypted: true,
            serviceId: serviceId,
            creationDate: new Date(),
            expirationDate: expirationDate,
            lastAccessDate: null,
            isActive: true
        });
        
        // Guardar credenciales en la base de datos
        await credential.save();
        
        // Actualizar la última actividad del usuario
        await updateUserActivity(user._id);
        
        // Registrar la creación de credenciales
        logger.info(`Credenciales creadas para usuario ${user._id}: ${username}`);
        
        // Devolver credenciales sin encriptar para enviar al usuario
        return {
            username: username,
            password: password,
            expirationDate: expirationDate
        };
    } catch (error) {
        logger.error(`Error al crear credenciales: ${error.message}`);
        throw error;
    }
};

/**
 * Función legacy para generar credenciales automáticamente
 * Ahora redirige al flujo de solicitud de credenciales al usuario
 * @param {Object} user - Usuario para el que se generarán las credenciales
 * @returns {Object} - Objeto con información para iniciar el flujo de solicitud de credenciales
 */
const generateCredentials = async (user) => {
    try {
        // Ahora devolvemos un objeto que indica que se requiere solicitar credenciales al usuario
        return {
            requireUserInput: true,
            userId: user._id
        };
    } catch (error) {
        logger.error(`Error al generar credenciales: ${error.message}`);
        throw error;
    }
};

/**
 * Genera un nombre de usuario basado en el nombre o email
 * @param {string} input - Nombre o email del usuario
 * @returns {string} - Nombre de usuario generado
 */
const generateUsername = (input) => {
    // Si es un email, extraer la parte local (antes del @)
    if (input.includes('@')) {
        input = input.split('@')[0];
    }
    
    // Limpiar caracteres especiales y espacios
    let username = input
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
    
    // Asegurar que el username tenga al menos 5 caracteres
    if (username.length < 5) {
        username = username.padEnd(5, '0');
    }
    
    // Añadir un sufijo aleatorio para evitar colisiones
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `${username}${randomSuffix}`;
};

/**
 * Genera una contraseña aleatoria segura
 * @returns {string} - Contraseña generada
 */
const generateRandomPassword = () => {
    const length = 10;
    const charset = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ123456789!@#$%^&*()';
    let password = '';
    
    // Asegurar que la contraseña tenga al menos un carácter de cada tipo
    password += getRandomChar('ABCDEFGHJKLMNPQRSTUVWXYZ'); // Mayúscula
    password += getRandomChar('abcdefghijkmnopqrstuvwxyz'); // Minúscula
    password += getRandomChar('123456789'); // Número
    password += getRandomChar('!@#$%^&*()'); // Símbolo
    
    // Completar el resto de la contraseña
    for (let i = password.length; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    // Mezclar los caracteres para que no sigan un patrón predecible
    return password.split('').sort(() => 0.5 - Math.random()).join('');
};

/**
 * Obtiene un carácter aleatorio de una cadena
 * @param {string} charset - Conjunto de caracteres
 * @returns {string} - Carácter aleatorio
 */
const getRandomChar = (charset) => {
    return charset.charAt(Math.floor(Math.random() * charset.length));
};

/**
 * Busca credenciales de un usuario por su ID
 * @param {string} userId - ID del usuario
 * @returns {Object|null} - Credenciales encontradas o null
 */
const findCredentialsByUserId = async (userId) => {
    try {
        // Buscar todas las credenciales activas del usuario, ordenadas por fecha de creación (más recientes primero)
        return await Credential.find({ userId, isActive: true })
            .sort({ creationDate: -1 })
            .lean();
    } catch (error) {
        logger.error(`Error al buscar credenciales por ID de usuario: ${error.message}`);
        return [];
    }
};

/**
 * Verifica si las credenciales proporcionadas son válidas
 * @param {string} username - Nombre de usuario
 * @param {string} password - Contraseña
 * @returns {Object|null} - Usuario asociado a las credenciales o null
 */
const verifyCredentials = async (username, password) => {
    try {
        // Buscar credenciales por nombre de usuario
        const credential = await Credential.findOne({ 
            username: username,
            isActive: true
        });
        
        if (!credential) {
            return null;
        }
        
        // Verificar si las credenciales han expirado
        if (credential.expirationDate < new Date()) {
            logger.warn(`Intento de acceso con credenciales expiradas: ${username}`);
            return null;
        }
        
        // Verificar la contraseña
        let isValid = false;
        
        if (credential.isEncrypted) {
            // Si la contraseña está encriptada, usar bcrypt para comparar
            isValid = await bcrypt.compare(password, credential.password);
        } else {
            // Si la contraseña no está encriptada, comparar directamente
            isValid = password === credential.password;
        }
        
        if (!isValid) {
            return null;
        }
        
        // Actualizar fecha de último acceso
        credential.lastAccessDate = new Date();
        await credential.save();
        
        // Actualizar la última actividad del usuario
        await updateUserActivity(credential.userId);
        
        return credential;
    } catch (error) {
        logger.error(`Error al verificar credenciales: ${error.message}`);
        return null;
    }
};

module.exports = {
    generateCredentials,
    createCredentials,
    verifyCredentials,
    findCredentialsByUserId,
    usernameExists
};