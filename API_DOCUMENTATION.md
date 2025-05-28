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
    "conversationExamples": [...]
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

### 7. Eliminar una intención (soft delete)
```
DELETE /api/intents/:id
```

### 8. Importar intenciones desde configuración
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