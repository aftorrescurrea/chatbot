const mongoose = require('mongoose');

const intentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  examples: [{
    type: String,
    required: true
  }],
  priority: {
    type: Number,
    default: 100
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Índices para mejorar las búsquedas
// El índice en 'name' ya está definido con unique: true
intentSchema.index({ isActive: 1 });

// Método para obtener intenciones activas
intentSchema.statics.getActiveIntents = function() {
  return this.find({ isActive: true }).sort({ priority: 1 });
};

// Método para buscar por nombre
intentSchema.statics.findByName = function(name) {
  return this.findOne({ name: name.toLowerCase() });
};

module.exports = mongoose.model('Intent', intentSchema);