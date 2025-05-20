const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Esquema para el modelo de Conversación
 */
const ConversationSchema = new Schema({
    // Usuario asociado
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Número de teléfono del usuario (para búsquedas rápidas)
    phone: {
        type: String,
        required: true,
        index: true
    },
    
    // Mensaje
    message: {
        type: String,
        required: true
    },
    
    // Indica si el mensaje es del usuario o del bot
    isFromUser: {
        type: Boolean,
        default: true
    },
    
    // Fecha y hora del mensaje
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true // Añade createdAt y updatedAt automáticamente
});

// Índices para mejorar el rendimiento de las consultas
ConversationSchema.index({ userId: 1, timestamp: 1 });
ConversationSchema.index({ phone: 1, timestamp: 1 });

module.exports = mongoose.model('Conversation', ConversationSchema);