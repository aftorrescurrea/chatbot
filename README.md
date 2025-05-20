# Chatbot WhatsApp para Gestión de Acceso a ERP

Este proyecto implementa un chatbot para WhatsApp que permite a los usuarios solicitar acceso de prueba a un sistema ERP. El chatbot detecta intenciones, extrae entidades relevantes, registra usuarios en MongoDB y genera credenciales de acceso.

## Características Principales

- 🤖 **Detección de Intenciones**: Utiliza Ollama para comprender las solicitudes de los usuarios.
- 🔍 **Extracción de Entidades**: Captura información relevante como nombres y correos electrónicos.
- 💾 **Gestión de Base de Datos**: Almacena información de usuarios en MongoDB.
- 🔐 **Generación de Credenciales**: Crea credenciales seguras para acceso al servicio.
- 💬 **Flujo de Conversación**: Maneja conversaciones naturales para recopilar información.
- 🔒 **Seguridad**: Implementa almacenamiento seguro de datos sensibles.

## Requisitos Previos

- Node.js v14 o superior
- Acceso a MongoDB Atlas (servicio externo)
- Acceso a un servidor Ollama (servicio externo)
- Docker y Docker Compose (opcional, para despliegue contenerizado)

## Estructura del Proyecto

```
.
├── src/
│   ├── config/         # Configuración de la aplicación
│   ├── controllers/    # Controladores de la lógica de negocio
│   ├── models/         # Modelos de datos
│   ├── services/       # Servicios externos (WhatsApp, Ollama, etc.)
│   └── utils/          # Utilidades y helpers
├── .env                # Variables de entorno
├── Dockerfile          # Configuración para Docker
├── docker-compose.yml  # Configuración de servicios
├── healthcheck.js      # Script de verificación de salud
├── index.js            # Punto de entrada de la aplicación
└── package.json        # Dependencias y scripts
```

## Instalación

### Método 1: Instalación Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/whatsapp-erp-chatbot.git
   cd whatsapp-erp-chatbot
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Configura las variables de entorno:
   ```bash
   cp .env.example .env
   # Edita el archivo .env con tus configuraciones
   ```

4. Inicia la aplicación:
   ```bash
   npm start
   ```

### Método 2: Usando Docker

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/whatsapp-erp-chatbot.git
   cd whatsapp-erp-chatbot
   ```

2. Configura las variables de entorno:
   ```bash
   cp .env.example .env
   # Edita el archivo .env con tus configuraciones
   # Asegúrate de configurar correctamente las URLs de MongoDB Atlas y Ollama
   ```

3. Inicia el contenedor:
   ```bash
   docker-compose up -d
   ```

> **Nota**: El archivo docker-compose.yml solo contiene el servicio del chatbot. MongoDB Atlas y Ollama son servicios externos que deben estar configurados y accesibles.

## Configuración

El archivo `.env` contiene todas las configuraciones necesarias:

```
# Configuración de MongoDB (servicio externo)
MONGODB_URI=mongodb+srv://usuario:contraseña@cluster0.ejemplo.mongodb.net/erp-chatbot

# Configuración de Ollama (servicio externo)
OLLAMA_API_URL=http://servidor-ollama-externo:11434/api
OLLAMA_MODEL=llama3

# Configuración del servicio ERP
ERP_SERVICE_URL=https://erp-demo.ejemplo.com
ERP_ADMIN_URL=https://erp-demo.ejemplo.com/admin

# Configuración de administración
ADMIN_EMAIL=admin@ejemplo.com

# Configuración de seguridad
SESSION_SECRET=tu_clave_secreta_muy_segura_aqui
PASSWORD_SALT_ROUNDS=10

# Configuración de WhatsApp
WHATSAPP_SESSION_DATA_PATH=./whatsapp-session
```

## Uso

1. Inicia la aplicación según el método de instalación elegido.
2. Escanea el código QR que aparece en la consola con WhatsApp.
3. El chatbot estará listo para recibir mensajes y procesar solicitudes.

## Flujo de Conversación

1. El usuario envía un mensaje solicitando probar el ERP.
2. El chatbot detecta la intención y extrae entidades disponibles.
3. Si falta información, el chatbot la solicita de manera conversacional.
4. Una vez recopilada toda la información, se registra al usuario y se generan credenciales.
5. El chatbot envía las credenciales y la URL de acceso al usuario.

## Gestión de la Base de Datos

El proyecto incluye scripts para inicializar y gestionar la base de datos MongoDB:

### Inicialización de la Base de Datos

Para crear la estructura inicial de la base de datos en MongoDB Atlas:

```bash
npm run init-db
```

Este comando:
- Crea las colecciones necesarias (users, conversations, credentials, logs)
- Establece los índices para optimizar las consultas
- Crea un usuario administrador si no existe

### Gestión de Usuarios y Colecciones

El proyecto incluye un script para gestionar la base de datos:

```bash
# Ver todos los usuarios registrados
npm run list-users

# Ver el estado general de la base de datos
npm run db-status

# Buscar un usuario específico
npm run manage-db find-user usuario@ejemplo.com

# Eliminar un usuario
npm run manage-db delete-user +1234567890

# Limpiar una colección
npm run manage-db clear-collection users
```

Para ver todas las opciones disponibles:

```bash
npm run manage-db help
```

### Copias de Seguridad

El proyecto incluye un script para realizar copias de seguridad de la base de datos:

```bash
# Realizar una copia de seguridad en el directorio por defecto (./backups/YYYY-MM-DD/)
npm run backup-db

# Realizar una copia de seguridad en un directorio específico
npm run backup-db -- ./mi-directorio-backup
```

Las copias de seguridad incluyen:
- Archivos JSON para cada colección
- Un archivo de metadatos con información sobre la copia de seguridad

Para restaurar una copia de seguridad:

```bash
# Restaurar desde la copia de seguridad más reciente
npm run restore-db

# Restaurar desde una copia de seguridad específica
npm run restore-db -- ./backups/2025-05-17
```

> ⚠️ **Advertencia**: La restauración reemplazará todos los datos existentes en la base de datos.

## Desarrollo

### Añadir Nuevas Intenciones

Para añadir nuevas intenciones, modifica el archivo `src/services/nlpService.js` y actualiza la función `createIntentPrompt` con las nuevas intenciones.

### Añadir Nuevas Entidades

Para añadir nuevas entidades a extraer, modifica el archivo `src/services/entityService.js` y actualiza la función `createEntityExtractionPrompt` con las nuevas entidades.

### Estructura de la Base de Datos

La base de datos MongoDB contiene las siguientes colecciones:

1. **users**: Almacena la información de los usuarios registrados
   - Campos principales: phone, name, email, company, position
   - Información de acceso: credentials, expirationDate
   - Metadatos: registrationDate, lastActivity

2. **conversations**: Almacena el historial de conversaciones
   - Mensajes enviados y recibidos
   - Timestamps de cada mensaje
   - Referencias al usuario

3. **credentials**: Almacena las credenciales generadas
   - Usuario y contraseña (encriptada)
   - Fecha de creación y expiración
   - Servicio asociado

4. **logs**: Almacena logs del sistema para monitoreo

## Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo LICENSE para más detalles.