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
  // Nuevos campos para el sistema mejorado
  category: {
    type: String,
    enum: ['general', 'tutorial', 'support', 'sales', 'complaint', 'greeting', 'credit', 'financial', 'payment'],
    default: 'general'
  },
  hasSpecificFlow: {
    type: Boolean,
    default: false
  },
  flowType: {
    type: String,
    default: null
  },
  subIntents: [{
    name: String,
    keywords: [String],
    examples: [String],
    description: String
  }],
  responseStrategy: {
    type: String,
    enum: ['static', 'dynamic', 'flow', 'contextual'],
    default: 'contextual'
  },
  flowSteps: [{
    stepNumber: Number,
    message: String,
    requiresInput: Boolean,
    validationRules: mongoose.Schema.Types.Mixed
  }],
  // Nuevos campos para detección basada en reglas
  detectionPatterns: {
    type: [String],
    default: []
  },
  relatedIntents: [{
    intent: {
      type: String,
      ref: 'Intent'
    },
    condition: {
      type: String,
      enum: ['always', 'contains'],
      default: 'always'
    },
    keywords: [String]
  }],
  keywordDetectionEnabled: {
    type: Boolean,
    default: false
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
intentSchema.index({ isActive: 1 });
intentSchema.index({ category: 1 });
intentSchema.index({ hasSpecificFlow: 1 });

// Método para obtener intenciones activas
intentSchema.statics.getActiveIntents = function() {
  return this.find({ isActive: true }).sort({ priority: 1 });
};

// Método para buscar por nombre
intentSchema.statics.findByName = function(name) {
  return this.findOne({ name: name.toLowerCase() });
};

// Método para obtener intenciones con flujos específicos
intentSchema.statics.getIntentsWithFlows = function() {
  return this.find({ hasSpecificFlow: true, isActive: true });
};

// Método para obtener intenciones por categoría
intentSchema.statics.getByCategory = function(category) {
  return this.find({ category: category, isActive: true }).sort({ priority: 1 });
};

module.exports = mongoose.model('Intent', intentSchema);