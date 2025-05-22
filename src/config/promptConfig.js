/**
 * Configuración centralizada para el sistema de prompts
 * Contiene las configuraciones para intenciones, entidades y plantillas de respuesta
 */

// Configuración general del sistema de prompts
const generalConfig = {
  // Modelo de Ollama a utilizar
  model: process.env.OLLAMA_MODEL || 'llama3',
  
  // Temperatura para la generación (0.0-1.0)
  temperature: 0.2,
  
  // Tiempo máximo de respuesta en segundos
  maxResponseTime: 10,
  
  // Tokens máximos para la respuesta
  maxTokens: 500,
  
  // Metadatos del servicio actual (pueden modificarse según el despliegue)
  serviceMetadata: {
    name: 'ERP Demo',
    type: 'ERP', // ERP, CRM, BI
    trialDuration: 7, // en días
    adminContact: 'soporte@erp-demo.ejemplo.com',
    websiteUrl: 'https://erp-demo.ejemplo.com',
    features: [
      'Gestión de inventario',
      'Facturación electrónica',
      'Contabilidad integrada',
      'Recursos humanos',
      'Informes en tiempo real'
    ]
  }
};

// Configuración de las intenciones soportadas
const intentConfig = {
  // Lista de intenciones soportadas por el sistema
  supportedIntents: [
    'saludo',
    'despedida',
    'interes_en_servicio',
    'solicitud_prueba',
    'confirmacion',
    'agradecimiento',
    'soporte_tecnico',
    'consulta_precio',
    'consulta_caracteristicas',
    'queja',
    'cancelacion'
  ],
  
  // Ejemplos de mensajes para cada intención
  // Estos ejemplos se utilizan para entrenar el modelo en el reconocimiento de intenciones
  intentExamples: {
    'saludo': [
      'Hola',
      'Buenos días',
      'Buenas tardes',
      'Qué tal',
      'Saludos',
      'Hola, ¿cómo estás?',
      'Hola buenos días',
      'Buenas noches',
      'Hola, soy Juan',
      'Hola, me gustaría información'
    ],
    'despedida': [
      'Adiós',
      'Hasta luego',
      'Nos vemos',
      'Hasta pronto',
      'Chao',
      'Gracias, hasta luego',
      'Hasta mañana',
      'Me voy, gracias',
      'Eso es todo, adiós',
      'Terminamos por hoy'
    ],
    'interes_en_servicio': [
      'Me interesa el servicio',
      'Quiero más información',
      'Quisiera saber más sobre el ERP',
      'Me gustaría conocer sus servicios',
      'Necesito un ERP para mi empresa',
      'Estoy buscando un sistema de gestión',
      'Dígame más acerca del sistema',
      'Su software me parece interesante',
      'Estamos evaluando diferentes ERPs',
      'Nos interesa implementar su solución'
    ],
    'solicitud_prueba': [
      'Quiero probar el sistema',
      'Me gustaría hacer una prueba',
      'Cómo puedo obtener acceso de prueba',
      'Solicito una demo',
      'Quiero una cuenta de prueba',
      'Necesito evaluar el sistema antes de comprar',
      'Demo gratuita por favor',
      'Periodo de prueba',
      'Me interesa probar 7 días',
      'usuario_prueba 12345'
    ],
    'confirmacion': [
      'Sí',
      'Claro',
      'Por supuesto',
      'Correcto',
      'Está bien',
      'De acuerdo',
      'Me parece bien',
      'Adelante',
      'Confirmo',
      'Confirmo los datos'
    ],
    'agradecimiento': [
      'Gracias',
      'Muchas gracias',
      'Te lo agradezco',
      'Mil gracias',
      'Agradecido',
      'Muy amable',
      'Gracias por tu ayuda',
      'Se agradece',
      'Gracias por la información',
      'Excelente servicio, gracias'
    ],
    'soporte_tecnico': [
      'Tengo un problema',
      'No puedo acceder',
      'Mi contraseña no funciona',
      'El sistema está caído',
      'Necesito ayuda técnica',
      'Me aparece un error',
      'No puedo generar el reporte',
      'La aplicación se cierra',
      'Necesito recuperar mi cuenta',
      'Error en el módulo de inventario'
    ],
    'consulta_precio': [
      'Cuánto cuesta',
      'Precio del servicio',
      'Tienen un plan mensual',
      'Cuáles son sus tarifas',
      'Costo de implementación',
      'Precios para 10 usuarios',
      'Hay descuentos por volumen',
      'Plan anual costo',
      'Es muy caro?',
      'Tienen diferentes planes?'
    ],
    'consulta_caracteristicas': [
      'Qué características tiene',
      'Funcionalidades del sistema',
      'El ERP maneja inventarios?',
      'Tiene módulo de RRHH?',
      'Puedo tener múltiples usuarios?',
      'Trabaja en la nube?',
      'Es compatible con facturación electrónica?',
      'Tiene aplicación móvil?',
      'Se puede personalizar?',
      'Características principales'
    ],
    'queja': [
      'No estoy satisfecho',
      'El servicio es malo',
      'Muchos errores en el sistema',
      'No funciona como esperaba',
      'Estoy decepcionado',
      'Demasiado lento',
      'Interfaz complicada',
      'Su soporte es deficiente',
      'No resuelven mis problemas',
      'Llevo días esperando una solución'
    ],
    'cancelacion': [
      'Quiero cancelar',
      'Cancela mi suscripción',
      'Ya no necesito el servicio',
      'Deseo dar de baja',
      'Cómo cancelo mi cuenta',
      'No renovaré',
      'Procedimiento para cancelar',
      'Darme de baja',
      'Terminar contrato',
      'Quiero terminar mi periodo de prueba'
    ]
  },
  
  // Ejemplos de conversaciones completas para mejorar el contexto
  conversationExamples: [
    {
      user: "Hola, me interesa probar su sistema ERP",
      assistant: "Detectar intenciones: saludo, interes_en_servicio, solicitud_prueba",
    },
    {
      user: "Buenas tardes, tengo problemas para iniciar sesión con mi usuario admin123",
      assistant: "Detectar intenciones: saludo, soporte_tecnico",
    },
    {
      user: "Mi nombre es Carlos Gómez y quisiera una prueba del sistema",
      assistant: "Detectar intenciones: solicitud_prueba",
    },
    {
      user: "usuario_prueba Abc123!",
      assistant: "Detectar intenciones: solicitud_prueba",
    },
    {
      user: "Sí, mi nombre es Juan Pérez y mi email es juan@empresa.com",
      assistant: "Detectar intenciones: confirmacion",
    },
    {
      user: "Gracias por la información, lo pensaré",
      assistant: "Detectar intenciones: agradecimiento, despedida",
    }
  ]
};

// Configuración de entidades que el sistema debe extraer
const entityConfig = {
  // Lista de entidades que el sistema debe identificar
  supportedEntities: [
    'nombre',
    'email',
    'telefono',
    'empresa',
    'cargo',
    'usuario',
    'clave',
    'fecha',
    'numero_empleados',
    'industria'
  ],
  
  // Ejemplos para entrenar el modelo en la extracción de entidades
  entityExamples: {
    'nombre': [
      'Me llamo Juan Pérez',
      'Soy María González',
      'Mi nombre es Roberto Carlos Martínez',
      'Carlos López Hernández',
      'Soy la Dra. Ana María Rodríguez',
      'Puede llamarme Francisco',
      'Nombre: Laura Sánchez',
      'José Antonio'
    ],
    'email': [
      'Mi correo es juan@empresa.com',
      'Pueden contactarme en maria.gonzalez@gmail.com',
      'Email: soporte@miempresa.mx',
      'roberto_83@hotmail.com es mi email',
      'Mándame la info a director@compañia.es',
      'Correo: user.name@domain.tld',
      'contacto@empresa.com.mx',
      'Mi email corporativo: j.perez@empresa.org'
    ],
    'telefono': [
      'Mi número es 555-123-4567',
      'Pueden llamarme al +34 612 345 678',
      'Tel: (55) 1234 5678',
      'Mi celular: 5512345678',
      '612345678',
      'Teléfono: 55-5512-3456',
      'Contacto: +52 55 1234 5678',
      'Mi whatsapp: +1 555 123 4567'
    ],
    'empresa': [
      'Trabajo en Tecnologías Avanzadas SA',
      'Mi empresa es Corporativo Global',
      'Vengo de parte de Industrias XYZ',
      'Empresa: Desarrollos Innovadores',
      'Somos de Constructora del Norte',
      'Representando a Seguros Internacionales',
      'Mi compañía: Software Solutions',
      'De Transportes Rápidos S.A. de C.V.'
    ],
    'cargo': [
      'Soy Director de Tecnología',
      'Mi puesto es Gerente de Ventas',
      'Trabajo como Desarrollador Senior',
      'Cargo: Contador General',
      'Jefe de Operaciones',
      'Me desempeño como Coordinadora de Recursos Humanos',
      'Puesto: Analista de Sistemas',
      'Soy la CEO de la empresa'
    ],
    'usuario': [
      'Mi usuario será jperez2023',
      'Nombre de usuario: admin_maria',
      'Quiero el usuario tecnico_soporte',
      'roberto.martinez como nombre de usuario',
      'Usuario: gerente_ventas1',
      'Prefiero usar analista_sistemas como id',
      'jlopez123',
      'Mi id de acceso: director_general'
    ],
    'clave': [
      'Mi contraseña es Abc123!',
      'Clave: Usuario2023#',
      'Usaré P@ssw0rd como contraseña',
      'Contraseña: 123456Abc!',
      'Seguridad2023',
      'Mi pass: Admin#2023',
      'Abc123',
      'Clave de acceso: Prueba2023!'
    ],
    'fecha': [
      'Desde el 15 de mayo',
      'Para el 01/06/2023',
      'Ocurrió el 23/04/2023',
      'Fecha: 2023-05-15',
      '15/05/2023',
      'Mayo 15, 2023',
      'Programado para 15-05-2023',
      'El próximo 15 de mayo de 2023'
    ],
    'numero_empleados': [
      'Tenemos 50 empleados',
      'La empresa cuenta con 150 trabajadores',
      'Somos 25 personas',
      'Empleados: 500+',
      'Aproximadamente 75 colaboradores',
      'Un equipo de 30 profesionales',
      '200 empleados en total',
      'Plantilla de 100 personas'
    ],
    'industria': [
      'Sector tecnológico',
      'Trabajamos en manufactura',
      'Industria: Construcción',
      'Nos dedicamos a la hotelería',
      'Sector salud',
      'Industria alimentaria',
      'Educación superior',
      'Comercio minorista'
    ]
  },
  
  // Ejemplos de oraciones complejas con múltiples entidades
  complexExamples: [
    {
      text: "Soy Juan Pérez, director de tecnología en Empresas Innovadoras, mi correo es juan.perez@empresa.com y tenemos 150 empleados",
      entities: {
        nombre: "Juan Pérez",
        cargo: "director de tecnología",
        empresa: "Empresas Innovadoras",
        email: "juan.perez@empresa.com",
        numero_empleados: "150"
      }
    },
    {
      text: "Me llamo María González, mi teléfono es 555-123-4567 y mi usuario preferido sería maryg2023 con la clave Secure2023!",
      entities: {
        nombre: "María González",
        telefono: "555-123-4567",
        usuario: "maryg2023",
        clave: "Secure2023!"
      }
    },
    {
      text: "Roberto de Industrias XYZ, sector manufacturero, tenemos 75 empleados y quiero usuario admin_roberto con clave Xyz123!",
      entities: {
        nombre: "Roberto",
        empresa: "Industrias XYZ",
        industria: "manufacturero",
        numero_empleados: "75",
        usuario: "admin_roberto",
        clave: "Xyz123!"
      }
    }
  ]
};

// Configuración de respuestas para diferentes escenarios
const responseConfig = {
  // Plantillas de respuesta para tipos de intenciones específicas
  responseTemplates: {
    welcome: "¡Hola {{nombre}}! Soy el asistente virtual de {{service.name}}. Estoy aquí para ayudarte con información sobre nuestro sistema {{service.type}} y para crear cuentas de prueba. ¿En qué puedo ayudarte hoy?",
    
    trialConfirmation: "¡Felicidades {{nombre}}! 🎉 Tu cuenta de prueba ha sido creada exitosamente.\n\nAquí están tus datos de acceso:\n👤 Usuario: {{usuario}}\n🔐 Contraseña: {{clave}}\n\nPuedes comenzar a usar el servicio inmediatamente en:\n{{service.websiteUrl}}/login\n\nTu cuenta estará activa durante {{service.trialDuration}} días. Si tienes alguna duda, solo escríbeme y estaré encantado de ayudarte.\n\n¡Disfruta de tu experiencia!",
    
    missingInfo: "Para crear tu cuenta de prueba necesito algunos datos adicionales. Aún me falta tu {{missingFields}}. ¿Podrías proporcionarme esta información?",
    
    supportResponse: "Lamento que estés experimentando problemas. Para ayudarte mejor, por favor proporciona más detalles sobre el error que estás viendo. También puedes contactar directamente a nuestro equipo de soporte en {{service.adminContact}}.",
    
    featuresList: "{{service.name}} incluye las siguientes características principales:\n{{#each service.features}}\n- {{this}}\n{{/each}}\n\n¿Te gustaría saber más sobre alguna característica específica?",
    
    goodbye: "¡Gracias por contactarnos! Si tienes más preguntas en el futuro, no dudes en escribirnos nuevamente. ¡Que tengas un excelente día!"
  },
  
  // Mensajes para casos especiales
  specialMessages: {
    serviceDown: "Lamentamos informarte que nuestro servicio está experimentando problemas técnicos en este momento. Nuestro equipo está trabajando para resolverlo lo antes posible. Por favor, intenta nuevamente más tarde.",
    
    expiredTrial: "Tu periodo de prueba ha expirado. Si estás interesado en continuar utilizando nuestro servicio, por favor contacta a nuestro equipo de ventas al correo ventas@erp-demo.ejemplo.com para conocer nuestros planes y precios.",
    
    invalidCredentials: "Lo siento, pero las credenciales proporcionadas no son válidas. Por favor, verifica tu usuario y contraseña e intenta nuevamente."
  }
};

// Exportar configuraciones
module.exports = {
  generalConfig,
  intentConfig,
  entityConfig,
  responseConfig
};
