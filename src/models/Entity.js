const mongoose = require('mongoose');

const entitySchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['text', 'email', 'phone', 'date', 'number', 'url', 'custom'],
    default: 'text'
  },
  examples: [{
    text: {
      type: String,
      required: true
    },
    value: {
      type: String,
      required: true
    }
  }],
  patterns: [{
    type: String
  }],
  validators: {
    regex: {
      type: String,
      default: null
    },
    minLength: {
      type: Number,
      default: null
    },
    maxLength: {
      type: Number,
      default: null
    }
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
entitySchema.index({ isActive: 1 });
entitySchema.index({ type: 1 });

// Método para obtener entidades activas
entitySchema.statics.getActiveEntities = function() {
  return this.find({ isActive: true });
};

// Método para buscar por nombre
entitySchema.statics.findByName = function(name) {
  return this.findOne({ name: name.toLowerCase() });
};

// Método para obtener entidades por tipo
entitySchema.statics.findByType = function(type) {
  return this.find({ type: type, isActive: true });
};

module.exports = mongoose.model('Entity', entitySchema);