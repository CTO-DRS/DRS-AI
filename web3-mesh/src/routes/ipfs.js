const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @swagger
 * tags:
 *   name: IPFS
 *   description: IPFS decentralized storage API
 */

/**
 * @swagger
 * /api/v1/ipfs/upload:
 *   post:
 *     summary: Upload file to IPFS
 *     tags: [IPFS]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               pin:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: File uploaded successfully
 */
router.post('/upload', asyncHandler(async (req, res) => {
  const ipfsService = req.app.locals.ipfsService;
  
  if (!ipfsService) {
    throw new AppError('IPFS service not initialized', 503);
  }
  
  // Handle file upload
  if (!req.body.data) {
    throw new AppError('No data provided', 400);
  }
  
  const buffer = Buffer.isBuffer(req.body.data) 
    ? req.body.data 
    : Buffer.from(req.body.data, 'base64');
  
  const result = await ipfsService.upload(buffer, {
    pin: req.body.pin !== false,
    metadata: req.body.metadata || {},
  });
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/ipfs/download/{cid}:
 *   get:
 *     summary: Download file from IPFS
 *     tags: [IPFS]
 *     parameters:
 *       - in: path
 *         name: cid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File downloaded
 */
router.get('/download/:cid', asyncHandler(async (req, res) => {
  const ipfsService = req.app.locals.ipfsService;
  
  if (!ipfsService) {
    throw new AppError('IPFS service not initialized', 503);
  }
  
  const { cid } = req.params;
  const data = await ipfsService.download(cid);
  
  res.set('Content-Type', 'application/octet-stream');
  res.send(data);
}));

/**
 * @swagger
 * /api/v1/ipfs/pin/{cid}:
 *   post:
 *     summary: Pin content to IPFS
 *     tags: [IPFS]
 *     parameters:
 *       - in: path
 *         name: cid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Content pinned
 */
router.post('/pin/:cid', asyncHandler(async (req, res) => {
  const ipfsService = req.app.locals.ipfsService;
  
  if (!ipfsService) {
    throw new AppError('IPFS service not initialized', 503);
  }
  
  const result = await ipfsService.pin(req.params.cid);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/ipfs/pins:
 *   get:
 *     summary: List pinned content
 *     tags: [IPFS]
 *     responses:
 *       200:
 *         description: List of pinned content
 */
router.get('/pins', asyncHandler(async (req, res) => {
  const ipfsService = req.app.locals.ipfsService;
  
  if (!ipfsService) {
    throw new AppError('IPFS service not initialized', 503);
  }
  
  const pins = await ipfsService.listPins();
  
  res.json({
    status: 'success',
    data: pins,
  });
}));

/**
 * @swagger
 * /api/v1/ipfs/stats:
 *   get:
 *     summary: Get IPFS statistics
 *     tags: [IPFS]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const ipfsService = req.app.locals.ipfsService;
  
  if (!ipfsService) {
    throw new AppError('IPFS service not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: ipfsService.getStats(),
  });
}));

module.exports = router;
