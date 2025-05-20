/**
 * Script para gestionar la base de datos en MongoDB Atlas
 * 
 * Este script permite realizar operaciones comunes como:
 * - Listar usuarios
 * - Buscar usuarios por teléfono o email
 * - Eliminar usuarios
 * - Limpiar colecciones
 * - Verificar el estado de la base de datos
 * 
 * Uso: node scripts/manage-db.js [comando] [opciones]
 * 
 * Comandos disponibles:
 * - list-users: Lista todos los usuarios
 * - find-user [phone|email]: Busca un usuario por teléfono o email
 * - delete-user [phone|email]: Elimina un usuario por teléfono o email
 * - clear-collection [nombre]: Limpia una colección específica
 * - status: Muestra el estado de la base de datos
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { logger } = require('../src/utils/logger');

// Modelos
const User = require('../src/models/User');

// Función principal
async function manageDatabase() {
    try {
        // Obtener argumentos de la línea de comandos
        const args = process.argv.slice(2);
        const command = args[0];
        const param = args[1];
        
        if (!command) {
            showHelp();
            process.exit(0);
        }
        
        // Conectar a MongoDB
        logger.info('Conectando a MongoDB Atlas...');
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info(`MongoDB conectado: ${mongoose.connection.host}`);
        
        // Ejecutar el comando correspondiente
        switch (command) {
            case 'list-users':
                await listUsers();
                break;
                
            case 'find-user':
                if (!param) {
                    logger.error('Debe proporcionar un teléfono o email para buscar');
                    process.exit(1);
                }
                await findUser(param);
                break;
                
            case 'delete-user':
                if (!param) {
                    logger.error('Debe proporcionar un teléfono o email para eliminar');
                    process.exit(1);
                }
                await deleteUser(param);
                break;
                
            case 'clear-collection':
                if (!param) {
                    logger.error('Debe proporcionar el nombre de la colección a limpiar');
                    process.exit(1);
                }
                await clearCollection(param);
                break;
                
            case 'status':
                await showStatus();
                break;
                
            case 'help':
                showHelp();
                break;
                
            default:
                logger.error(`Comando desconocido: ${command}`);
                showHelp();
                process.exit(1);
        }
        
    } catch (error) {
        logger.error(`Error al gestionar la base de datos: ${error.message}`);
        process.exit(1);
    } finally {
        // Cerrar conexión
        await mongoose.connection.close();
        logger.info('Conexión a MongoDB cerrada');
    }
}

// Función para listar todos los usuarios
async function listUsers() {
    try {
        const users = await User.find({}).select('name email phone registrationDate lastActivity');
        
        if (users.length === 0) {
            logger.info('No hay usuarios registrados');
            return;
        }
        
        logger.info(`Total de usuarios: ${users.length}`);
        
        // Mostrar usuarios en formato tabular
        console.log('\n=== USUARIOS REGISTRADOS ===');
        console.log('NOMBRE\t\tEMAIL\t\t\tTELÉFONO\t\tREGISTRO');
        console.log('-----------------------------------------------------------------------------------');
        
        users.forEach(user => {
            const regDate = user.registrationDate ? user.registrationDate.toISOString().split('T')[0] : 'N/A';
            console.log(`${user.name.padEnd(15)}\t${user.email.padEnd(20)}\t${user.phone.padEnd(15)}\t${regDate}`);
        });
        
        console.log('-----------------------------------------------------------------------------------');
    } catch (error) {
        logger.error(`Error al listar usuarios: ${error.message}`);
    }
}

// Función para buscar un usuario por teléfono o email
async function findUser(identifier) {
    try {
        // Determinar si es un email o un teléfono
        const isEmail = identifier.includes('@');
        
        // Buscar usuario
        const query = isEmail ? { email: identifier } : { phone: identifier };
        const user = await User.findOne(query);
        
        if (!user) {
            logger.info(`No se encontró ningún usuario con ${isEmail ? 'email' : 'teléfono'}: ${identifier}`);
            return;
        }
        
        // Mostrar información del usuario
        console.log('\n=== INFORMACIÓN DEL USUARIO ===');
        console.log(`ID: ${user._id}`);
        console.log(`Nombre: ${user.name}`);
        console.log(`Email: ${user.email}`);
        console.log(`Teléfono: ${user.phone}`);
        console.log(`Empresa: ${user.company || 'N/A'}`);
        console.log(`Cargo: ${user.position || 'N/A'}`);
        console.log(`Fecha de registro: ${user.registrationDate ? user.registrationDate.toISOString() : 'N/A'}`);
        console.log(`Última actividad: ${user.lastActivity ? user.lastActivity.toISOString() : 'N/A'}`);
        
        // Mostrar información de acceso si existe
        if (user.access && user.access.serviceId) {
            console.log('\n--- Información de Acceso ---');
            console.log(`Servicio: ${user.access.serviceId}`);
            console.log(`Usuario: ${user.access.credentials?.username || 'N/A'}`);
            console.log(`Expiración: ${user.access.expirationDate ? user.access.expirationDate.toISOString() : 'N/A'}`);
            console.log(`Último acceso: ${user.access.lastAccessDate ? user.access.lastAccessDate.toISOString() : 'N/A'}`);
        }
        
    } catch (error) {
        logger.error(`Error al buscar usuario: ${error.message}`);
    }
}

// Función para eliminar un usuario por teléfono o email
async function deleteUser(identifier) {
    try {
        // Determinar si es un email o un teléfono
        const isEmail = identifier.includes('@');
        
        // Buscar y eliminar usuario
        const query = isEmail ? { email: identifier } : { phone: identifier };
        const result = await User.deleteOne(query);
        
        if (result.deletedCount === 0) {
            logger.info(`No se encontró ningún usuario con ${isEmail ? 'email' : 'teléfono'}: ${identifier}`);
            return;
        }
        
        logger.info(`Usuario con ${isEmail ? 'email' : 'teléfono'} ${identifier} eliminado correctamente`);
    } catch (error) {
        logger.error(`Error al eliminar usuario: ${error.message}`);
    }
}

// Función para limpiar una colección
async function clearCollection(collectionName) {
    try {
        // Verificar que la colección existe
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        const collectionExists = collections.some(col => col.name === collectionName);
        
        if (!collectionExists) {
            logger.error(`La colección ${collectionName} no existe`);
            return;
        }
        
        // Pedir confirmación
        console.log(`¿Está seguro de que desea eliminar todos los documentos de la colección ${collectionName}? (s/n)`);
        process.stdin.once('data', async (data) => {
            const answer = data.toString().trim().toLowerCase();
            
            if (answer === 's' || answer === 'si' || answer === 'y' || answer === 'yes') {
                // Limpiar colección
                const result = await db.collection(collectionName).deleteMany({});
                logger.info(`Colección ${collectionName} limpiada. Documentos eliminados: ${result.deletedCount}`);
            } else {
                logger.info('Operación cancelada');
            }
            
            process.exit(0);
        });
        
        // Mantener el proceso en ejecución para esperar la respuesta
        return new Promise(resolve => {
            // Esta promesa no se resolverá, ya que el proceso terminará con process.exit()
        });
    } catch (error) {
        logger.error(`Error al limpiar colección: ${error.message}`);
    }
}

// Función para mostrar el estado de la base de datos
async function showStatus() {
    try {
        const db = mongoose.connection.db;
        
        // Obtener colecciones
        const collections = await db.listCollections().toArray();
        
        // Obtener estadísticas de cada colección
        console.log('\n=== ESTADO DE LA BASE DE DATOS ===');
        console.log(`Base de datos: ${db.databaseName}`);
        console.log(`Servidor: ${mongoose.connection.host}`);
        console.log('\n--- Colecciones ---');
        
        for (const collection of collections) {
            const count = await db.collection(collection.name).countDocuments();
            console.log(`${collection.name}: ${count} documentos`);
        }
        
        // Mostrar estadísticas de usuarios
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ 'access.expirationDate': { $gt: new Date() } });
        
        console.log('\n--- Estadísticas de Usuarios ---');
        console.log(`Total de usuarios: ${totalUsers}`);
        console.log(`Usuarios con acceso activo: ${activeUsers}`);
        
    } catch (error) {
        logger.error(`Error al mostrar estado: ${error.message}`);
    }
}

// Función para mostrar la ayuda
function showHelp() {
    console.log(`
=== GESTOR DE BASE DE DATOS ===

Uso: node scripts/manage-db.js [comando] [opciones]

Comandos disponibles:
- list-users                  : Lista todos los usuarios
- find-user [phone|email]     : Busca un usuario por teléfono o email
- delete-user [phone|email]   : Elimina un usuario por teléfono o email
- clear-collection [nombre]   : Limpia una colección específica
- status                      : Muestra el estado de la base de datos
- help                        : Muestra esta ayuda
    `);
}

// Ejecutar la función principal
manageDatabase().catch(error => {
    console.error(`Error no controlado: ${error.message}`);
    process.exit(1);
});