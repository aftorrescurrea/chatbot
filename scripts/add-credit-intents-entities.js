/**
 * Script para agregar intenciones y entidades relacionadas con créditos y cobranza
 * Ejecutar con: node scripts/add-credit-intents-entities.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Intent = require('../src/models/Intent');
const Entity = require('../src/models/Entity');
const { logger } = require('../src/utils/logger');

// Conexión a la base de datos
mongoose.connect(process.env.MONGODB_URI)
  .then(() => logger.info('Conectado a MongoDB'))
  .catch(err => {
    logger.error(`Error de conexión a MongoDB: ${err.message}`);
    process.exit(1);
  });

// Nuevas intenciones de créditos y cobranza
const creditIntents = [
  {
    name: 'consultar_saldo_cliente',
    displayName: 'Consultar Saldo Cliente',
    description: 'El usuario quiere conocer el saldo o estado de cuenta de un cliente',
    examples: [
      '¿Cuál es el saldo del cliente Juan Pérez?',
      'Necesito saber cuánto debe el cliente con cédula 123456',
      'Consulta de saldo para el cliente María López',
      '¿Cuánto debe el cliente de la ruta 5?',
      'Ver estado de cuenta del cliente',
      'Dame el saldo pendiente de cobro para Juan'
    ],
    priority: 50,
    category: 'credit',
    keywordDetectionEnabled: true,
    detectionPatterns: [
      'saldo', 'debe', 'deuda', 'pendiente', 'estado de cuenta', 'balance'
    ],
    metadata: {
      requiresAuth: true,
      sensitiveData: true
    }
  },
  {
    name: 'registrar_pago',
    displayName: 'Registrar Pago',
    description: 'El usuario quiere registrar un pago realizado por un cliente',
    examples: [
      'Quiero registrar un pago de $5000 del cliente Juan Pérez',
      'El cliente con cédula 123456 pagó $10000 hoy',
      'Registro de pago para María López por $3000',
      'Anotar pago recibido en efectivo de $2500',
      'El cliente de la ruta 3 pagó su cuota',
      'Necesito registrar el abono que hizo Pedro'
    ],
    priority: 40,
    category: 'credit',
    keywordDetectionEnabled: true,
    detectionPatterns: [
      'pago', 'pagó', 'abonó', 'canceló', 'cuota', 'registrar pago', 'abonar'
    ],
    metadata: {
      requiresAuth: true,
      requiredEntities: ['cliente', 'monto']
    }
  },
  {
    name: 'crear_credito',
    displayName: 'Crear Crédito',
    description: 'El usuario quiere crear un nuevo crédito para un cliente',
    examples: [
      'Necesito crear un crédito de $50000 para Juan Pérez',
      'Nuevo préstamo para el cliente con cédula 123456',
      'Quiero hacer un crédito para María López por $30000',
      'Crear financiación para el cliente de la ruta 2',
      'Necesito registrar un nuevo crédito',
      'Aprobar préstamo para cliente Pedro por $100000'
    ],
    priority: 30,
    category: 'credit',
    keywordDetectionEnabled: true,
    detectionPatterns: [
      'crédito', 'préstamo', 'financiar', 'financiación', 'nuevo crédito', 'aprobar crédito'
    ],
    metadata: {
      requiresAuth: true,
      requiredEntities: ['cliente', 'monto']
    }
  },
  {
    name: 'ver_clientes_pendientes',
    displayName: 'Ver Clientes Pendientes',
    description: 'El usuario quiere ver una lista de clientes con pagos pendientes',
    examples: [
      'Muéstrame los clientes con pagos pendientes',
      'Lista de morosos',
      'Clientes que deben pagar hoy',
      'Ver clientes con cuotas vencidas',
      'Reporte de clientes en mora',
      'Lista de clientes que no han pagado este mes'
    ],
    priority: 60,
    category: 'credit',
    keywordDetectionEnabled: true,
    detectionPatterns: [
      'pendientes', 'morosos', 'vencidas', 'lista', 'no han pagado', 'clientes en mora'
    ],
    metadata: {
      requiresAuth: true,
      generateReport: true
    }
  },
  {
    name: 'consultar_reporte_diario',
    displayName: 'Consultar Reporte Diario',
    description: 'El usuario quiere obtener el reporte diario de pagos y créditos',
    examples: [
      'Necesito el reporte de hoy',
      'Muéstrame el resumen del día',
      'Reporte diario de pagos',
      'Cuánto se recaudó hoy',
      'Resumen de operaciones del día',
      'Balance diario'
    ],
    priority: 55,
    category: 'credit',
    keywordDetectionEnabled: true,
    detectionPatterns: [
      'reporte', 'resumen', 'balance', 'recaudado', 'operaciones del día', 'reporte diario'
    ],
    metadata: {
      requiresAuth: true,
      generateReport: true
    }
  },
  {
    name: 'buscar_cliente_por_ubicacion',
    displayName: 'Buscar Cliente por Ubicación',
    description: 'El usuario quiere buscar clientes por ruta o ubicación geográfica',
    examples: [
      'Muéstrame los clientes de la ruta 5',
      'Clientes en la zona norte',
      'Lista de clientes por cobrador Juan',
      'Ver clientes del barrio Centro',
      'Clientes asignados a la unidad 3',
      'Quiero ver los clientes de la ciudad de Medellín'
    ],
    priority: 65,
    category: 'credit',
    keywordDetectionEnabled: true,
    detectionPatterns: [
      'ruta', 'zona', 'barrio', 'ciudad', 'ubicación', 'cobrador', 'unidad'
    ],
    metadata: {
      requiresAuth: true,
      useGeolocation: true
    }
  }
];

// Nuevas entidades relacionadas con créditos y cobranza
const creditEntities = [
  {
    name: 'cliente',
    displayName: 'Cliente',
    description: 'Nombre o identificación de un cliente',
    type: 'text',
    examples: [
      { text: 'Juan Pérez', value: 'Juan Pérez' },
      { text: 'la clienta María López', value: 'María López' },
      { text: 'el cliente con cédula 123456789', value: '123456789' },
      { text: 'Pedro Rodríguez de la ruta 5', value: 'Pedro Rodríguez' }
    ],
    patterns: [
      '[A-Za-zÀ-ÖØ-öø-ÿ]+ [A-Za-zÀ-ÖØ-öø-ÿ]+',
      'cédula [0-9]{6,12}',
      'cliente [A-Za-zÀ-ÖØ-öø-ÿ]+'
    ],
    isActive: true
  },
  {
    name: 'monto',
    displayName: 'Monto',
    description: 'Valor monetario de un crédito o pago',
    type: 'number',
    examples: [
      { text: '$5000', value: '5000' },
      { text: '10000 pesos', value: '10000' },
      { text: 'pagó 3500', value: '3500' },
      { text: 'un crédito de 50000', value: '50000' }
    ],
    patterns: [
      '\\$[0-9]+(\\.[0-9]+)?',
      '[0-9]+ pesos',
      '[0-9]+(\\.[0-9]+)? (pesos|dolares|USD|COP)'
    ],
    isActive: true
  },
  {
    name: 'fecha',
    displayName: 'Fecha',
    description: 'Fecha de pago, vencimiento o creación',
    type: 'date',
    examples: [
      { text: 'para el 15 de julio', value: '15/07/2023' },
      { text: 'pagó ayer', value: 'yesterday' },
      { text: 'vence mañana', value: 'tomorrow' },
      { text: 'el 20 del mes pasado', value: '20/previous_month' }
    ],
    patterns: [
      '[0-9]{1,2} de [a-zA-Z]+',
      '[0-9]{1,2}/[0-9]{1,2}(/[0-9]{2,4})?',
      '(ayer|hoy|mañana|próxima semana)'
    ],
    isActive: true
  },
  {
    name: 'unidad',
    displayName: 'Unidad',
    description: 'Ruta o unidad de cobro',
    type: 'text',
    examples: [
      { text: 'ruta 5', value: 'ruta 5' },
      { text: 'unidad norte', value: 'unidad norte' },
      { text: 'zona centro', value: 'zona centro' },
      { text: 'cobrador Juan', value: 'cobrador Juan' }
    ],
    patterns: [
      'ruta [0-9]+',
      'unidad [a-zA-Z]+',
      'zona [a-zA-Z]+',
      'cobrador [a-zA-Z]+'
    ],
    isActive: true
  },
  {
    name: 'usuario',
    displayName: 'Usuario',
    description: 'Vendedor o cobrador del sistema',
    type: 'text',
    examples: [
      { text: 'vendedor Carlos', value: 'Carlos' },
      { text: 'cobrador Luis', value: 'Luis' },
      { text: 'el agente Ana', value: 'Ana' },
      { text: 'asesor Pedro', value: 'Pedro' }
    ],
    patterns: [
      '(vendedor|cobrador|agente|asesor) [A-Za-zÀ-ÖØ-öø-ÿ]+'
    ],
    isActive: true
  }
];

// Función asincrónica para agregar intenciones y entidades
async function addCreditItems() {
  try {
    // Agregar intenciones
    logger.info('Agregando intenciones de créditos y cobranza...');
    for (const intent of creditIntents) {
      const existingIntent = await Intent.findOne({ name: intent.name });
      
      if (existingIntent) {
        logger.info(`Intención "${intent.name}" ya existe, actualizando...`);
        await Intent.updateOne({ name: intent.name }, intent);
      } else {
        logger.info(`Creando nueva intención "${intent.name}"...`);
        await Intent.create(intent);
      }
    }
    
    // Agregar entidades
    logger.info('Agregando entidades de créditos y cobranza...');
    for (const entity of creditEntities) {
      const existingEntity = await Entity.findOne({ name: entity.name });
      
      if (existingEntity) {
        logger.info(`Entidad "${entity.name}" ya existe, actualizando...`);
        await Entity.updateOne({ name: entity.name }, entity);
      } else {
        logger.info(`Creando nueva entidad "${entity.name}"...`);
        await Entity.create(entity);
      }
    }
    
    logger.info('¡Proceso completado exitosamente!');
    
  } catch (error) {
    logger.error(`Error al agregar elementos: ${error.message}`);
  } finally {
    // Cerrar conexión a la base de datos
    await mongoose.connection.close();
    logger.info('Conexión a MongoDB cerrada');
  }
}

// Ejecutar la función principal
addCreditItems();