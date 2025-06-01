const express = require('express');
const router = express.Router();
const intentController = require('../controllers/intentController');

// Rutas para intenciones
router.get('/', intentController.getAllIntents);
router.get('/nlp', intentController.getIntentsForNLP);
router.get('/:id', intentController.getIntentById);
router.post('/', intentController.createIntent);
router.post('/import', intentController.importIntents);
router.put('/:id', intentController.updateIntent);
router.patch('/:id/examples', intentController.addExamples);
router.delete('/:id', intentController.deleteIntent);

// Nuevas rutas para gestión de patrones y relaciones
router.patch('/:id/patterns', intentController.updateDetectionPatterns);
router.patch('/:id/keyword-detection', intentController.updateKeywordDetection);
router.patch('/:id/relations', intentController.updateIntentRelations);

module.exports = router;