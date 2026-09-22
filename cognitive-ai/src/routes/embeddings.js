const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');
const { validate } = require('../utils/validator');

/**
 * @swagger
 * tags:
 *   name: Embeddings
 *   description: User Embedding Service API
 */

/**
 * @swagger
 * /api/v1/embeddings/text:
 *   post:
 *     summary: Generate text embedding
 *     tags: [Embeddings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Embedding generated
 */
router.post('/text', asyncHandler(async (req, res) => {
  const embeddingService = req.app.locals.embeddingService;
  
  if (!embeddingService) {
    throw new AppError('Embedding service not initialized', 503);
  }
  
  const { text } = req.body;
  
  if (!text) {
    throw new AppError('Text is required', 400);
  }
  
  const embedding = await embeddingService.embedText(text);
  
  res.json({
    status: 'success',
    data: {
      embedding,
      dimension: embedding.length,
    },
  });
}));

/**
 * @swagger
 * /api/v1/embeddings/batch:
 *   post:
 *     summary: Batch generate text embeddings
 *     tags: [Embeddings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - texts
 *             properties:
 *               texts:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Embeddings generated
 */
router.post('/batch', asyncHandler(async (req, res) => {
  const embeddingService = req.app.locals.embeddingService;
  
  if (!embeddingService) {
    throw new AppError('Embedding service not initialized', 503);
  }
  
  const { texts } = req.body;
  
  if (!texts || !Array.isArray(texts)) {
    throw new AppError('Texts array is required', 400);
  }
  
  const embeddings = await embeddingService.batchEmbed(texts);
  
  res.json({
    status: 'success',
    data: {
      embeddings,
      count: embeddings.length,
      dimension: embeddings[0]?.length,
    },
  });
}));

/**
 * @swagger
 * /api/v1/embeddings/users/{userId}:
 *   get:
 *     summary: Get user embedding
 *     tags: [Embeddings]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User embedding retrieved
 */
router.get('/users/:userId', asyncHandler(async (req, res) => {
  const embeddingService = req.app.locals.embeddingService;
  
  if (!embeddingService) {
    throw new AppError('Embedding service not initialized', 503);
  }
  
  const { userId } = req.params;
  
  const embedding = await embeddingService.getUserEmbedding(userId);
  
  res.json({
    status: 'success',
    data: {
      userId,
      embedding,
      dimension: embedding.length,
    },
  });
}));

/**
 * @swagger
 * /api/v1/embeddings/users/{userId}/update:
 *   post:
 *     summary: Update user embedding based on interaction
 *     tags: [Embeddings]
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
 *               - interaction
 *             properties:
 *               interaction:
 *                 type: object
 *     responses:
 *       200:
 *         description: Embedding updated
 */
router.post('/users/:userId/update', asyncHandler(async (req, res) => {
  const embeddingService = req.app.locals.embeddingService;
  
  if (!embeddingService) {
    throw new AppError('Embedding service not initialized', 503);
  }
  
  const { userId } = req.params;
  const { interaction } = req.body;
  
  const embedding = await embeddingService.updateUserEmbedding(userId, interaction);
  
  res.json({
    status: 'success',
    data: {
      userId,
      embedding,
      updated: true,
    },
  });
}));

/**
 * @swagger
 * /api/v1/embeddings/users/{userId}/similar:
 *   get:
 *     summary: Find similar users
 *     tags: [Embeddings]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: k
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Similar users found
 */
router.get('/users/:userId/similar', asyncHandler(async (req, res) => {
  const embeddingService = req.app.locals.embeddingService;
  
  if (!embeddingService) {
    throw new AppError('Embedding service not initialized', 503);
  }
  
  const { userId } = req.params;
  const { k = 10 } = req.query;
  
  const similarUsers = await embeddingService.findSimilarUsers(userId, parseInt(k));
  
  res.json({
    status: 'success',
    data: {
      userId,
      similarUsers,
      count: similarUsers.length,
    },
  });
}));

/**
 * @swagger
 * /api/v1/embeddings/cluster:
 *   post:
 *     summary: Perform user clustering
 *     tags: [Embeddings]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               k:
 *                 type: integer
 *                 default: 8
 *     responses:
 *       200:
 *         description: Clustering completed
 */
router.post('/cluster', asyncHandler(async (req, res) => {
  const embeddingService = req.app.locals.embeddingService;
  
  if (!embeddingService) {
    throw new AppError('Embedding service not initialized', 503);
  }
  
  const { k = 8 } = req.body;
  
  const result = await embeddingService.clusterUsers(parseInt(k));
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/embeddings/clusters/{clusterId}/members:
 *   get:
 *     summary: Get cluster members
 *     tags: [Embeddings]
 *     parameters:
 *       - in: path
 *         name: clusterId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Cluster members retrieved
 */
router.get('/clusters/:clusterId/members', asyncHandler(async (req, res) => {
  const embeddingService = req.app.locals.embeddingService;
  
  if (!embeddingService) {
    throw new AppError('Embedding service not initialized', 503);
  }
  
  const { clusterId } = req.params;
  
  const members = embeddingService.getClusterMembers(parseInt(clusterId));
  
  res.json({
    status: 'success',
    data: {
      clusterId: parseInt(clusterId),
      members,
      count: members.length,
    },
  });
}));

/**
 * @swagger
 * /api/v1/embeddings/stats:
 *   get:
 *     summary: Get embedding service statistics
 *     tags: [Embeddings]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const embeddingService = req.app.locals.embeddingService;
  
  if (!embeddingService) {
    throw new AppError('Embedding service not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: embeddingService.getStats(),
  });
}));

module.exports = router;
