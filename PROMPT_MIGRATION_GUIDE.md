# Guía de Migración: Sistema de Prompts con Formato de Chat

## Resumen Ejecutivo

Este documento detalla la migración del sistema actual de prompts (formato concatenado) al nuevo formato de chat con roles (system, user, assistant), compatible con modelos modernos como Qwen2.5:14b.

## Estado Actual del Sistema

### Arquitectura Actual
- **API utilizada**: `/generate` de Ollama
- **Formato**: Concatenación de `systemPrompt + userPrompt` en un solo string
- **Limitaciones**:
  - Pérdida de contexto en conversaciones largas
  - Dificultad para mantener historial conversacional
  - Menor precisión en respuestas contextuales

### Archivos Principales
1. `src/services/promptService.js` - Servicio principal de prompts
2. `src/utils/promptTemplates.js` - Plantillas de prompts
3. `src/config/promptConfig.js` - Configuración de intenciones y entidades
4. `src/services/nlpService.js` - Servicio NLP que consume los prompts

## Nueva Arquitectura Propuesta

### Formato de Chat con Roles
```json
[
  {
    "role": "system",
    "content": "Instrucciones del sistema y contexto general"
  },
  {
    "role": "user",
    "content": "Mensaje del usuario"
  },
  {
    "role": "assistant",
    "content": "Respuesta del asistente"
  }
]
```

### Ventajas del Nuevo Formato

#### 1. **Mejor Gestión del Contexto**
- Separación clara entre instrucciones del sistema y mensajes
- Historial conversacional completo y estructurado
- Mayor coherencia en respuestas multi-turno

#### 2. **Compatibilidad con Modelos Modernos**
- Qwen2.5:14b está optimizado para este formato
- Estándar de la industria (OpenAI, Anthropic, etc.)
- Mejor rendimiento y precisión

#### 3. **Flexibilidad Mejorada**
- Posibilidad de incluir ejemplos completos de conversación
- Control fino sobre el comportamiento del modelo
- Facilita la implementación de funciones avanzadas

## Implementación Detallada

### 1. Nuevo Servicio de Prompts (promptServiceV2.js)

#### Características Principales:
- **API de Chat**: Utiliza `/chat` en lugar de `/generate`
- **Fallback Automático**: Si `/chat` no está disponible, usa `/generate`
- **Compatibilidad Total**: Mantiene la misma interfaz pública
- **Mejoras de Rendimiento**: Gestión optimizada de reintentos y timeouts

#### Funciones Clave:

```javascript
// Consulta con formato de chat
async function queryModel(messages, options) {
  // Intenta usar API de chat primero
  // Fallback automático a generate si es necesario
}

// Detección de intenciones mejorada
async function detectIntentionsWithContext(message, context) {
  // Incluye historial conversacional
  // Mejor comprensión contextual
}

// Generación de respuestas con contexto completo
async function generateResponse(message, intents, entities, userData, context) {
  // Utiliza todo el historial
  // Respuestas más coherentes
}
```

### 2. Script de Migración

El script `scripts/migrate-to-chat-format.js` permite:
- Comparar resultados entre versiones
- Validar que no hay regresiones
- Medir mejoras de rendimiento
- Generar reportes detallados

#### Uso:
```bash
node scripts/migrate-to-chat-format.js
```

### 3. Cambios en el Flujo de Datos

#### Antes:
```
Usuario → Mensaje → Concatenación → Modelo → Respuesta
```

#### Después:
```
Usuario → Mensaje → Formato Chat → Modelo → Respuesta Contextual
         ↑                ↓
         └── Historial ←──┘
```

## Plan de Implementación

### Fase 1: Preparación (Completada)
- [x] Crear nuevo servicio de prompts (promptServiceV2.js)
- [x] Implementar compatibilidad con formato de chat
- [x] Mantener retrocompatibilidad
- [x] Crear script de validación

### Fase 2: Validación (Siguiente paso)
1. Ejecutar script de migración:
   ```bash
   cd /path/to/project
   node scripts/migrate-to-chat-format.js
   ```

2. Revisar resultados:
   - Verificar que no hay regresiones
   - Confirmar mejoras de rendimiento
   - Validar respuestas contextuales

### Fase 3: Migración Gradual
1. **Actualizar los servicios que usan promptService**:

   En **src/services/nlpService.js** (línea 7):
   ```javascript
   // Cambiar
   const promptService = require('./promptService');
   // Por
   const promptService = require('./promptServiceV2');
   ```

   En **src/services/responseService.js** (línea 9):
   ```javascript
   // Cambiar
   const promptService = require('./promptService');
   // Por
   const promptService = require('./promptServiceV2');
   ```

2. **Habilitar historial conversacional**:
   - El nuevo servicio ya maneja el historial automáticamente
   - Se integra con el MemoryService existente

3. **Monitorear en producción**:
   - Logs detallados de rendimiento
   - Métricas de precisión
   - Feedback de usuarios

### Fase 4: Optimización
1. Ajustar parámetros según modelo:
   - Temperature para Qwen2.5
   - Longitud de contexto
   - Tokens de parada

2. Implementar caché inteligente:
   - Guardar respuestas frecuentes
   - Reducir latencia

## Ejemplos de Mejora

### Ejemplo 1: Confirmación Contextual

#### Antes:
```
Bot: "¿Tu nombre es Juan Pérez?"
Usuario: "Sí"
Resultado: No entiende qué está confirmando
```

#### Después:
```json
[
  {"role": "assistant", "content": "¿Tu nombre es Juan Pérez?"},
  {"role": "user", "content": "Sí"}
]
Resultado: Entiende que confirma el nombre
```

### Ejemplo 2: Continuidad de Tema

#### Antes:
```
Usuario: "Quiero información del ERP"
Bot: [Responde sobre ERP]
Usuario: "¿Cuánto cuesta?"
Resultado: Puede no entender que se refiere al ERP
```

#### Después:
```json
[
  {"role": "user", "content": "Quiero información del ERP"},
  {"role": "assistant", "content": "[Información sobre ERP]"},
  {"role": "user", "content": "¿Cuánto cuesta?"}
]
Resultado: Entiende que el precio es sobre el ERP
```

## Consideraciones de Seguridad

1. **Validación de Entrada**: El nuevo formato requiere validación más estricta
2. **Límites de Contexto**: Controlar el tamaño del historial
3. **Sanitización**: Limpiar contenido antes de incluir en prompts

## Métricas de Éxito

### Rendimiento
- Reducción de latencia: 10-20% esperado
- Mejor uso de caché
- Menos llamadas al modelo para aclaraciones

### Precisión
- Mayor coherencia contextual
- Menos malentendidos
- Mejor manejo de confirmaciones

### Experiencia de Usuario
- Conversaciones más naturales
- Menos repeticiones
- Respuestas más relevantes

## Troubleshooting

### Problema: API de chat no disponible
**Solución**: El sistema automáticamente usa fallback a `/generate`

### Problema: Respuestas diferentes
**Solución**: Ejecutar script de validación para identificar cambios

### Problema: Mayor uso de memoria
**Solución**: Implementar límite de historial conversacional

## Conclusión

La migración al formato de chat representa una mejora significativa en:
- Capacidad contextual
- Precisión de respuestas
- Compatibilidad con modelos modernos
- Experiencia de usuario

El proceso está diseñado para ser gradual y seguro, con validación en cada paso y fallbacks automáticos para garantizar la continuidad del servicio.

## Próximos Pasos

1. Ejecutar el script de validación
2. Revisar resultados con el equipo
3. Planificar migración gradual
4. Monitorear métricas post-implementación

---

**Nota**: Esta migración no afecta la funcionalidad actual. Todos los cambios son retrocompatibles y pueden revertirse fácilmente si es necesario.