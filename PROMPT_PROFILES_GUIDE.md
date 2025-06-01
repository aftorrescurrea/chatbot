# Guía del Sistema de Perfiles de Prompt

Este documento describe el sistema de perfiles de prompt implementado en la versión V3 del servicio de prompts, que permite utilizar diferentes system prompts según el tipo de intención detectada.

## Índice

1. [Concepto y Funcionamiento](#concepto-y-funcionamiento)
2. [Perfiles Implementados](#perfiles-implementados)
3. [Configuración del Sistema](#configuración-del-sistema)
4. [Agregando Nuevos Perfiles](#agregando-nuevos-perfiles)
5. [Mapeando Intenciones a Perfiles](#mapeando-intenciones-a-perfiles)
6. [Pruebas y Validación](#pruebas-y-validación)
7. [Integración con Servicios Existentes](#integración-con-servicios-existentes)
8. [Preguntas Frecuentes](#preguntas-frecuentes)

## Concepto y Funcionamiento

### ¿Qué es un Perfil de Prompt?

Un perfil de prompt es un conjunto de configuraciones que incluye:

- Un **system prompt** especializado para un tipo específico de consulta
- Una **temperatura** recomendada para ese tipo de respuestas
- Una lista de **categorías de intenciones** que activan el perfil
- Ajustes opcionales como **multiplicadores de tokens**

### Flujo de Procesamiento

1. El usuario envía un mensaje
2. El sistema detecta las intenciones presentes en el mensaje
3. Basado en estas intenciones, se selecciona el perfil más adecuado
4. El perfil seleccionado proporciona el system prompt y otros parámetros
5. La respuesta se genera utilizando este perfil especializado

Este enfoque permite que cada tipo de consulta reciba un tratamiento optimizado para su dominio específico.

## Perfiles Implementados

Actualmente, el sistema incluye cuatro perfiles principales:

### 1. Soporte Técnico (support)

**Propósito**: Responder a problemas técnicos, quejas y solicitudes de ayuda.

**Características clave**:
- Enfoque en precisión y claridad
- Prioriza la resolución de problemas
- Reconoce cuando no tiene suficiente información
- Temperamento calmado y profesional

**Intenciones asociadas**: `soporte_tecnico`, `queja`, `error_sistema`, etc.

### 2. Créditos y Cobranza (credit)

**Propósito**: Manejar consultas relacionadas con créditos, pagos, saldos y cobranzas.

**Características clave**:
- Alta precisión en información financiera
- Manejo de datos sensibles (saldos, fechas, montos)
- Tono profesional y discreto
- Verificación de identidad antes de compartir información sensible

**Intenciones asociadas**: `consultar_saldo_cliente`, `registrar_pago`, `crear_credito`, etc.

### 3. Consultas Generales (general)

**Propósito**: Responder a preguntas generales, saludos y solicitudes de información.

**Características clave**:
- Tono amigable y conversacional
- Enfoque en brindar información clara
- Promoción de características del sistema
- Mayor flexibilidad y creatividad en respuestas

**Intenciones asociadas**: `saludo`, `consulta_caracteristicas`, `consulta_precio`, etc.

### 4. Tutoriales y Guías (tutorial)

**Propósito**: Proporcionar instrucciones paso a paso para realizar tareas en el sistema.

**Características clave**:
- Respuestas estructuradas en pasos secuenciales
- Mayor extensión para explicaciones detalladas
- Inclusión de consejos y consideraciones prácticas
- Enfoque educativo y aclaratorio

**Intenciones asociadas**: `guia_reportes`, `guia_inventario`, `tutorial_general`, etc.

## Configuración del Sistema

### Activación del Sistema de Perfiles

Para activar el sistema de perfiles:

1. Ejecuta el script de configuración:
   ```
   node scripts/enable-prompt-profiles.js
   ```

2. Verifica que la variable de entorno esté configurada:
   ```
   PROMPT_SERVICE_VERSION=v3
   ```

3. Si deseas desactivar temporalmente el sistema de perfiles pero mantener la versión v3:
   ```javascript
   // En promptServiceV3.js
   CONFIG.usePromptProfiles = false;
   ```

### Ajuste de Parámetros Globales

Puedes ajustar los parámetros globales modificando el objeto `CONFIG` en `src/services/promptServiceV3.js`:

```javascript
const CONFIG = {
    // Configuración heredada de V2
    ...promptServiceV2.CONFIG,
    
    // Activar uso de perfiles por defecto
    usePromptProfiles: true,
    
    // Factor de aumento de tokens según el perfil
    tokenMultiplier: {
        support: 1.5,   // Más tokens para soporte técnico
        credit: 1.2,    // Tokens extra para temas de crédito
        general: 1.0,   // Baseline para general
        tutorial: 1.7   // Muchos tokens para tutoriales
    }
};
```

## Agregando Nuevos Perfiles

Para agregar un nuevo perfil, edita el archivo `src/config/promptProfilesConfig.js`:

1. Agrega un nuevo perfil al objeto `promptProfiles`:

```javascript
promptProfiles.newProfile = {
    systemPrompt: `Instrucciones específicas para este perfil...`,
    temperature: 0.4,  // Ajusta según necesidad
    intentCategories: ['category1', 'category2']
};
```

2. Actualiza el mapa de intenciones a categorías:

```javascript
const intentToCategoryMap = {
    // Intenciones existentes...
    
    // Nuevas intenciones
    'nueva_intencion1': 'newProfile',
    'nueva_intencion2': 'newProfile'
};
```

## Mapeando Intenciones a Perfiles

El sistema utiliza un mapa de intenciones a categorías para determinar qué perfil usar. Este mapa se encuentra en `src/config/promptProfilesConfig.js`:

```javascript
const intentToCategoryMap = {
    'soporte_tecnico': 'support',
    'queja': 'support',
    
    'consultar_saldo_cliente': 'credit',
    'registrar_pago': 'credit',
    
    'consulta_caracteristicas': 'general',
    'saludo': 'general',
    
    'guia_reportes': 'tutorial',
    'tutorial_general': 'tutorial'
};
```

Cuando se detectan múltiples intenciones en un mensaje, el sistema selecciona el perfil basándose en la categoría más frecuente.

### Algoritmo de Selección

El algoritmo de selección está implementado en la función `getPromptProfileForIntents` y funciona así:

1. Cuenta la frecuencia de cada categoría entre las intenciones detectadas
2. Selecciona la categoría con mayor frecuencia
3. Devuelve el perfil correspondiente a esa categoría
4. Si no hay coincidencias o no hay intenciones, usa el perfil `general` por defecto

## Pruebas y Validación

Para probar el sistema de perfiles:

1. Ejecuta el script de prueba:
   ```
   node scripts/test-prompt-profiles.js
   ```

Este script:
- Prueba la selección de perfiles con diferentes combinaciones de intenciones
- Genera respuestas utilizando cada perfil
- Comprueba la generación específica para consultas de crédito

### Casos de Prueba Personalizados

Puedes agregar casos de prueba personalizados editando el objeto `testMessages` en `scripts/test-prompt-profiles.js`:

```javascript
testMessages.myCategory = [
    { 
        message: "Mi mensaje de prueba", 
        intents: ["intencion1", "intencion2"]
    }
];
```

## Integración con Servicios Existentes

El sistema de perfiles está integrado con el flujo existente a través de:

1. **nlpServiceV2.js**: Usa los perfiles al generar respuestas
2. **migrationConfig.js**: Permite cambiar entre versiones
3. **promptServiceV3.js**: Implementa la lógica de selección y uso de perfiles

Para integrar con nuevos componentes:

1. Importa el servicio de prompts desde la configuración de migración:
   ```javascript
   const { promptService } = require('../config/migrationConfig');
   ```

2. Usa las funciones estándar, que automáticamente usarán perfiles si está habilitado:
   ```javascript
   const response = await promptService.generateResponse(...);
   ```

## Preguntas Frecuentes

### ¿Qué pasa si no hay intenciones detectadas?

Si no se detectan intenciones, el sistema utilizará el perfil `general` por defecto.

### ¿Puedo usar diferentes modelos para diferentes perfiles?

Actualmente no, pero podrías extender el sistema para seleccionar modelos específicos por perfil modificando la configuración en `promptServiceV3.js`.

### ¿Cómo afecta esto al rendimiento?

El sistema de perfiles agrega una capa mínima de procesamiento que no afecta significativamente al rendimiento. La mayor parte del tiempo se sigue consumiendo en la generación de respuestas del LLM.

### ¿Puedo crear perfiles temporales para casos específicos?

Sí, puedes pasar un perfil personalizado directamente a la función `generateResponse`:

```javascript
const customProfile = {
    systemPrompt: "Instrucciones personalizadas...",
    temperature: 0.3,
    intentCategories: ['custom']
};

const response = await promptServiceV3.generateResponse(
    message,
    intents,
    entities,
    userData,
    conversationContext,
    { profile: customProfile }
);
```

### ¿Cómo extender el sistema para nuevos dominios?

1. Define nuevas intenciones en la base de datos
2. Crea un nuevo perfil en `promptProfilesConfig.js`
3. Mapea las nuevas intenciones a la categoría del perfil
4. Actualiza los scripts de prueba según sea necesario

---

## Recursos Adicionales

- [Código fuente](src/services/promptServiceV3.js)
- [Configuración de perfiles](src/config/promptProfilesConfig.js)
- [Script de prueba](scripts/test-prompt-profiles.js)
- [Script de activación](scripts/enable-prompt-profiles.js)

---

Desarrollado por el equipo de NLP, 2025.