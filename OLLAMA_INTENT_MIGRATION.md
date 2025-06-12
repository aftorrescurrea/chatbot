# Guía de Migración a Detección de Intenciones con Ollama

Esta guía explica cómo se ha implementado y cómo utilizar el nuevo sistema de detección de intenciones basado en Ollama en el proyecto.

## Resumen de cambios

Se ha implementado un nuevo sistema especializado para la detección de intenciones que utiliza modelos de Ollama. Esta implementación:

1. Mejora la precisión de detección de intenciones
2. Optimiza los prompts específicamente para esta tarea
3. Reduce la latencia al usar un modelo más pequeño y especializado
4. Mantiene compatibilidad con el sistema anterior mediante configuración centralizada

## Nuevos componentes

- **ollamaIntentDetectionService.js**: Servicio especializado para detección de intenciones con Ollama
- **nlpServiceV2.js**: Nueva versión del servicio NLP que utiliza el servicio especializado de Ollama
- **test-ollama-intent-detection.js**: Script para probar y comparar el rendimiento del nuevo sistema

## Configuración

### Variables de entorno

Las siguientes variables de entorno se han añadido al sistema:

```
# Configuración de Ollama
OLLAMA_API_URL=http://localhost:11434/api
OLLAMA_MODEL=llama3:8b              # Modelo general
OLLAMA_INTENT_MODEL=qwen2.5:14b     # Modelo específico para intenciones

# Configuración de servicios
NLP_SERVICE_VERSION=v2              # v1 (original) o v2 (nuevo con Ollama)
PROMPT_SERVICE_VERSION=v1           # Versión del servicio de prompts

# Configuración para pruebas
COMPARE_NLP_VERSIONS=false
COMPARE_PROMPT_VERSIONS=false
```

### Modelos recomendados

Para la detección de intenciones, se recomiendan estos modelos de Ollama:

1. **qwen2.5:14b**: Excelente balance entre rendimiento y precisión
2. **llama3:8b**: Buena opción más ligera
3. **llama3:70b**: Mayor precisión pero más lento
4. **mistral:7b**: Alternativa compacta

## Cómo usar el nuevo sistema

### Activar el nuevo servicio NLP

Para utilizar el nuevo servicio NLP basado en Ollama, simplemente configure:

```
NLP_SERVICE_VERSION=v2
```

en el archivo .env. El sistema utilizará automáticamente el nuevo servicio para la detección de intenciones.

### Uso directo del servicio especializado

También puede utilizar directamente el servicio especializado en su código:

```javascript
const ollamaIntentService = require('./services/ollamaIntentDetectionService');

// Detectar intenciones sin contexto
const result = await ollamaIntentService.detectIntentions(message);

// Con contexto conversacional
const result = await ollamaIntentService.detectIntentions(message, context);
```

## Pruebas y evaluación

Para probar el nuevo sistema de detección de intenciones, ejecute:

```bash
node scripts/test-ollama-intent-detection.js
```

Este script comparará la precisión y el rendimiento entre el sistema original y el nuevo.

### Métricas disponibles

El script de prueba proporciona las siguientes métricas:
- Precisión (Precision): Qué porcentaje de las intenciones detectadas son correctas
- Exhaustividad (Recall): Qué porcentaje de las intenciones esperadas fueron detectadas
- Puntuación F1 (F1-Score): Media armónica entre precisión y exhaustividad
- Tiempo de respuesta: Comparación de tiempos de procesamiento

## Optimización de prompts

El nuevo servicio incluye un prompt optimizado específicamente para la detección de intenciones. Este prompt:

1. Es más conciso y específico para la tarea
2. Incluye ejemplos claros para cada intención
3. Está diseñado para funcionar bien con modelos más pequeños
4. Formatea adecuadamente la respuesta para facilitar el parsing

Para personalizar el prompt, puede modificar la función `createOptimizedPrompt` en `ollamaIntentDetectionService.js`.

## Compatibilidad con el sistema anterior

El sistema mantiene compatibilidad total con el sistema anterior. La función `nlpService.detectIntentsWithContext` sigue funcionando exactamente igual, pero internamente utilizará el método optimizado si `NLP_SERVICE_VERSION=v2`.

## Recomendaciones

1. **Modelos más pequeños**: Para entornos de producción con muchas solicitudes simultáneas, use modelos más pequeños como llama3:8b
2. **Ajuste de temperatura**: Reduzca la temperatura a 0.1 para resultados más consistentes
3. **Cache de resultados**: Considere implementar un sistema de caché para consultas frecuentes
4. **Monitoreo**: Supervise el rendimiento y la precisión en producción

## Siguientes pasos

- Implementar un servicio similar para extracción de entidades
- Añadir capacidades de fine-tuning al modelo para mejorar la precisión en dominios específicos
- Explorar la posibilidad de utilizar embedding para detección de intenciones en casos ambiguos