const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Esquema para el modelo de Conversación
 */
const ConversationSchema = new Schema({
    // Usuario asociado (puede ser temporal para usuarios no registrados)
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
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
    },
    
    // Metadatos adicionales para el mensaje
    metadata: {
        // Intenciones detectadas (opcional)
        intents: [{
            type: String
        }],
        
        // Entidades extraídas (opcional)
        entities: {
            type: Map,
            of: Schema.Types.Mixed
        },
        
        // Indica si es un usuario temporal
        isTemporaryUser: {
            type: Boolean,
            default: false
        },
        
        // Contexto del mensaje (opcional)
        context: {
            type: String,
            enum: ['greeting', 'trial_request', 'support', 'pricing', 'features', 'general', 'off_topic'],
            default: 'general'
        }
    }
}, {
    timestamps: true // Añade createdAt y updatedAt automáticamente
});

// Índices para mejorar el rendimiento de las consultas
ConversationSchema.index({ userId: 1, timestamp: 1 });
ConversationSchema.index({ phone: 1, timestamp: 1 });
ConversationSchema.index({ timestamp: -1 }); // Para consultas ordenadas por fecha
ConversationSchema.index({ 'metadata.isTemporaryUser': 1 }); // Para filtrar usuarios temporales

// Middleware para establecer isTemporaryUser automáticamente
ConversationSchema.pre('save', function(next) {
    // Si el userId es generado temporalmente, marcar como temporal
    if (this.isNew && this.userId) {
        // Verificar si el userId parece ser temporal (basado en hash de teléfono)
        const crypto = require('crypto');
        const phoneHash = crypto.createHash('md5').update(this.phone).digest('hex').substring(0, 24);
        
        if (this.userId.toString() === phoneHash) {
            this.metadata = this.metadata || {};
            this.metadata.isTemporaryUser = true;
        }
    }
    next();
});

// Método estático para limpiar conversaciones de usuarios temporales antiguos
ConversationSchema.statics.cleanupTemporaryUsers = async function(daysOld = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await this.deleteMany({
        'metadata.isTemporaryUser': true,
        timestamp: { $lt: cutoffDate }
    });
    
    return result.deletedCount;
};

// Método estático para obtener conversaciones por teléfono con paginación
ConversationSchema.statics.getByPhonePaginated = async function(phone, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    
    const conversations = await this.find({ phone })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    
    const total = await this.countDocuments({ phone });
    
    return {
        conversations,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
    };
};

// Método estático para obtener estadísticas por teléfono
ConversationSchema.statics.getPhoneStats = async function(phone) {
    const pipeline = [
        { $match: { phone } },
        {
            $group: {
                _id: null,
                totalMessages: { $sum: 1 },
                userMessages: { $sum: { $cond: ['$isFromUser', 1, 0] } },
                botMessages: { $sum: { $cond: ['$isFromUser', 0, 1] } },
                firstMessage: { $min: '$timestamp' },
                lastMessage: { $max: '$timestamp' }
            }
        }
    ];
    
    const result = await this.aggregate(pipeline);
    return result[0] || {
        totalMessages: 0,
        userMessages: 0,
        botMessages: 0,
        firstMessage: null,
        lastMessage: null
    };
};

module.exports = mongoose.model('Conversation', ConversationSchema);