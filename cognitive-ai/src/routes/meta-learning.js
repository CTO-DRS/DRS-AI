const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');
const { validate } = require('../utils/validator');

/**
 * @swagger
 * tags:
 *   name: Meta-Learning
 *   description: Meta-Learning Orchestrator API
 */

/**
 * @swagger
 * /api/v1/meta-learning/tasks:
 *   post:
 *     summary: Register a new task for meta-learning
 *     tags: [Meta-Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskId
 *               - name
 *               - type
 *               - examples
 *             properties:
 *               taskId:
 *                 type: string
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [classification, generation, extraction, domain-adaptation]
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
 *       201:
 *         description: Task registered successfully
 */
router.post('/tasks', validate('metaLearningRegister'), asyncHandler(async (req, res) => {
  const metaLearning = req.app.locals.metaLearning;
  
  if (!metaLearning) {
    throw new AppError('Meta-learning orchestrator not initialized', 503);
  }
  
  const result = await metaLearning.registerTask(req.body);
  
  res.status(201).json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/meta-learning/adapt:
 *   post:
 *     summary: Perform few-shot adaptation for a task
 *     tags: [Meta-Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskId
 *               - supportSet
 *             properties:
 *               taskId:
 *                 type: string
 *               supportSet:
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
 *         description: Adaptation completed
 */
router.post('/adapt', validate('fewShotAdapt'), asyncHandler(async (req, res) => {
  const metaLearning = req.app.locals.metaLearning;
  
  if (!metaLearning) {
    throw new AppError('Meta-learning orchestrator not initialized', 503);
  }
  
  const { taskId, supportSet } = req.body;
  
  const result = await metaLearning.fewShotAdapt(taskId, supportSet);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/meta-learning/domain-adapt:
 *   post:
 *     summary: Rapid domain adaptation
 *     tags: [Meta-Learning]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - domain
 *               - examples
 *             properties:
 *               domain:
 *                 type: string
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
 *         description: Domain adaptation completed
 */
router.post('/domain-adapt', asyncHandler(async (req, res) => {
  const metaLearning = req.app.locals.metaLearning;
  
  if (!metaLearning) {
    throw new AppError('Meta-learning orchestrator not initialized', 503);
  }
  
  const { domain, examples } = req.body;
  
  const result = await metaLearning.rapidDomainAdaptation(domain, examples);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/meta-learning/tasks/{taskId}/similar:
 *   get:
 *     summary: Find similar tasks
 *     tags: [Meta-Learning]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: k
 *         schema:
 *           type: integer
 *           default: 5
 *     responses:
 *       200:
 *         description: Similar tasks found
 */
router.get('/tasks/:taskId/similar', asyncHandler(async (req, res) => {
  const metaLearning = req.app.locals.metaLearning;
  
  if (!metaLearning) {
    throw new AppError('Meta-learning orchestrator not initialized', 503);
  }
  
  const { taskId } = req.params;
  const { k = 5 } = req.query;
  
  const result = await metaLearning.findSimilarTasks(taskId, parseInt(k));
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/meta-learning/stats:
 *   get:
 *     summary: Get meta-learning statistics
 *     tags: [Meta-Learning]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const metaLearning = req.app.locals.metaLearning;
  
  if (!metaLearning) {
    throw new AppError('Meta-learning orchestrator not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: metaLearning.getStats(),
  });
}));

module.exports = router;
