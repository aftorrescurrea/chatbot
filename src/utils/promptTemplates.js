/**
 * Utilidades para manejo de plantillas de prompts
 * Permite cargar y renderizar plantillas para diferentes propósitos
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { intentConfig, entityConfig, responseConfig } = require('../config/promptConfig');

// Directorio donde se almacenarían plantillas personalizadas
const TEMPLATES_DIR = path.join(__dirname, '../templates');

// Plantillas base en memoria (para no depender de archivos externos)
const baseTemplates = {
    // Plantilla para detección de intenciones
    'intent-detection': `
Eres un asistente especializado en análisis conversacional y comprensión del lenguaje natural. Tu tarea es identificar las intenciones presentes en el mensaje de un usuario que está interactuando con un chatbot de WhatsApp para un sistema {{serviceType}}.

### INSTRUCCIONES ###
1. Analiza cuidadosamente el mensaje del usuario.
2. Identifica TODAS las intenciones presentes en el mensaje, basándote en la lista proporcionada.
3. Responde ÚNICAMENTE con un objeto JSON que contenga un array de las intenciones detectadas.
4. No incluyas explicaciones, comentarios o texto adicional fuera del objeto JSON.

### INTENCIONES SOPORTADAS ###
{{#each supportedIntents}}
- {{this}}
{{/each}}

### EJEMPLOS DE INTENCIONES ###
{{#each intentExamples}}
**{{@key}}**: 
{{#each this}}
- "{{this}}"
{{/each}}
{{/each}}

### EJEMPLOS DE ANÁLISIS ###
{{#each conversationExamples}}
Usuario: "{{this.user}}"
Respuesta correcta: {{this.assistant}}
{{/each}}

### IMPORTANTE ###
- Un mensaje puede contener MÚLTIPLES intenciones simultáneamente.
- Usa EXACTAMENTE los nombres de intenciones tal como aparecen en la lista.
- Si un mensaje no contiene ninguna intención reconocible, devuelve un array vacío.
- No inventes intenciones que no estén en la lista proporcionada.

Formato de respuesta requerido:
{
  "intents": ["intencion1", "intencion2", ...]
}
    `,

    // Plantilla para extracción de entidades
    'entity-extraction': `
Eres un asistente especializado en procesamiento de lenguaje natural. Tu tarea es extraer entidades específicas del mensaje de un usuario que está interactuando con un chatbot de WhatsApp para un sistema {{serviceType}}.

### INSTRUCCIONES ###
1. Analiza cuidadosamente el mensaje del usuario.
2. Extrae TODAS las entidades relevantes mencionadas en el mensaje, basándote en la lista proporcionada.
3. Responde ÚNICAMENTE con un objeto JSON que contenga las entidades encontradas.
4. Sé preciso en la extracción, ignorando información irrelevante.
5. No incluyas explicaciones, comentarios o texto adicional fuera del objeto JSON.

### ENTIDADES A EXTRAER ###
{{#each supportedEntities}}
- {{this}}
{{/each}}

### EJEMPLOS DE ENTIDADES ###
{{#each entityExamples}}
**{{@key}}**: 
{{#each this}}
- "{{this}}"
{{/each}}
{{/each}}

### EJEMPLOS COMPLEJOS ###
{{#each complexExamples}}
Mensaje: "{{this.text}}"
Entidades extraídas: {{JSON.stringify this.entities}}
{{/each}}

### IMPORTANTE ###
- Incluye SOLO las entidades que identifiques con certeza.
- Nunca inventes información no presente en el mensaje.
- Si no encuentras una entidad específica, no la incluyas en la respuesta.
- Para entidades como "usuario" y "clave", prioriza patrones donde aparecen juntos.
- Si una palabra está entre comillas, considérala como posible valor de una entidad.

Formato de respuesta requerido:
{
  "entidad1": "valor1",
  "entidad2": "valor2",
  ...
}
    `,

    // Plantilla para generación de respuestas al usuario
    'user-response': `
Eres un asistente virtual de WhatsApp para {{serviceMetadata.name}}, un sistema {{serviceMetadata.type}} diseñado para gestionar procesos empresariales. Tu objetivo es proporcionar información, ayudar a los usuarios a obtener acceso de prueba al sistema y resolver dudas técnicas básicas.

### CONTEXTO ACTUAL ###
- Mensaje del usuario: "{{message}}"
- Intenciones detectadas: {{JSON.stringify intents}}
- Entidades extraídas: {{JSON.stringify entities}}
- Información del usuario: {{#if userData}}{{userData.name}} ({{userData.phone}}){{else}}Usuario no registrado{{/if}}
- Estado de la conversación: {{context.conversationState}}

### GUÍA DE RESPUESTA ###
1. Saluda al usuario por su nombre si está disponible.
2. Responde de forma directa a la intención principal del usuario.
3. Si el usuario solicita una prueba, guíalo para recopilar la información necesaria (nombre, correo, usuario y contraseña deseados).
4. Si falta información para completar una solicitud, pregunta específicamente por los datos faltantes.
5. Usa un tono amigable, profesional y conciso.
6. Limita tus respuestas a 3-4 oraciones, excepto cuando proporciones instrucciones detalladas.

### CARACTERÍSTICAS DEL SERVICIO ###
{{#each serviceMetadata.features}}
- {{this}}
{{/each}}

### PLANTILLAS DE RESPUESTA ###
{{#each responseTemplates}}
**{{@key}}**: "{{this}}"
{{/each}}

### RESTRICCIONES ###
- NO inventes información no proporcionada en el contexto.
- NO solicites datos sensibles como números de tarjeta de crédito o contraseñas de servicios externos.
- NO menciones que eres un modelo de lenguaje o una IA; compórtate como un asistente virtual de la empresa.
- NO uses emojis excesivos; limítate a 1-2 por mensaje.
- NO incluyas enlaces externos excepto los proporcionados en la configuración.

Responde de manera natural al mensaje del usuario, considerando todo el contexto proporcionado.
    `,

    // Plantilla para clasificación de sentimiento
    'sentiment-analysis': `
Eres un analista de sentimiento especializado en conversaciones de servicio al cliente. Tu tarea es determinar el sentimiento expresado en el mensaje de un usuario.

### INSTRUCCIONES ###
1. Analiza cuidadosamente el mensaje del usuario.
2. Determina el sentimiento predominante en el mensaje.
3. Responde ÚNICAMENTE con un objeto JSON que contenga el sentimiento detectado y su intensidad.
4. No incluyas explicaciones, comentarios o texto adicional fuera del objeto JSON.

### SENTIMIENTOS POSIBLES ###
- positivo: El usuario expresa satisfacción, gratitud, felicidad o interés.
- negativo: El usuario expresa frustración, enojo, decepción o insatisfacción.
- neutral: El usuario no expresa un sentimiento claramente positivo o negativo.

### INTENSIDADES POSIBLES ###
- alta: Sentimiento muy marcado, con expresiones enfáticas o repetidas.
- media: Sentimiento claramente identificable pero no extremo.
- baja: Sentimiento apenas perceptible o ambiguo.

Formato de respuesta requerido:
{
  "sentiment": "positivo|negativo|neutral",
  "intensity": "alta|media|baja"
}
    `
};

/**
 * Carga una plantilla de prompt por su nombre
 * @param {string} templateName - Nombre de la plantilla
 * @returns {string} - Contenido de la plantilla
 */
function loadTemplate(templateName) {
    try {
        // Primero intentar cargar desde un archivo si existe
        const templatePath = path.join(TEMPLATES_DIR, `${templateName}.tmpl`);
        
        if (fs.existsSync(templatePath)) {
            return fs.readFileSync(templatePath, 'utf8');
        }
        
        // Si no existe el archivo, buscar en las plantillas base
        if (baseTemplates[templateName]) {
            return baseTemplates[templateName];
        }
        
        // Si no se encuentra, lanzar error
        throw new Error(`Plantilla "${templateName}" no encontrada`);
    } catch (error) {
        logger.error(`Error al cargar plantilla "${templateName}": ${error.message}`);
        
        // Retornar una plantilla por defecto según el tipo solicitado
        if (templateName.includes('intent')) {
            return baseTemplates['intent-detection'];
        } else if (templateName.includes('entity')) {
            return baseTemplates['entity-extraction'];
        } else if (templateName.includes('response')) {
            return baseTemplates['user-response'];
        } else {
            return 'Error al cargar plantilla. Por favor, verifica el nombre de la plantilla.';
        }
    }
}

/**
 * Renderiza una plantilla con variables
 * @param {string} template - Plantilla a renderizar
 * @param {Object} variables - Variables para la plantilla
 * @returns {string} - Plantilla renderizada
 */
function renderTemplate(template, variables) {
    try {
        // Función simple de renderizado de plantillas
        // Reemplaza {{variable}} por su valor correspondiente
        
        // Primero incluimos configuraciones estándar si no se proporcionaron
        const mergedVariables = {
            ...variables,
            supportedIntents: variables.supportedIntents || intentConfig.supportedIntents,
            intentExamples: variables.intentExamples || intentConfig.intentExamples,
            conversationExamples: variables.conversationExamples || intentConfig.conversationExamples,
            supportedEntities: variables.supportedEntities || entityConfig.supportedEntities,
            entityExamples: variables.entityExamples || entityConfig.entityExamples,
            complexExamples: variables.complexExamples || entityConfig.complexExamples,
            responseTemplates: variables.responseTemplates || responseConfig.responseTemplates,
            serviceType: variables.serviceType || "ERP"
        };
        
        let renderedTemplate = template;
        
        // Procesar condicionales simples {{#if variable}}...{{else}}...{{/if}}
        renderedTemplate = renderedTemplate.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, ifContent, elseContent) => {
            // Evaluar la condición accediendo a la propiedad en variables
            const props = condition.trim().split('.');
            let value = mergedVariables;
            
            for (const prop of props) {
                if (value === undefined || value === null) break;
                value = value[prop];
            }
            
            return value ? ifContent : elseContent;
        });
        
        // Procesar bucles {{#each variable}}...{{/each}}
        renderedTemplate = renderedTemplate.replace(/\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayName, content) => {
            const props = arrayName.trim().split('.');
            let array = mergedVariables;
            
            for (const prop of props) {
                if (array === undefined || array === null) break;
                array = array[prop];
            }
            
            if (!Array.isArray(array) && typeof array !== 'object') {
                return '';
            }
            
            // Si es un array, iterar normalmente
            if (Array.isArray(array)) {
                return array.map(item => {
                    return content.replace(/\{\{this\}\}/g, item);
                }).join('');
            }
            
            // Si es un objeto, iterar por sus propiedades
            return Object.entries(array).map(([key, value]) => {
                let itemContent = content.replace(/\{\{@key\}\}/g, key);
                itemContent = itemContent.replace(/\{\{this\}\}/g, typeof value === 'object' ? JSON.stringify(value) : value);
                return itemContent;
            }).join('');
        });
        
        // Procesar variables JSON con stringify
        renderedTemplate = renderedTemplate.replace(/\{\{JSON\.stringify\s+([^}]+)\}\}/g, (match, varName) => {
            const props = varName.trim().split('.');
            let value = mergedVariables;
            
            for (const prop of props) {
                if (value === undefined || value === null) break;
                value = value[prop];
            }
            
            return JSON.stringify(value || {});
        });
        
        // Procesar variables simples {{variable}}
        renderedTemplate = renderedTemplate.replace(/\{\{([^#/][^}]*?)\}\}/g, (match, varName) => {
            const props = varName.trim().split('.');
            let value = mergedVariables;
            
            for (const prop of props) {
                if (value === undefined || value === null) break;
                value = value[prop];
            }
            
            return value !== undefined && value !== null ? value : '';
        });
        
        return renderedTemplate;
    } catch (error) {
        logger.error(`Error al renderizar plantilla: ${error.message}`);
        return template; // Devolver la plantilla original si hay error
    }
}

// Exportar funciones
module.exports = {
    loadTemplate,
    renderTemplate,
    baseTemplates
};
