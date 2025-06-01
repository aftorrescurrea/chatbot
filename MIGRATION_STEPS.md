# Pasos Simples para Migrar al Nuevo Sistema de Prompts

## Opción 1: Migración Directa (Recomendada si confías en las pruebas)

### Paso 1: Validar la migración
```bash
cd c:/Users/PIPE/Documents/PROYECTOS_VS/nodejsV1
node scripts/migrate-to-chat-format.js
```

### Paso 2: Si las pruebas pasan, actualizar los archivos

En `src/services/nlpService.js` (línea 7):
```javascript
// Cambiar esta línea:
const promptService = require('./promptService');
// Por esta:
const promptService = require('./promptServiceV2');
```

En `src/services/responseService.js` (línea 9):
```javascript
// Cambiar esta línea:
const promptService = require('./promptService');
// Por esta:
const promptService = require('./promptServiceV2');
```

### Paso 3: Reiniciar el servicio
```bash
npm restart
```

## Opción 2: Migración Gradual con Variable de Entorno

### Paso 1: Agregar variable de entorno en `.env`
```
USE_PROMPT_SERVICE_V2=false
```

### Paso 2: Reemplazar los servicios actuales

Renombrar archivos actuales:
```bash
mv src/services/nlpService.js src/services/nlpService.original.js
mv src/services/responseService.js src/services/responseService.original.js
```

Usar las versiones de migración:
```bash
cp src/services/nlpServiceMigration.js src/services/nlpService.js
cp src/services/responseServiceMigration.js src/services/responseService.js
```

### Paso 3: Probar con v1 (debe funcionar igual que antes)
```bash
npm restart
```

### Paso 4: Activar v2 cuando estés listo
Cambiar en `.env`:
```
USE_PROMPT_SERVICE_V2=true
```

Reiniciar:
```bash
npm restart
```

### Paso 5: Si todo funciona bien, hacer permanente
Una vez validado, puedes actualizar directamente los imports en los archivos originales.

## Verificación Rápida

Para verificar qué versión está usando tu sistema:
```javascript
// Agregar temporalmente en app.js o index.js
const { USE_PROMPT_SERVICE_V2 } = require('./src/config/migrationConfig');
console.log('Usando promptService:', USE_PROMPT_SERVICE_V2 ? 'V2 (Chat)' : 'V1 (Original)');
```

## Rollback de Emergencia

Si algo sale mal:

### Opción 1 (si usaste migración directa):
```javascript
// En nlpService.js y responseService.js, cambiar:
const promptService = require('./promptServiceV2');
// De vuelta a:
const promptService = require('./promptService');
```

### Opción 2 (si usaste migración gradual):
```
# En .env
USE_PROMPT_SERVICE_V2=false
```

## Monitoreo Post-Migración

Qué revisar después de migrar:
1. Los logs no muestran errores nuevos
2. Las respuestas del bot son coherentes
3. El tiempo de respuesta es similar o mejor
4. Los usuarios no reportan comportamiento extraño

## Troubleshooting Común

### Error: "Cannot find module './promptServiceV2'"
**Solución**: Asegúrate de que el archivo `src/services/promptServiceV2.js` existe

### Error: "chat API not found"
**Solución**: El sistema automáticamente usa fallback, pero puedes verificar tu versión de Ollama

### Las respuestas son diferentes
**Solución**: Ejecuta el script de validación para ver las diferencias específicas

## Soporte

Si encuentras problemas:
1. Revisa los logs en detalle
2. Ejecuta el script de validación
3. Compara respuestas entre v1 y v2
4. Usa la migración gradual para hacer pruebas A/B