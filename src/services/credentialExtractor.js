// REEMPLAZAR COMPLETAMENTE src/services/credentialExtractor.js

const { logger } = require('../utils/logger');

// Lista ampliada de palabras comunes que NO son nombres/usuarios
const COMMON_WORDS = [
    // Saludos
    'hola', 'hello', 'hi', 'buenas', 'buenos', 'saludos',
    // Confirmaciones
    'si', 'sí', 'yes', 'ok', 'okay', 'claro', 'perfecto', 'exacto', 'correcto',
    // Negaciones
    'no', 'nope', 'nunca', 'jamás',
    // Cortesía
    'gracias', 'thanks', 'por', 'favor', 'please', 'disculpa', 'perdón',
    // Conectores
    'que', 'como', 'cuando', 'donde', 'porque', 'para', 'con', 'sin', 'sobre',
    // Otros comunes
    'bien', 'mal', 'muy', 'mas', 'menos', 'todo', 'nada', 'algo', 'alguien',
    // Verbos comunes
    'quiero', 'necesito', 'tengo', 'soy', 'estoy', 'voy', 'puedo', 'debo',
    // ERP específicos
    'erp', 'sistema', 'aplicacion', 'aplicación', 'demo', 'prueba', 'test'
];

/**
 * Verifica si una palabra es común y debe ser filtrada
 */
const isCommonWord = (word) => {
    return COMMON_WORDS.includes(word.toLowerCase());
};

/**
 * Extrae información personal y credenciales de un mensaje complejo
 */
const extractCredentialsRobust = (message) => {
    try {
        const cleanMessage = message.trim();
        logger.debug(`🔍 Analizando mensaje: "${cleanMessage}"`);
        
        const result = {};
        
        // 1. EXTRAER EMAIL (más confiable)
        const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
        const emailMatch = cleanMessage.match(emailPattern);
        if (emailMatch) {
            result.email = emailMatch[1];
            logger.debug(`📧 Email encontrado: ${result.email}`);
        }
        
        // 2. DIVIDIR POR ESPACIOS Y FILTRAR TOKENS
        const allTokens = cleanMessage.split(/\s+/).filter(token => token.length > 0);
        logger.debug(`🔤 Tokens iniciales: ${JSON.stringify(allTokens)}`);
        
        // 3. FILTRAR TOKENS PROBLEMÁTICOS
        const validTokens = allTokens.filter(token => {
            // No incluir emails (ya extraídos)
            if (emailPattern.test(token)) return false;
            
            // No incluir palabras comunes
            if (isCommonWord(token)) {
                logger.debug(`🚫 Filtrado palabra común: "${token}"`);
                return false;
            }
            
            // No incluir tokens muy cortos o muy largos
            if (token.length < 2 || token.length > 30) {
                logger.debug(`🚫 Filtrado por longitud: "${token}"`);
                return false;
            }
            
            return true;
        });
        
        logger.debug(`✅ Tokens válidos: ${JSON.stringify(validTokens)}`);
        
        // 4. ANALIZAR TOKENS VÁLIDOS
        if (validTokens.length === 0) {
            logger.debug(`ℹ️ No hay tokens válidos para extraer`);
            return result;
        }
        
        // 5. EXTRAER INFORMACIÓN SEGÚN NÚMERO DE TOKENS
        if (validTokens.length === 1) {
            const token = validTokens[0];
            if (isStrictUsernameLike(token)) {
                result.usuario = token;
                logger.debug(`👤 Token único como usuario: ${token}`);
            } else if (isStrictNameLike(token)) {
                result.nombre = token;
                logger.debug(`📝 Token único como nombre: ${token}`);
            }
        }
        else if (validTokens.length === 2) {
            const [token1, token2] = validTokens;
            
            // Caso: "usuario contraseña"
            if (isStrictUsernameLike(token1) && isStrictPasswordLike(token2)) {
                result.usuario = token1;
                result.clave = token2;
                logger.debug(`🎯 Usuario/Contraseña: ${token1}/${token2}`);
            }
            // Caso: "nombre apellido" (sin contraseña obvia)
            else if (isStrictNameLike(token1) && isStrictNameLike(token2) && !isStrictPasswordLike(token2)) {
                result.nombre = `${token1} ${token2}`;
                logger.debug(`📝 Nombre completo: ${result.nombre}`);
            }
            // Caso: "nombre contraseña"
            else if (isStrictNameLike(token1) && isStrictPasswordLike(token2)) {
                result.nombre = token1;
                result.clave = token2;
                logger.debug(`📝🔐 Nombre/Contraseña: ${token1}/${token2}`);
            }
            // Fallback: primer token usuario, segundo contraseña
            else {
                result.usuario = token1;
                result.clave = token2;
                logger.debug(`🎯 Fallback usuario/contraseña: ${token1}/${token2}`);
            }
        }
        else if (validTokens.length >= 3) {
            const [token1, token2, token3] = validTokens;
            
            // Caso común: "Nombre usuario contraseña"
            if (isStrictNameLike(token1) && isStrictUsernameLike(token2) && isStrictPasswordLike(token3)) {
                result.nombre = token1;
                result.usuario = token2;
                result.clave = token3;
                logger.debug(`📋 Patrón completo: nombre=${token1}, usuario=${token2}, clave=${token3}`);
            }
            // Caso: "Nombre Apellido contraseña"
            else if (isStrictNameLike(token1) && isStrictNameLike(token2) && isStrictPasswordLike(token3)) {
                result.nombre = `${token1} ${token2}`;
                result.clave = token3;
                logger.debug(`📝🔐 Nombre completo/Contraseña: ${result.nombre}/${token3}`);
            }
            // Fallback: primeros dos como nombre, tercero como contraseña
            else if (validTokens.length === 3) {
                result.nombre = `${token1} ${token2}`;
                result.clave = token3;
                logger.debug(`🎯 Fallback nombre/contraseña: ${result.nombre}/${token3}`);
            }
        }
        
        logger.info(`✅ Extracción completa: ${JSON.stringify(result)}`);
        return result;
        
    } catch (error) {
        logger.error(`❌ Error extrayendo credenciales: ${error.message}`);
        return {};
    }
};

/**
 * Determina si un token parece ser una contraseña (criterios estrictos)
 */
const isStrictPasswordLike = (token) => {
    // Criterios MÁS ESTRICTOS para contraseña:
    // - 4+ caracteres
    // - Contiene números O símbolos
    // - No es palabra común
    // - No es solo letras comunes
    
    if (token.length < 4 || token.length > 50) return false;
    if (isCommonWord(token)) return false;
    
    // Debe contener al menos números o símbolos
    const hasNumbers = /\d/.test(token);
    const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(token);
    const hasUpperAndLower = /[a-z]/.test(token) && /[A-Z]/.test(token);
    
    // Es contraseña si:
    return hasNumbers || hasSymbols || hasUpperAndLower;
};

/**
 * Determina si un token parece ser un nombre de usuario (criterios estrictos)
 */
const isStrictUsernameLike = (token) => {
    // Criterios MÁS ESTRICTOS para usuario:
    // - Alfanumérico con posibles puntos/guiones/números
    // - 3-20 caracteres
    // - No es palabra común
    // - Contiene números O caracteres especiales de usuario
    
    if (token.length < 3 || token.length > 20) return false;
    if (isCommonWord(token)) return false;
    if (!/^[a-zA-Z0-9._-]+$/.test(token)) return false;
    
    // Es usuario si contiene números o caracteres especiales típicos
    const hasNumbers = /\d/.test(token);
    const hasSpecialChars = /[._-]/.test(token);
    const isLowercase = token === token.toLowerCase();
    
    return hasNumbers || hasSpecialChars || isLowercase;
};

/**
 * Determina si un token parece ser un nombre personal (criterios estrictos)
 */
const isStrictNameLike = (token) => {
    // Criterios MÁS ESTRICTOS para nombre:
    // - Empieza con mayúscula
    // - Solo letras (incluyendo acentos)
    // - 2-30 caracteres
    // - No es palabra común
    // - No contiene números
    
    if (token.length < 2 || token.length > 30) return false;
    if (isCommonWord(token)) return false;
    if (!/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(token)) return false;
    
    return true;
};

/**
 * Extracción híbrida que combina Ollama + patrones mejorados
 */
const hybridEntityExtraction = async (message, ollamaExtractor) => {
    try {
        logger.debug(`🔄 Iniciando extracción híbrida para: "${message}"`);
        
        // Paso 1: Usar patrones mejorados PRIMERO (son más confiables)
        const patternEntities = extractCredentialsRobust(message);
        logger.debug(`🎯 Patrones extrajeron: ${JSON.stringify(patternEntities)}`);
        
        // Paso 2: Intentar con Ollama solo si los patrones no extrajeron suficiente
        let ollamaEntities = {};
        const hasEnoughInfo = patternEntities.email || 
                             (patternEntities.usuario && patternEntities.clave) ||
                             patternEntities.nombre;
        
        if (!hasEnoughInfo) {
            try {
                ollamaEntities = await ollamaExtractor(message);
                logger.debug(`🤖 Ollama extrajo: ${JSON.stringify(ollamaEntities)}`);
            } catch (error) {
                logger.warn(`⚠️ Ollama falló: ${error.message}`);
            }
        }
        
        // Paso 3: Combinar inteligentemente (priorizar patrones)
        const finalEntities = {
            // Priorizar patrones para todo (más confiables)
            email: patternEntities.email || ollamaEntities.email,
            usuario: patternEntities.usuario || ollamaEntities.usuario,
            clave: patternEntities.clave || ollamaEntities.clave,
            nombre: patternEntities.nombre || ollamaEntities.nombre,
            
            // Campos adicionales solo de Ollama
            empresa: ollamaEntities.empresa,
            cargo: ollamaEntities.cargo
        };
        
        // Filtrar valores vacíos y problemáticos
        Object.keys(finalEntities).forEach(key => {
            const value = finalEntities[key];
            if (!value || 
                value.trim() === '' || 
                isCommonWord(value) ||
                (key === 'nombre' && value.toLowerCase() === 'hola')) {
                delete finalEntities[key];
            }
        });

        logger.info(`✅ Entidades finales híbridas: ${JSON.stringify(finalEntities)}`);
        return finalEntities;
        
    } catch (error) {
        logger.error(`❌ Error en extracción híbrida: ${error.message}`);
        return {};
    }
};

module.exports = {
    extractCredentialsRobust,
    hybridEntityExtraction,
    isStrictPasswordLike,
    isStrictUsernameLike,
    isStrictNameLike,
    isCommonWord
};