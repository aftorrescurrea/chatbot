const User = require('../models/User');
const { logger } = require('../utils/logger');

/**
 * Crea un nuevo usuario o actualiza uno existente
 * @param {Object} userData - Datos del usuario
 * @returns {Object} - Usuario creado o actualizado
 */
const createOrUpdateUser = async (userData) => {
    try {
        // Verificar si el usuario ya existe por teléfono o email
        let user = await User.findOne({
            $or: [
                { phone: userData.phone },
                { email: userData.email }
            ]
        });
        
        if (user) {
            // Actualizar usuario existente
            logger.info(`Actualizando usuario existente: ${user._id}`);
            
            // Actualizar solo los campos proporcionados
            if (userData.name) user.name = userData.name;
            if (userData.email) user.email = userData.email;
            if (userData.empresa) user.company = userData.empresa;
            if (userData.cargo) user.position = userData.cargo;
            
            // Actualizar fecha de última actividad
            user.lastActivity = new Date();
            
            await user.save();
            return user;
        } else {
            // Crear nuevo usuario
            logger.info(`Creando nuevo usuario con teléfono: ${userData.phone}`);
            
            user = new User({
                phone: userData.phone,
                name: userData.name,
                email: userData.email,
                company: userData.empresa || null,
                position: userData.cargo || null,
                registrationDate: new Date(),
                lastActivity: new Date()
                // El historial de conversaciones ahora se almacena en la colección 'conversations'
            });
            
            await user.save();
            return user;
        }
    } catch (error) {
        logger.error(`Error al crear/actualizar usuario: ${error.message}`);
        throw error;
    }
};

/**
 * Busca un usuario por su número de teléfono
 * @param {string} phone - Número de teléfono del usuario
 * @returns {Object|null} - Usuario encontrado o null
 */
const findUserByPhone = async (phone) => {
    try {
        return await User.findOne({ phone });
    } catch (error) {
        logger.error(`Error al buscar usuario por teléfono: ${error.message}`);
        return null;
    }
};

/**
 * Busca un usuario por su correo electrónico
 * @param {string} email - Correo electrónico del usuario
 * @returns {Object|null} - Usuario encontrado o null
 */
const findUserByEmail = async (email) => {
    try {
        return await User.findOne({ email });
    } catch (error) {
        logger.error(`Error al buscar usuario por email: ${error.message}`);
        return null;
    }
};

/**
 * Actualiza la última actividad del usuario
 * @param {string} userId - ID del usuario
 * @returns {boolean} - Éxito de la operación
 */
const updateUserActivity = async (userId) => {
    try {
        const user = await User.findById(userId);
        
        if (!user) {
            logger.warn(`Usuario no encontrado para actualizar actividad: ${userId}`);
            return false;
        }
        
        // Actualizar fecha de última actividad
        user.lastActivity = new Date();
        
        await user.save();
        return true;
    } catch (error) {
        logger.error(`Error al actualizar actividad de usuario: ${error.message}`);
        return false;
    }
};

module.exports = {
    createOrUpdateUser,
    findUserByPhone,
    findUserByEmail,
    updateUserActivity
};