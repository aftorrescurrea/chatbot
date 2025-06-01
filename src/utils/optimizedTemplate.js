/**
 * Template optimizado para detección de intenciones
 */

// Helper para identificar intenciones importantes
const isImportantIntent = (intent) => {
    const important = [
        'guia_reportes', 'guia_inventario', 'guia_facturacion', 
        'guia_usuarios', 'tutorial_general', 'consulta_caracteristicas',
        'solicitud_prueba', 'soporte_tecnico', 'saludo'
    ];
    return important.includes(intent);
};

// Helper para limitar ejemplos
const limitExamples = (examples, limit = 5) => {
    if (!Array.isArray(examples)) return [];
    return examples.slice(0, limit);
};

const optimizedIntentTemplate = `Eres un asistente especializado en detectar intenciones en mensajes de WhatsApp para un sistema {{serviceType}}.

INSTRUCCIONES:
- Analiza el mensaje del usuario con mucho cuidado
- Detecta TODAS las intenciones presentes en el mensaje
- Responde SOLO con JSON: {"intents": ["intencion1", "intencion2"]}
- NO agregues texto adicional, solo JSON válido

INTENCIONES DISPONIBLES:
{{#each supportedIntents}}- {{this}}
{{/each}}

DEFINICIONES CLAVE (IMPORTANTE):
- guia_reportes: cualquier pregunta sobre crear, generar o hacer reportes/informes
- guia_inventario: gestión de inventario/stock/productos
- guia_facturacion: crear facturas o facturación
- guia_usuarios: gestión de usuarios/permisos
- tutorial_general: ayuda general o tutoriales
- consulta_caracteristicas: qué incluye o hace el sistema
- solicitud_prueba: probar el sistema o demo
- soporte_tecnico: problemas técnicos o errores
- saludo: saludos como hola, buenos días
- consulta_precio: precios o costos

EJEMPLOS ESPECÍFICOS A RECONOCER:
- "como creo un reporte?" → ["guia_reportes"]
- "necesito generar reportes" → ["guia_reportes"]
- "ayuda con reportes" → ["guia_reportes"]
- "quiero crear un reporte de ventas" → ["guia_reportes"]
- "hola, como creo un reporte?" → ["saludo", "guia_reportes"]
- "necesito ayuda para crear reportes" → ["guia_reportes", "tutorial_general"]

EJEMPLOS PARA CADA INTENCIÓN:
{{#each intentExamples}}
{{@key}}:{{#each this}}{{#if @first}}
- "{{this}}"{{/if}}{{/each}}{{#each this}}{{#unless @first}}{{#if (lt @index 3)}}
- "{{this}}"{{/if}}{{/unless}}{{/each}}
{{/each}}

Es muy importante detectar correctamente cuando alguien pregunta sobre reportes (guia_reportes).
Detecta múltiples intenciones si aplican.`;

// Template simplificado para casos donde el completo falla
const fallbackIntentTemplate = `Detecta intenciones en este mensaje.

INTENCIONES:
- guia_reportes: cualquier pregunta sobre reportes, cómo crearlos o generarlos
- consulta_caracteristicas: características del sistema
- solicitud_prueba: quiere probar el sistema
- soporte_tecnico: tiene problemas
- saludo: saluda
- tutorial_general: ayuda general
- otros...

EJEMPLOS CRÍTICOS:
- "como creo un reporte?" → ["guia_reportes"]
- "necesito hacer un reporte" → ["guia_reportes"]
- "hola, como genero reportes?" → ["saludo", "guia_reportes"]

Responde solo con JSON: {"intents": ["nombre_intencion"]}

Mensaje: "{{message}}"`;

module.exports = {
    optimizedIntentTemplate,
    fallbackIntentTemplate,
    helpers: {
        isImportantIntent,
        limitExamples
    }
};