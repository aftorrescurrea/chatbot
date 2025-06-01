# API de Gestión de Intenciones y Entidades

## Base URL
```
http://localhost:3000/api
```

## Endpoints de Intenciones

### 1. Obtener todas las intenciones
```
GET /api/intents?includeInactive=false
```

**Query Parameters:**
- `includeInactive` (opcional): Si es `true`, incluye intenciones inactivas

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "count": 11,
  "data": [
    {
      "_id": "...",
      "name": "saludo",
      "displayName": "Saludo",
      "description": "",
      "examples": ["Hola", "Buenos días", "Buenas tardes"],
      "priority": 1,
      "isActive": true
    }
  ]
}
```

### 2. Obtener intenciones para NLP
```
GET /api/intents/nlp
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "supportedIntents": ["saludo", "despedida", ...],
    "intentExamples": {
      "saludo": ["Hola", "Buenos días", ...]
    },
    "conversationExamples": [...],
    "detectionPatterns": {
      "guia_reportes": ["reporte", "reportes", "informe", ...]
    },
    "intentRelationships": {
      "guia_reportes": [
        {
          "intent": "tutorial_general",
          "condition": "contains",
          "keywords": ["ayuda", "tutorial", "explicar"]
        }
      ]
    }
  }
}
```

### 3. Obtener una intención por ID
```
GET /api/intents/:id
```

### 4. Crear una nueva intención
```
POST /api/intents
```

**Body:**
```json
{
  "name": "nueva_intencion",
  "displayName": "Nueva Intención",
  "description": "Descripción opcional",
  "examples": ["Ejemplo 1", "Ejemplo 2"],
  "priority": 12
}
```

### 5. Actualizar una intención
```
PUT /api/intents/:id
```

### 6. Agregar ejemplos a una intención
```
PATCH /api/intents/:id/examples
```

**Body:**
```json
{
  "examples": ["Nuevo ejemplo 1", "Nuevo ejemplo 2"]
}
```

### 7. Actualizar patrones de detección
```
PATCH /api/intents/:id/patterns
```

**Body:**
```json
{
  "patterns": ["reporte", "reportes", "informe", "crear reporte", "generar informe"]
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "guia_reportes",
    "displayName": "Guía de Reportes",
    "detectionPatterns": ["reporte", "reportes", "informe", "crear reporte", "generar informe"],
    "keywordDetectionEnabled": true,
    "...": "..."
  },
  "message": "5 patrones de detección actualizados"
}
```

### 8. Activar/desactivar detección por palabras clave
```
PATCH /api/intents/:id/keyword-detection
```

**Body:**
```json
{
  "enabled": true
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "guia_reportes",
    "keywordDetectionEnabled": true,
    "...": "..."
  },
  "message": "Detección por palabras clave habilitada"
}
```

### 9. Actualizar relaciones entre intenciones
```
PATCH /api/intents/:id/relations
```

**Body:**
```json
{
  "relations": [
    {
      "intent": "tutorial_general",
      "condition": "contains",
      "keywords": ["ayuda", "tutorial", "explicar"]
    }
  ]
}
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "guia_reportes",
    "relatedIntents": [
      {
        "intent": "tutorial_general",
        "condition": "contains",
        "keywords": ["ayuda", "tutorial", "explicar"]
      }
    ],
    "...": "..."
  },
  "message": "1 relaciones actualizadas"
}
```

### 10. Eliminar una intención (soft delete)
```
DELETE /api/intents/:id
```

### 11. Importar intenciones desde configuración
```
POST /api/intents/import
```

## Endpoints de Entidades

### 1. Obtener todas las entidades
```
GET /api/entities?includeInactive=false&type=text
```

**Query Parameters:**
- `includeInactive` (opcional): Si es `true`, incluye entidades inactivas
- `type` (opcional): Filtrar por tipo de entidad

### 2. Obtener tipos de entidad disponibles
```
GET /api/entities/types
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "data": ["text", "email", "phone", "date", "number", "url", "custom"]
}
```

### 3. Obtener entidades para NLP
```
GET /api/entities/nlp
```

### 4. Obtener una entidad por ID
```
GET /api/entities/:id
```

### 5. Crear una nueva entidad
```
POST /api/entities
```

**Body:**
```json
{
  "name": "nueva_entidad",
  "displayName": "Nueva Entidad",
  "description": "Descripción opcional",
  "type": "text",
  "examples": [
    {
      "text": "Mi nombre es Juan",
      "value": "Juan"
    }
  ],
  "patterns": ["regex opcional"],
  "validators": {
    "regex": "^[a-zA-Z]+$",
    "minLength": 2,
    "maxLength": 50
  }
}
```

### 6. Actualizar una entidad
```
PUT /api/entities/:id
```

### 7. Agregar ejemplos a una entidad
```
PATCH /api/entities/:id/examples
```

**Body:**
```json
{
  "examples": [
    {
      "text": "Me llamo María",
      "value": "María"
    }
  ]
}
```

### 8. Eliminar una entidad (soft delete)
```
DELETE /api/entities/:id
```

### 9. Importar entidades desde configuración
```
POST /api/entities/import
```

## Endpoint de Salud

```
GET /api/health
```

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "status": "healthy",
  "services": {
    "mongodb": "connected",
    "api": "running"
  },
  "timestamp": "2025-05-28T17:45:00.000Z"
}
```

## Códigos de Estado HTTP

- `200 OK`: Operación exitosa
- `201 Created`: Recurso creado exitosamente
- `400 Bad Request`: Error en los datos enviados
- `404 Not Found`: Recurso no encontrado
- `409 Conflict`: Conflicto (ej: nombre duplicado)
- `500 Internal Server Error`: Error del servidor

## Migración de Datos

Para migrar las intenciones y entidades hardcodeadas a la base de datos:

```bash
npm run migrate
```

## Ejemplos de Uso con cURL

### Crear una intención:
```bash
curl -X POST http://localhost:3000/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "consulta_horario",
    "displayName": "Consulta de Horario",
    "examples": ["¿A qué hora abren?", "¿Cuál es su horario?", "Horario de atención"]
  }'
```

### Obtener todas las entidades activas:
```bash
curl http://localhost:3000/api/entities
```

### Actualizar una entidad:
```bash
curl -X PUT http://localhost:3000/api/entities/ID_ENTIDAD \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Nueva descripción",
    "isActive": true
  }'
```

### Actualizar patrones de detección para una intención:
```bash
curl -X PATCH http://localhost:3000/api/intents/ID_INTENCION/patterns \
  -H "Content-Type: application/json" \
  -d '{
    "patterns": ["reporte", "reportes", "informe", "crear reporte"]
  }'
```

### Activar detección por palabras clave:
```bash
curl -X PATCH http://localhost:3000/api/intents/ID_INTENCION/keyword-detection \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true
  }'
```

## Detección basada en patrones

El sistema ahora soporta un enfoque híbrido para la detección de intenciones que combina:
1. Detección basada en LLM (Large Language Model)
2. Detección basada en patrones y palabras clave

### Componentes principales

#### Patrones de detección
Los patrones son fragmentos de texto que, si se encuentran en un mensaje del usuario, activan automáticamente una intención específica. Esta funcionalidad es especialmente útil para:
- Intenciones con términos técnicos o específicos (ej: "reportes", "facturas")
- Casos donde el LLM puede tener dificultades para detectar correctamente

#### Relaciones entre intenciones
Define cómo se relacionan las intenciones entre sí. Por ejemplo:
- Si se detecta "guia_reportes" y el mensaje contiene "ayuda", también se activa "tutorial_general"
- Soporta diferentes tipos de condiciones:
  - `always`: La intención relacionada siempre se activará cuando se detecte la intención principal
  - `contains`: La intención relacionada se activará solo si el mensaje contiene ciertas palabras clave

### Flujo de detección
1. Se envía el mensaje al LLM para detección principal
2. Se aplica post-procesamiento basado en patrones y palabras clave
3. Se aplican reglas de relación entre intenciones
4. Se devuelve el conjunto final de intenciones detectadas

### Beneficios
- Mayor precisión en la detección de intenciones específicas
- Menor dependencia de la calidad del modelo LLM
- Personalizable a través de la API
- Permite ajustes específicos sin necesidad de reentrenar modelos