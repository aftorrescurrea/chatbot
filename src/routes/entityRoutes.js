const express = require('express');
const router = express.Router();
const entityController = require('../controllers/entityController');

// Rutas para entidades
router.get('/', entityController.getAllEntities);
router.get('/types', entityController.getEntityTypes);
router.get('/nlp', entityController.getEntitiesForNLP);
router.get('/:id', entityController.getEntityById);
router.post('/', entityController.createEntity);
router.post('/import', entityController.importEntities);
router.put('/:id', entityController.updateEntity);
router.patch('/:id/examples', entityController.addExamples);
router.delete('/:id', entityController.deleteEntity);

module.exports = router;