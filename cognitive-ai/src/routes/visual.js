const express = require('express');
const router = express.Router();
const multer = require('multer');
const { asyncHandler, AppError } = require('../utils/errorHandler');
const { validate } = require('../utils/validator');
const { metrics } = require('../utils/metrics');

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Invalid file type. Only images are allowed.', 400));
    }
  },
});

/**
 * @swagger
 * tags:
 *   name: Visual
 *   description: Visual Reasoning Engine API
 */

/**
 * @swagger
 * /api/v1/visual/analyze:
 *   post:
 *     summary: Analyze image with visual reasoning
 *     tags: [Visual]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *               - userId
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               prompt:
 *                 type: string
 *                 default: "Describe this image in detail"
 *               userId:
 *                 type: string
 *               stream:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Image analyzed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/analyze', upload.single('image'), asyncHandler(async (req, res) => {
  const visualEngine = req.app.locals.visualEngine;
  
  if (!visualEngine) {
    throw new AppError('Visual engine not initialized', 503);
  }
  
  const { prompt = 'Describe this image in detail', userId, stream = 'false' } = req.body;
  
  if (!req.file && !req.body.imageUrl) {
    throw new AppError('No image provided', 400);
  }
  
  if (!userId) {
    throw new AppError('userId is required', 400);
  }
  
  const image = req.file ? req.file.buffer : req.body.imageUrl;
  
  const startTime = Date.now();
  
  const result = await visualEngine.analyzeImage({
    image,
    prompt,
    userId,
    stream: stream === 'true',
  });
  
  // Update metrics
  metrics.visualAnalysisDuration.observe(
    { model: result.model, success: 'true' },
    (Date.now() - startTime) / 1000
  );
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/visual/qa:
 *   post:
 *     summary: Visual question answering
 *     tags: [Visual]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *               - question
 *               - userId
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               question:
 *                 type: string
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Question answered
 */
router.post('/qa', upload.single('image'), asyncHandler(async (req, res) => {
  const visualEngine = req.app.locals.visualEngine;
  
  if (!visualEngine) {
    throw new AppError('Visual engine not initialized', 503);
  }
  
  const { question, userId } = req.body;
  
  if (!req.file && !req.body.imageUrl) {
    throw new AppError('No image provided', 400);
  }
  
  if (!question) {
    throw new AppError('Question is required', 400);
  }
  
  const image = req.file ? req.file.buffer : req.body.imageUrl;
  
  const result = await visualEngine.visualQA({
    image,
    question,
    userId,
  });
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/visual/ocr:
 *   post:
 *     summary: Extract text from image (OCR)
 *     tags: [Visual]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               language:
 *                 type: string
 *                 default: "auto"
 *     responses:
 *       200:
 *         description: Text extracted successfully
 */
router.post('/ocr', upload.single('image'), asyncHandler(async (req, res) => {
  const visualEngine = req.app.locals.visualEngine;
  
  if (!visualEngine) {
    throw new AppError('Visual engine not initialized', 503);
  }
  
  const { language = 'auto' } = req.body;
  
  if (!req.file) {
    throw new AppError('No image provided', 400);
  }
  
  const result = await visualEngine.extractText({
    image: req.file.buffer,
    language,
  });
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/visual/detect:
 *   post:
 *     summary: Detect objects in image
 *     tags: [Visual]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               classes:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Objects detected
 */
router.post('/detect', upload.single('image'), asyncHandler(async (req, res) => {
  const visualEngine = req.app.locals.visualEngine;
  
  if (!visualEngine) {
    throw new AppError('Visual engine not initialized', 503);
  }
  
  const { classes } = req.body;
  
  if (!req.file) {
    throw new AppError('No image provided', 400);
  }
  
  const result = await visualEngine.detectObjects({
    image: req.file.buffer,
    classes: classes ? JSON.parse(classes) : [],
  });
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/visual/flowchart:
 *   post:
 *     summary: Generate flowchart from description
 *     tags: [Visual]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [mermaid, plantuml, dot]
 *                 default: mermaid
 *     responses:
 *       200:
 *         description: Flowchart generated
 */
router.post('/flowchart', asyncHandler(async (req, res) => {
  const visualEngine = req.app.locals.visualEngine;
  
  if (!visualEngine) {
    throw new AppError('Visual engine not initialized', 503);
  }
  
  const { description, type = 'mermaid' } = req.body;
  
  if (!description) {
    throw new AppError('Description is required', 400);
  }
  
  const result = await visualEngine.generateFlowchart({
    description,
    type,
  });
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/visual/batch:
 *   post:
 *     summary: Batch analyze multiple images
 *     tags: [Visual]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - images
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               prompt:
 *                 type: string
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Batch analysis completed
 */
router.post('/batch', upload.array('images', 10), asyncHandler(async (req, res) => {
  const visualEngine = req.app.locals.visualEngine;
  
  if (!visualEngine) {
    throw new AppError('Visual engine not initialized', 503);
  }
  
  const { prompt = 'Describe this image', userId } = req.body;
  
  if (!req.files || req.files.length === 0) {
    throw new AppError('No images provided', 400);
  }
  
  const images = req.files.map(file => ({
    image: file.buffer,
    prompt,
    userId,
  }));
  
  const result = await visualEngine.batchAnalyze(images);
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/visual/stats:
 *   get:
 *     summary: Get visual engine statistics
 *     tags: [Visual]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const visualEngine = req.app.locals.visualEngine;
  
  if (!visualEngine) {
    throw new AppError('Visual engine not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: visualEngine.getStats(),
  });
}));

module.exports = router;
