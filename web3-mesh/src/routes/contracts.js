const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @swagger
 * tags:
 *   name: Contracts
 *   description: Smart contract API for AI agent coordination
 */

/**
 * @swagger
 * /api/v1/contracts/agents:
 *   post:
 *     summary: Register an AI agent
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               metadataURI:
 *                 type: string
 *               capabilities:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Agent registered
 */
router.post('/agents', asyncHandler(async (req, res) => {
  const contractService = req.app.locals.contractService;
  
  if (!contractService) {
    throw new AppError('Contract service not initialized', 503);
  }
  
  const result = await contractService.registerAgent(req.body);
  
  res.status(201).json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/contracts/agents/{agentId}:
 *   get:
 *     summary: Get agent information
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent info retrieved
 */
router.get('/agents/:agentId', asyncHandler(async (req, res) => {
  const contractService = req.app.locals.contractService;
  
  if (!contractService) {
    throw new AppError('Contract service not initialized', 503);
  }
  
  const agent = await contractService.getAgent(req.params.agentId);
  
  res.json({
    status: 'success',
    data: agent,
  });
}));

/**
 * @swagger
 * /api/v1/contracts/agents/{agentId}/reputation:
 *   post:
 *     summary: Update agent reputation
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: agentId
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
 *               - delta
 *             properties:
 *               delta:
 *                 type: number
 *     responses:
 *       200:
 *         description: Reputation updated
 */
router.post('/agents/:agentId/reputation', asyncHandler(async (req, res) => {
  const contractService = req.app.locals.contractService;
  
  if (!contractService) {
    throw new AppError('Contract service not initialized', 503);
  }
  
  const { delta } = req.body;
  
  const result = await contractService.updateReputation(req.params.agentId, delta);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/contracts/tasks:
 *   post:
 *     summary: Create a task
 *     tags: [Contracts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *               - reward
 *             properties:
 *               description:
 *                 type: string
 *               reward:
 *                 type: number
 *               deadline:
 *                 type: number
 *     responses:
 *       201:
 *         description: Task created
 */
router.post('/tasks', asyncHandler(async (req, res) => {
  const contractService = req.app.locals.contractService;
  
  if (!contractService) {
    throw new AppError('Contract service not initialized', 503);
  }
  
  const result = await contractService.createTask(req.body);
  
  res.status(201).json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/contracts/stats:
 *   get:
 *     summary: Get contract statistics
 *     tags: [Contracts]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const contractService = req.app.locals.contractService;
  
  if (!contractService) {
    throw new AppError('Contract service not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: contractService.getStats(),
  });
}));

module.exports = router;
