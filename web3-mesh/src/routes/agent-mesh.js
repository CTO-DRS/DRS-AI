const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @swagger
 * tags:
 *   name: Agent Mesh
 *   description: Distributed AI agent mesh network API
 */

/**
 * @swagger
 * /api/v1/agent-mesh/agents:
 *   post:
 *     summary: Register a local agent
 *     tags: [Agent Mesh]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - endpoint
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               endpoint:
 *                 type: string
 *               capabilities:
 *                 type: array
 *                 items:
 *                   type: string
 *               maxLoad:
 *                 type: number
 *                 default: 10
 *     responses:
 *       201:
 *         description: Agent registered
 */
router.post('/agents', asyncHandler(async (req, res) => {
  const agentMesh = req.app.locals.agentMesh;
  
  if (!agentMesh) {
    throw new AppError('Agent mesh not initialized', 503);
  }
  
  const result = await agentMesh.registerAgent(req.body);
  
  res.status(201).json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/agent-mesh/agents:
 *   get:
 *     summary: Get all agents
 *     tags: [Agent Mesh]
 *     responses:
 *       200:
 *         description: Agents list retrieved
 */
router.get('/agents', asyncHandler(async (req, res) => {
  const agentMesh = req.app.locals.agentMesh;
  
  if (!agentMesh) {
    throw new AppError('Agent mesh not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: {
      local: Array.from(agentMesh.localAgents.values()),
      remote: Array.from(agentMesh.remoteAgents.values()),
    },
  });
}));

/**
 * @swagger
 * /api/v1/agent-mesh/tasks:
 *   post:
 *     summary: Submit a task
 *     tags: [Agent Mesh]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - description
 *             properties:
 *               type:
 *                 type: string
 *               description:
 *                 type: string
 *               input:
 *                 type: object
 *               requirements:
 *                 type: object
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high]
 *               timeout:
 *                 type: number
 *     responses:
 *       201:
 *         description: Task submitted
 */
router.post('/tasks', asyncHandler(async (req, res) => {
  const agentMesh = req.app.locals.agentMesh;
  
  if (!agentMesh) {
    throw new AppError('Agent mesh not initialized', 503);
  }
  
  const result = await agentMesh.submitTask(req.body);
  
  res.status(201).json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/agent-mesh/federated:
 *   post:
 *     summary: Initiate federated learning round
 *     tags: [Agent Mesh]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelId
 *             properties:
 *               modelId:
 *                 type: string
 *               globalModel:
 *                 type: object
 *               minParticipants:
 *                 type: number
 *                 default: 3
 *     responses:
 *       201:
 *         description: Federated round initiated
 */
router.post('/federated', asyncHandler(async (req, res) => {
  const agentMesh = req.app.locals.agentMesh;
  
  if (!agentMesh) {
    throw new AppError('Agent mesh not initialized', 503);
  }
  
  const result = await agentMesh.initiateFederatedRound(req.body);
  
  res.status(201).json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/agent-mesh/stats:
 *   get:
 *     summary: Get mesh statistics
 *     tags: [Agent Mesh]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const agentMesh = req.app.locals.agentMesh;
  
  if (!agentMesh) {
    throw new AppError('Agent mesh not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: agentMesh.getStats(),
  });
}));

module.exports = router;
