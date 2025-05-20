const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Esquema para el modelo de Credenciales
 */
const CredentialSchema = new Schema({
    // Usuario asociado
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Información de credenciales
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    isEncrypted: {
        type: Boolean,
        default: true
    },
    
    // Información del servicio
    serviceId: {
        type: String,
        required: true
    },
    
    // Fechas importantes
    creationDate: {
        type: Date,
        default: Date.now
    },
    expirationDate: {
        type: Date,
        required: true
    },
    lastAccessDate: {
        type: Date,
        default: null
    },
    
    // Estado de las credenciales
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true // Añade createdAt y updatedAt automáticamente
});

// Índices para mejorar el rendimiento de las consultas
CredentialSchema.index({ userId: 1 });
CredentialSchema.index({ username: 1 });
CredentialSchema.index({ expirationDate: 1 });
CredentialSchema.index({ serviceId: 1 });

module.exports = mongoose.model('Credential', CredentialSchema);