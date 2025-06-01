/**
 * Script para habilitar el sistema de perfiles de prompt (V3)
 * Ejecutar con: node scripts/enable-prompt-profiles.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { logger } = require('../src/utils/logger');

// Verifica si existe el archivo .env
const envPath = path.join(process.cwd(), '.env');
const envExamplePath = path.join(process.cwd(), '.env.example');

// Función para actualizar o crear el archivo .env
async function updateEnvFile() {
    try {
        let envContent = '';
        
        // Si existe el archivo .env, leerlo
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
            logger.info('Archivo .env encontrado, actualizando configuración...');
        } else if (fs.existsSync(envExamplePath)) {
            // Si no existe .env pero sí .env.example, usarlo como base
            envContent = fs.readFileSync(envExamplePath, 'utf8');
            logger.info('Creando archivo .env basado en .env.example...');
        } else {
            // Si no existe ninguno, crear uno básico
            envContent = '# Configuración del entorno\n\n';
            logger.info('Creando nuevo archivo .env...');
        }
        
        // Actualizar o agregar la variable PROMPT_SERVICE_VERSION
        if (envContent.includes('PROMPT_SERVICE_VERSION=')) {
            // Si ya existe la variable, actualizarla
            envContent = envContent.replace(
                /PROMPT_SERVICE_VERSION=(["']?)(.*?)\1/g,
                'PROMPT_SERVICE_VERSION=v3'
            );
        } else {
            // Si no existe, agregarla al final
            envContent += '\n# Versión del servicio de prompts (v1, v2, v3)\nPROMPT_SERVICE_VERSION=v3\n';
        }
        
        // Asegurarse de que OLLAMA_MODEL esté configurado para un modelo adecuado
        if (!envContent.includes('OLLAMA_MODEL=')) {
            envContent += '\n# Modelo de Ollama a utilizar\nOLLAMA_MODEL=qwen2.5:14b\n';
        }
        
        // Guardar los cambios
        fs.writeFileSync(envPath, envContent);
        logger.info('Archivo .env actualizado correctamente.');
        
        // Mostrar instrucciones adicionales
        logger.info('\n=== SISTEMA DE PERFILES DE PROMPT HABILITADO ===');
        logger.info('El sistema ahora utilizará diferentes prompts según el tipo de intención detectada.');
        logger.info('\nPasos adicionales recomendados:');
        logger.info('1. Ejecutar: node scripts/add-credit-intents-entities.js');
        logger.info('   - Esto agregará las nuevas intenciones y entidades de crédito a la base de datos');
        logger.info('2. Ejecutar: node scripts/test-prompt-profiles.js');
        logger.info('   - Esto probará el sistema con diferentes tipos de mensajes');
        logger.info('3. Reiniciar la aplicación para aplicar los cambios');
        
        return true;
    } catch (error) {
        logger.error(`Error al actualizar archivo .env: ${error.message}`);
        return false;
    }
}

// Ejecutar la función principal
updateEnvFile()
    .then(success => {
        if (success) {
            logger.info('\nConfiguración completada con éxito.');
        } else {
            logger.error('No se pudo completar la configuración.');
        }
    })
    .catch(error => {
        logger.error(`Error inesperado: ${error.message}`);
    });