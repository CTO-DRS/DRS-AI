const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');
const { validate } = require('../utils/validator');
const { metrics } = require('../utils/metrics');

/**
 * @swagger
 * tags:
 *   name: Persona
 *   description: Evolving Persona Engine API
 */

/**
 * @swagger
 * /api/v1/persona/evolve:
 *   post:
 *     summary: Evolve user persona based on interaction
 *     tags: [Persona]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - interaction
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User identifier
 *               interaction:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [message, command, action]
 *                   text:
 *                     type: string
 *                   intent:
 *                     type: string
 *                   topics:
 *                     type: array
 *                     items:
 *                       type: string
 *                   sentiment:
 *                     type: string
 *                     enum: [positive, negative, neutral]
 *     responses:
 *       200:
 *         description: Persona evolved successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/evolve', validate('personaEvolve'), asyncHandler(async (req, res) => {
  const { userId, interaction } = req.body;
  
  // Get persona engine from app locals
  const personaEngine = req.app.locals.personaEngine;
  
  if (!personaEngine) {
    throw new AppError('Persona engine not initialized', 503);
  }
  
  const result = await personaEngine.evolvePersona(userId, interaction);
  
  // Update metrics
  metrics.personaEvolutionsTotal.inc({ user_id: userId });
  
  res.json({
    status: 'success',
    data: {
      userId,
      persona: result,
      evolved: true,
    },
  });
}));

/**
 * @swagger
 * /api/v1/persona/{userId}:
 *   get:
 *     summary: Get user persona
 *     tags: [Persona]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User persona retrieved
 *       404:
 *         description: Persona not found
 */
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const personaEngine = req.app.locals.personaEngine;
  
  if (!personaEngine) {
    throw new AppError('Persona engine not initialized', 503);
  }
  
  const persona = await personaEngine.getPersona(userId);
  
  if (!persona) {
    throw new AppError('Persona not found', 404);
  }
  
  res.json({
    status: 'success',
    data: {
      userId,
      persona,
    },
  });
}));

/**
 * @swagger
 * /api/v1/persona/{userId}/adapt:
 *   post:
 *     summary: Adapt response based on user persona
 *     tags: [Persona]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - response
 *             properties:
 *               response:
 *                 type: string
 *     responses:
 *       200:
 *         description: Response adapted successfully
 */
router.post('/:userId/adapt', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { response } = req.body;
  
  const personaEngine = req.app.locals.personaEngine;
  
  if (!personaEngine) {
    throw new AppError('Persona engine not initialized', 503);
  }
  
  const adapted = await personaEngine.adaptResponse(userId, response);
  
  res.json({
    status: 'success',
    data: adapted,
  });
}));

/**
 * @swagger
 * /api/v1/persona/{userId}/few-shot:
 *   post:
 *     summary: Perform few-shot learning adaptation
 *     tags: [Persona]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - examples
 *             properties:
 *               examples:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     input:
 *                       type: string
 *                     output:
 *                       type: string
 *     responses:
 *       200:
 *         description: Few-shot adaptation completed
 */
router.post('/:userId/few-shot', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { examples } = req.body;
  
  const personaEngine = req.app.locals.personaEngine;
  
  if (!personaEngine) {
    throw new AppError('Persona engine not initialized', 503);
  }
  
  const result = await personaEngine.fewShotAdapt(userId, examples);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/persona/stats:
 *   get:
 *     summary: Get persona engine statistics
 *     tags: [Persona]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats/overview', asyncHandler(async (req, res) => {
  const personaEngine = req.app.locals.personaEngine;
  
  if (!personaEngine) {
    throw new AppError('Persona engine not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: {
      totalPersonas: personaEngine.userProfiles?.size || 0,
      archetypes: personaEngine.personaClusters?.archetypes || [],
    },
  });
}));

module.exports = router;
