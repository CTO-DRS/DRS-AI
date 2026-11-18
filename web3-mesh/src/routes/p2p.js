const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @swagger
 * tags:
 *   name: P2P
 *   description: libp2p peer-to-peer networking API
 */

/**
 * @swagger
 * /api/v1/p2p/node:
 *   get:
 *     summary: Get node information
 *     tags: [P2P]
 *     responses:
 *       200:
 *         description: Node info retrieved
 */
router.get('/node', asyncHandler(async (req, res) => {
  const libp2pService = req.app.locals.libp2pService;
  
  if (!libp2pService) {
    throw new AppError('libp2p service not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: libp2pService.getNodeInfo(),
  });
}));

/**
 * @swagger
 * /api/v1/p2p/peers:
 *   get:
 *     summary: Get connected peers
 *     tags: [P2P]
 *     responses:
 *       200:
 *         description: Peers list retrieved
 */
router.get('/peers', asyncHandler(async (req, res) => {
  const libp2pService = req.app.locals.libp2pService;
  
  if (!libp2pService) {
    throw new AppError('libp2p service not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: libp2pService.getConnectedPeers(),
  });
}));

/**
 * @swagger
 * /api/v1/p2p/dial:
 *   post:
 *     summary: Dial a peer
 *     tags: [P2P]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - multiaddr
 *             properties:
 *               multiaddr:
 *                 type: string
 *     responses:
 *       200:
 *         description: Peer connected
 */
router.post('/dial', asyncHandler(async (req, res) => {
  const libp2pService = req.app.locals.libp2pService;
  
  if (!libp2pService) {
    throw new AppError('libp2p service not initialized', 503);
  }
  
  const { multiaddr } = req.body;
  
  if (!multiaddr) {
    throw new AppError('multiaddr is required', 400);
  }
  
  const result = await libp2pService.dial(multiaddr);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/p2p/publish:
 *   post:
 *     summary: Publish message to topic
 *     tags: [P2P]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic
 *               - data
 *             properties:
 *               topic:
 *                 type: string
 *               data:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message published
 */
router.post('/publish', asyncHandler(async (req, res) => {
  const libp2pService = req.app.locals.libp2pService;
  
  if (!libp2pService) {
    throw new AppError('libp2p service not initialized', 503);
  }
  
  const { topic, data } = req.body;
  
  if (!topic || !data) {
    throw new AppError('topic and data are required', 400);
  }
  
  await libp2pService.publish(topic, data);
  
  res.json({
    status: 'success',
    message: 'Message published',
  });
}));

/**
 * @swagger
 * /api/v1/p2p/subscribe:
 *   post:
 *     summary: Subscribe to topic
 *     tags: [P2P]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - topic
 *             properties:
 *               topic:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscribed to topic
 */
router.post('/subscribe', asyncHandler(async (req, res) => {
  const libp2pService = req.app.locals.libp2pService;
  
  if (!libp2pService) {
    throw new AppError('libp2p service not initialized', 503);
  }
  
  const { topic } = req.body;
  
  if (!topic) {
    throw new AppError('topic is required', 400);
  }
  
  await libp2pService.subscribe(topic, (message) => {
    // Handler - messages will be emitted as events
    libp2pService.emit('topic:message', { topic, message });
  });
  
  res.json({
    status: 'success',
    message: `Subscribed to ${topic}`,
  });
}));

module.exports = router;
