/**
 * Valida si una cadena es un correo electrónico válido
 * @param {string} email - Correo electrónico a validar
 * @returns {boolean} - Indica si el correo es válido
 */
const validateEmail = (email) => {
    if (!email) return false;
    
    // Expresión regular para validar correos electrónicos
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
};

/**
 * Valida si una cadena es un número de teléfono válido
 * @param {string} phone - Número de teléfono a validar
 * @returns {boolean} - Indica si el número es válido
 */
const validatePhone = (phone) => {
    if (!phone) return false;
    
    // Eliminar caracteres no numéricos para la validación
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Verificar que tenga entre 10 y 15 dígitos (estándar internacional)
    return cleanPhone.length >= 10 && cleanPhone.length <= 15;
};

/**
 * Valida si una cadena tiene una longitud mínima
 * @param {string} text - Texto a validar
 * @param {number} minLength - Longitud mínima requerida
 * @returns {boolean} - Indica si el texto cumple con la longitud mínima
 */
const validateMinLength = (text, minLength = 3) => {
    if (!text) return false;
    return text.trim().length >= minLength;
};

/**
 * Valida si una cadena contiene solo caracteres alfanuméricos y espacios
 * @param {string} text - Texto a validar
 * @returns {boolean} - Indica si el texto es alfanumérico
 */
const validateAlphanumeric = (text) => {
    if (!text) return false;
    
    // Expresión regular para validar texto alfanumérico con espacios
    const alphanumericRegex = /^[a-zA-Z0-9\s]+$/;
    return alphanumericRegex.test(text);
};

/**
 * Sanitiza una cadena para prevenir inyecciones
 * @param {string} text - Texto a sanitizar
 * @returns {string} - Texto sanitizado
 */
const sanitizeText = (text) => {
    if (!text) return '';
    
    // Eliminar caracteres potencialmente peligrosos
    return text
        .replace(/[<>]/g, '') // Eliminar < y >
        .replace(/javascript:/gi, '') // Eliminar javascript:
        .trim();
};

module.exports = {
    validateEmail,
    validatePhone,
    validateMinLength,
    validateAlphanumeric,
    sanitizeText
};