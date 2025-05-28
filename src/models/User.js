const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Esquema para el modelo de Usuario
 */
const UserSchema = new Schema({
    // Información de contacto
    phone: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    
    // Información profesional
    company: {
        type: String,
        trim: true,
        default: null
    },
    position: {
        type: String,
        trim: true,
        default: null
    },
    
    // Fechas importantes
    registrationDate: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    
    // Información de acceso al servicio (referencia a credenciales)
    // Las credenciales ahora se almacenan en el modelo Credential
    
    // El historial de conversaciones ahora se almacena en la colección 'conversations'
    
    // Metadatos adicionales
    metadata: {
        type: Map,
        of: Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true // Añade createdAt y updatedAt automáticamente
});

// Los índices en 'phone' y 'email' ya están definidos con unique: true
// Ya no necesitamos el índice para conversationHistory

module.exports = mongoose.model('User', UserSchema);