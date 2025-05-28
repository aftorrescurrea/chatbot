# Sugerencias de Optimización para el Sistema

## 1. Mejorar Tiempos de Respuesta

### Problema
Los tiempos de procesamiento con Ollama son muy largos (1-2 minutos por request).

### Soluciones Propuestas

#### A. Implementar Caché de Respuestas
```javascript
// En nlpService.js
const intentCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

const detectIntentsWithCache = async (message, phoneNumber) => {
  const cacheKey = `${message.toLowerCase().trim()}`;
  const cached = intentCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`Intenciones obtenidas desde caché para: "${message}"`);
    return cached.result;
  }
  
  const result = await detectIntentsWithContext(message, phoneNumber);
  intentCache.set(cacheKey, { result, timestamp: Date.now() });
  
  return result;
};
```

#### B. Modelo Más Ligero
- Considerar usar un modelo más pequeño como `tinyllama` o `phi`
- O configurar Ollama con parámetros de generación más rápidos

#### C. Implementar Timeout y Fallback
```javascript
const detectIntentsWithTimeout = async (message, options) => {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 30000)
  );
  
  try {
    return await Promise.race([
      detectIntentsWithContext(message, options),
      timeout
    ]);
  } catch (error) {
    // Fallback a detección por patrones
    return detectIntentsByPatterns(message);
  }
};
```

## 2. Optimización de Base de Datos

### A. Caché de Intenciones y Entidades
```javascript
// Cargar al inicio y refrescar cada X minutos
let cachedIntents = null;
let cachedEntities = null;

const refreshCache = async () => {
  cachedIntents = await intentService.getIntentsForNLP();
  cachedEntities = await entityService.getEntitiesForNLP();
};

// Refrescar cada 5 minutos
setInterval(refreshCache, 5 * 60 * 1000);
```

### B. Índices Compuestos
```javascript
// En User.js
UserSchema.index({ phone: 1, email: 1 });

// En Conversation.js
ConversationSchema.index({ userId: 1, timestamp: -1 });
```

## 3. Procesamiento Paralelo

### Para mensajes con múltiples operaciones:
```javascript
const processMessage = async (message, phoneNumber) => {
  const [intents, user] = await Promise.all([
    detectIntentsWithContext(message, phoneNumber),
    userService.findByPhone(phoneNumber)
  ]);
  
  // Procesar en paralelo si es posible
  const [entities, context] = await Promise.all([
    extractEntitiesWithContext(message, phoneNumber),
    getContextForPrompt(phoneNumber)
  ]);
  
  return { intents, entities, user, context };
};
```

## 4. Sistema de Colas para Procesamiento Pesado

### Implementar Bull o similar:
```javascript
const Queue = require('bull');
const nlpQueue = new Queue('nlp-processing');

// Procesar en background
nlpQueue.process(async (job) => {
  const { message, phoneNumber } = job.data;
  return await processHeavyNLP(message, phoneNumber);
});

// En el controller
const handleMessageAsync = async (message, phoneNumber) => {
  // Respuesta rápida inicial
  await sendQuickResponse(phoneNumber, "Procesando tu mensaje...");
  
  // Procesar en background
  const job = await nlpQueue.add({ message, phoneNumber });
  
  job.on('completed', (result) => {
    sendFinalResponse(phoneNumber, result);
  });
};
```

## 5. Monitoreo y Métricas

### Implementar métricas de rendimiento:
```javascript
const metrics = {
  intentDetectionTime: [],
  entityExtractionTime: [],
  totalResponseTime: []
};

const trackMetric = (type, duration) => {
  metrics[type].push(duration);
  
  // Calcular promedios cada X mensajes
  if (metrics[type].length % 100 === 0) {
    const avg = metrics[type].reduce((a, b) => a + b) / metrics[type].length;
    logger.info(`Promedio ${type}: ${avg}ms`);
  }
};
```

## 6. Detección Local de Intenciones Simples

### Para intenciones básicas, usar detección por patrones:
```javascript
const quickIntentDetection = (message) => {
  const patterns = {
    saludo: /^(hola|buenos|buenas|saludos|hey|hi)/i,
    despedida: /^(adios|chao|hasta|bye|nos vemos)/i,
    afirmacion: /^(si|sí|claro|ok|vale|correcto|confirmo)/i,
    negacion: /^(no|nada|ninguno|tampoco)/i
  };
  
  for (const [intent, pattern] of Object.entries(patterns)) {
    if (pattern.test(message.trim())) {
      return { intents: [intent], confidence: 0.9 };
    }
  }
  
  return null;
};

// Usar detección rápida primero
const detectIntentsOptimized = async (message, phoneNumber) => {
  const quickResult = quickIntentDetection(message);
  if (quickResult && quickResult.confidence > 0.8) {
    return quickResult;
  }
  
  // Si no es una intención simple, usar Ollama
  return await detectIntentsWithContext(message, phoneNumber);
};
```

## 7. Configuración de Ollama Optimizada

### En .env agregar:
```env
# Configuración de Ollama optimizada
OLLAMA_NUM_PREDICT=50  # Limitar tokens de respuesta
OLLAMA_TEMPERATURE=0.1  # Respuestas más determinísticas
OLLAMA_TOP_K=10        # Limitar vocabulario
OLLAMA_REPEAT_PENALTY=1.2  # Evitar repeticiones
```

### En promptService.js:
```javascript
const optimizedConfig = {
  model: process.env.OLLAMA_MODEL,
  stream: false,
  options: {
    num_predict: parseInt(process.env.OLLAMA_NUM_PREDICT || '50'),
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.1'),
    top_k: parseInt(process.env.OLLAMA_TOP_K || '10'),
    repeat_penalty: parseFloat(process.env.OLLAMA_REPEAT_PENALTY || '1.2')
  }
};
```

## 8. Respuestas Pre-generadas

### Para flujos comunes:
```javascript
const preGeneratedResponses = {
  'saludo_inicial': [
    "¡Hola! Soy el asistente de ERP Demo. ¿En qué puedo ayudarte?",
    "¡Bienvenido! ¿Te gustaría probar nuestro sistema ERP?",
    "¡Hola! Estoy aquí para ayudarte con información sobre ERP Demo"
  ],
  'solicitud_info_prueba': [
    "Para crear tu cuenta necesito: nombre, email, usuario y contraseña",
    "¡Genial! Necesito algunos datos para configurar tu acceso de prueba"
  ]
};

const getQuickResponse = (intent, context) => {
  const responses = preGeneratedResponses[`${intent}_${context}`] || 
                   preGeneratedResponses[intent];
  
  if (responses) {
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  return null;
};
```

## 9. Implementación Recomendada por Fases

### Fase 1 (Inmediata):
1. Implementar detección local para intenciones simples
2. Agregar caché de respuestas
3. Configurar timeouts

### Fase 2 (Corto plazo):
1. Optimizar configuración de Ollama
2. Implementar respuestas pre-generadas
3. Agregar métricas de rendimiento

### Fase 3 (Mediano plazo):
1. Evaluar modelos más ligeros
2. Implementar sistema de colas
3. Considerar servicios externos de NLP (Dialogflow, Wit.ai)

## 10. Script de Prueba de Rendimiento

```javascript
// test-performance.js
const nlpService = require('./src/services/nlpService');

const testMessages = [
  "hola",
  "quiero probar el sistema",
  "mi nombre es Juan Pérez",
  "juan@email.com",
  "adiós"
];

const runPerformanceTest = async () => {
  console.log('Iniciando pruebas de rendimiento...\n');
  
  for (const message of testMessages) {
    const start = Date.now();
    
    const result = await nlpService.detectIntentsWithContext(
      message, 
      'test-user'
    );
    
    const duration = Date.now() - start;
    
    console.log(`Mensaje: "${message}"`);
    console.log(`Intenciones: ${result.intents.join(', ')}`);
    console.log(`Tiempo: ${duration}ms\n`);
  }
};

runPerformanceTest();
```

## Conclusión

Con estas optimizaciones, el sistema debería reducir significativamente los tiempos de respuesta:
- Respuestas instantáneas para saludos y confirmaciones simples
- 5-10 segundos para consultas complejas (vs 1-2 minutos actuales)
- Mayor escalabilidad para múltiples usuarios simultáneos