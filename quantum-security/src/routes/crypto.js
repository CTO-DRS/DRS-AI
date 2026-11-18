const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @swagger
 * tags:
 *   name: Crypto
 *   description: Post-quantum cryptography API
 */

// ============================================
// Kyber KEM Routes
// ============================================

/**
 * @swagger
 * /api/v1/crypto/kyber/keypair:
 *   post:
 *     summary: Generate Kyber key pair
 *     tags: [Crypto]
 *     responses:
 *       201:
 *         description: Key pair generated
 */
router.post('/kyber/keypair', asyncHandler(async (req, res) => {
  const kyberService = req.app.locals.kyberService;
  
  if (!kyberService) {
    throw new AppError('Kyber service not initialized', 503);
  }
  
  const result = await kyberService.generateKeyPair();
  
  res.status(201).json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/crypto/kyber/encapsulate:
 *   post:
 *     summary: Encapsulate shared secret
 *     tags: [Crypto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicKey
 *             properties:
 *               publicKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Encapsulation successful
 */
router.post('/kyber/encapsulate', asyncHandler(async (req, res) => {
  const kyberService = req.app.locals.kyberService;
  
  if (!kyberService) {
    throw new AppError('Kyber service not initialized', 503);
  }
  
  const { publicKey } = req.body;
  
  if (!publicKey) {
    throw new AppError('publicKey is required', 400);
  }
  
  const result = await kyberService.encapsulate(publicKey);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/crypto/kyber/decapsulate:
 *   post:
 *     summary: Decapsulate shared secret
 *     tags: [Crypto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - keyId
 *               - cipherText
 *             properties:
 *               keyId:
 *                 type: string
 *               cipherText:
 *                 type: string
 *     responses:
 *       200:
 *         description: Decapsulation successful
 */
router.post('/kyber/decapsulate', asyncHandler(async (req, res) => {
  const kyberService = req.app.locals.kyberService;
  
  if (!kyberService) {
    throw new AppError('Kyber service not initialized', 503);
  }
  
  const { keyId, cipherText } = req.body;
  
  if (!keyId || !cipherText) {
    throw new AppError('keyId and cipherText are required', 400);
  }
  
  const result = await kyberService.decapsulate(keyId, cipherText);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/crypto/kyber/encrypt:
 *   post:
 *     summary: Encrypt data using Kyber
 *     tags: [Crypto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicKey
 *               - data
 *             properties:
 *               publicKey:
 *                 type: string
 *               data:
 *                 type: string
 *     responses:
 *       200:
 *         description: Encryption successful
 */
router.post('/kyber/encrypt', asyncHandler(async (req, res) => {
  const kyberService = req.app.locals.kyberService;
  
  if (!kyberService) {
    throw new AppError('Kyber service not initialized', 503);
  }
  
  const { publicKey, data } = req.body;
  
  if (!publicKey || !data) {
    throw new AppError('publicKey and data are required', 400);
  }
  
  const result = await kyberService.encrypt(publicKey, Buffer.from(data, 'base64'));
  
  res.json({
    status: 'success',
    data: result,
  });
}));

// ============================================
// Dilithium Signature Routes
// ============================================

/**
 * @swagger
 * /api/v1/crypto/dilithium/keypair:
 *   post:
 *     summary: Generate Dilithium key pair
 *     tags: [Crypto]
 *     responses:
 *       201:
 *         description: Key pair generated
 */
router.post('/dilithium/keypair', asyncHandler(async (req, res) => {
  const dilithiumService = req.app.locals.dilithiumService;
  
  if (!dilithiumService) {
    throw new AppError('Dilithium service not initialized', 503);
  }
  
  const result = await dilithiumService.generateKeyPair();
  
  res.status(201).json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/crypto/dilithium/sign:
 *   post:
 *     summary: Sign a message
 *     tags: [Crypto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - keyId
 *               - message
 *             properties:
 *               keyId:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message signed
 */
router.post('/dilithium/sign', asyncHandler(async (req, res) => {
  const dilithiumService = req.app.locals.dilithiumService;
  
  if (!dilithiumService) {
    throw new AppError('Dilithium service not initialized', 503);
  }
  
  const { keyId, message } = req.body;
  
  if (!keyId || !message) {
    throw new AppError('keyId and message are required', 400);
  }
  
  const result = await dilithiumService.sign(keyId, message);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/crypto/dilithium/verify:
 *   post:
 *     summary: Verify a signature
 *     tags: [Crypto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - publicKey
 *               - message
 *               - signature
 *             properties:
 *               publicKey:
 *                 type: string
 *               message:
 *                 type: string
 *               signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification result
 */
router.post('/dilithium/verify', asyncHandler(async (req, res) => {
  const dilithiumService = req.app.locals.dilithiumService;
  
  if (!dilithiumService) {
    throw new AppError('Dilithium service not initialized', 503);
  }
  
  const { publicKey, message, signature } = req.body;
  
  if (!publicKey || !message || !signature) {
    throw new AppError('publicKey, message, and signature are required', 400);
  }
  
  const result = await dilithiumService.verify(publicKey, message, signature);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/crypto/dilithium/sign-json:
 *   post:
 *     summary: Sign JSON data
 *     tags: [Crypto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - keyId
 *               - data
 *             properties:
 *               keyId:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: JSON signed
 */
router.post('/dilithium/sign-json', asyncHandler(async (req, res) => {
  const dilithiumService = req.app.locals.dilithiumService;
  
  if (!dilithiumService) {
    throw new AppError('Dilithium service not initialized', 503);
  }
  
  const { keyId, data } = req.body;
  
  if (!keyId || !data) {
    throw new AppError('keyId and data are required', 400);
  }
  
  const result = await dilithiumService.signJSON(keyId, data);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/crypto/stats:
 *   get:
 *     summary: Get cryptography statistics
 *     tags: [Crypto]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const kyberService = req.app.locals.kyberService;
  const dilithiumService = req.app.locals.dilithiumService;
  
  res.json({
    status: 'success',
    data: {
      kyber: kyberService?.getStats() || null,
      dilithium: dilithiumService?.getStats() || null,
    },
  });
}));

module.exports = router;
