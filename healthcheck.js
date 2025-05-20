/**
 * Script de healthcheck para el contenedor Docker
 * Verifica que la aplicación esté funcionando correctamente y pueda conectarse a los servicios externos
 */

// Importar módulos necesarios
const mongoose = require('mongoose');
const fetch = require('node-fetch');
require('dotenv').config();

// Función principal de healthcheck
async function healthcheck() {
    let isHealthy = true;
    const checks = [];

    // Verificar conexión a MongoDB Atlas (servicio externo)
    try {
        const mongoStatus = await checkMongoDB();
        checks.push({ name: 'MongoDB Atlas', status: mongoStatus ? 'OK' : 'ERROR' });
        if (!mongoStatus) isHealthy = false;
    } catch (error) {
        console.error(`Error al verificar MongoDB Atlas: ${error.message}`);
        checks.push({ name: 'MongoDB Atlas', status: 'ERROR' });
        isHealthy = false;
    }

    // Verificar conexión a Ollama (servicio externo)
    try {
        const ollamaStatus = await checkOllama();
        checks.push({ name: 'Ollama (externo)', status: ollamaStatus ? 'OK' : 'ERROR' });
        if (!ollamaStatus) isHealthy = false;
    } catch (error) {
        console.error(`Error al verificar Ollama: ${error.message}`);
        checks.push({ name: 'Ollama (externo)', status: 'ERROR' });
        isHealthy = false;
    }

    // Imprimir resultados
    console.log('=== HEALTHCHECK RESULTS ===');
    checks.forEach(check => {
        console.log(`${check.name}: ${check.status}`);
    });
    console.log('==========================');

    // Salir con código apropiado
    process.exit(isHealthy ? 0 : 1);
}

/**
 * Verifica la conexión a MongoDB Atlas (servicio externo)
 * @returns {Promise<boolean>} - Estado de la conexión
 */
async function checkMongoDB() {
    // Si ya hay una conexión abierta, usarla
    if (mongoose.connection.readyState === 1) {
        return true;
    }

    try {
        // Intentar conectar a MongoDB Atlas
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Timeout de 5 segundos
            connectTimeoutMS: 5000
        });
        
        // Ejecutar un comando simple para verificar la conexión
        await mongoose.connection.db.command({ ping: 1 });
        
        // Cerrar la conexión
        await mongoose.connection.close();
        
        return true;
    } catch (error) {
        console.error(`Error de conexión a MongoDB Atlas: ${error.message}`);
        return false;
    }
}

/**
 * Verifica la conexión al servidor Ollama externo
 * @returns {Promise<boolean>} - Estado de la conexión
 */
async function checkOllama() {
    try {
        // Verificar que el servicio de Ollama externo esté disponible
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${process.env.OLLAMA_API_URL}/tags`, {
            method: 'GET',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Respuesta no válida del servidor Ollama: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Verificar que el modelo configurado esté disponible
        // Nota: La estructura de la respuesta puede variar según la versión de Ollama
        const modelExists = data.models && data.models.some(model =>
            model.name === process.env.OLLAMA_MODEL
        );
        
        if (!modelExists) {
            console.warn(`El modelo '${process.env.OLLAMA_MODEL}' no está disponible en el servidor Ollama`);
        }
        
        // Consideramos que la conexión es exitosa incluso si el modelo específico no está disponible
        // ya que el problema podría ser solo la falta del modelo, no la conectividad
        return true;
    } catch (error) {
        console.error(`Error al verificar servidor Ollama externo: ${error.message}`);
        return false;
    }
}

// Ejecutar healthcheck
healthcheck().catch(error => {
    console.error(`Error en healthcheck: ${error.message}`);
    process.exit(1);
});