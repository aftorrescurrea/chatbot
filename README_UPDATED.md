# WhatsApp ERP Chatbot con Gestión Dinámica de Intenciones y Entidades

Bot de WhatsApp inteligente para gestión de pruebas de ERP con capacidades de procesamiento de lenguaje natural mejoradas. Ahora con gestión dinámica de intenciones y entidades a través de API REST.

## 🚀 Características Principales

- **Bot de WhatsApp** para atención automatizada 24/7
- **Procesamiento de lenguaje natural** con Ollama
- **Gestión dinámica de intenciones y entidades** vía API REST
- **Memoria conversacional contextual**
- **Base de datos MongoDB** para persistencia
- **API REST** para administración de intenciones y entidades
- **Migración automática** de configuraciones hardcodeadas

## 📋 Requisitos Previos

- Node.js 14.x o superior
- MongoDB 4.4 o superior
- Ollama instalado y ejecutándose
- WhatsApp Business o personal

## 🛠️ Instalación

1. **Clonar el repositorio**
```bash
git clone [URL_DEL_REPOSITORIO]
cd whatsapp-erp-chatbot
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

4. **Inicializar la base de datos**
```bash
npm run init-db
```

5. **Migrar intenciones y entidades**
```bash
npm run migrate
```

## 🚀 Ejecución

### Opción 1: Ejecutar todo (Bot + API)
```bash
npm start
```

### Opción 2: Ejecutar por separado
```bash
# Terminal 1 - API REST
npm run start:api

# Terminal 2 - Bot de WhatsApp
npm run start:bot
```

### Modo desarrollo
```bash
npm run dev
```

## 📚 API REST

La API REST está disponible en `http://localhost:3000` (puerto configurable).

### Endpoints principales:

#### Intenciones
- `GET /api/intents` - Obtener todas las intenciones
- `POST /api/intents` - Crear nueva intención
- `PUT /api/intents/:id` - Actualizar intención
- `DELETE /api/intents/:id` - Eliminar intención
- `GET /api/intents/nlp` - Obtener intenciones para NLP

#### Entidades
- `GET /api/entities` - Obtener todas las entidades
- `POST /api/entities` - Crear nueva entidad
- `PUT /api/entities/:id` - Actualizar entidad
- `DELETE /api/entities/:id` - Eliminar entidad
- `GET /api/entities/nlp` - Obtener entidades para NLP

Ver [API_DOCUMENTATION.md](API_DOCUMENTATION.md) para documentación completa.

## 🔄 Flujo de Funcionamiento

1. **Usuario envía mensaje** por WhatsApp
2. **Bot detecta intenciones** usando las configuradas en BD
3. **Bot extrae entidades** según las definidas en BD
4. **Procesamiento contextual** con memoria conversacional
5. **Respuesta inteligente** basada en el contexto

## 📝 Gestión de Intenciones y Entidades

### Agregar nueva intención vía API:
```bash
curl -X POST http://localhost:3000/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "consulta_demo",
    "displayName": "Consulta de Demo",
    "examples": ["Quiero ver una demo", "Mostrar demostración"]
  }'
```

### Agregar nueva entidad vía API:
```bash
curl -X POST http://localhost:3000/api/entities \
  -H "Content-Type: application/json" \
  -d '{
    "name": "producto",
    "displayName": "Producto",
    "type": "text",
    "examples": [
      {"text": "Me interesa el módulo de ventas", "value": "módulo de ventas"}
    ]
  }'
```

## 🗄️ Estructura de Base de Datos

### Colecciones principales:
- `intents` - Intenciones del sistema
- `entities` - Entidades reconocibles
- `users` - Usuarios del sistema
- `conversations` - Historial de conversaciones
- `credentials` - Credenciales de prueba

## 🐛 Depuración y Logs

```bash
# Ver logs en tiempo real
tail -f logs/app.log

# Verificar estado de la BD
npm run db-status

# Listar usuarios
npm run list-users
```

## 📊 Monitoreo

El sistema incluye:
- Estadísticas de uso cada hora
- Verificación de salud cada 5 minutos
- Limpieza automática de datos antiguos cada 30 minutos

## 🔧 Configuración Avanzada

### Variables de entorno importantes:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/whatsapp-erp-chatbot

# Ollama
OLLAMA_API_URL=http://localhost:11434/api
OLLAMA_MODEL=llama3

# API REST
API_PORT=3000

# WhatsApp
WHATSAPP_SESSION_DATA_PATH=./whatsapp-session
```

## 🚨 Solución de Problemas

### El bot no se conecta a WhatsApp:
1. Eliminar carpeta `whatsapp-session`
2. Reiniciar el bot
3. Escanear nuevo código QR

### La API no responde:
1. Verificar que MongoDB esté ejecutándose
2. Verificar puerto 3000 no esté ocupado
3. Revisar logs de errores

### Las intenciones no se detectan:
1. Verificar que Ollama esté ejecutándose
2. Ejecutar migración: `npm run migrate`
3. Verificar intenciones en BD: `GET /api/intents`

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature
3. Commit tus cambios
4. Push a la rama
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la licencia ISC.