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

module.exports = router;