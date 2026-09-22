const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @swagger
 * tags:
 *   name: Threats
 *   description: Threat detection and incident management API
 */

/**
 * @swagger
 * /api/v1/threats/incidents:
 *   get:
 *     summary: Get active incidents
 *     tags: [Threats]
 *     responses:
 *       200:
 *         description: Incidents retrieved
 */
router.get('/incidents', asyncHandler(async (req, res) => {
  const threatDetection = req.app.locals.threatDetection;
  
  if (!threatDetection) {
    throw new AppError('Threat detection not initialized', 503);
  }
  
  const incidents = threatDetection.getActiveIncidents();
  
  res.json({
    status: 'success',
    data: incidents,
  });
}));

/**
 * @swagger
 * /api/v1/threats/incidents/{incidentId}/resolve:
 *   post:
 *     summary: Resolve an incident
 *     tags: [Threats]
 *     parameters:
 *       - in: path
 *         name: incidentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *               actionTaken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Incident resolved
 */
router.post('/incidents/:incidentId/resolve', asyncHandler(async (req, res) => {
  const threatDetection = req.app.locals.threatDetection;
  
  if (!threatDetection) {
    throw new AppError('Threat detection not initialized', 503);
  }
  
  const result = await threatDetection.resolveIncident(
    req.params.incidentId,
    req.body
  );
  
  res.json({
    status: 'success',
    data: result,
  });
}));

/**
 * @swagger
 * /api/v1/threats/intelligence:
 *   get:
 *     summary: Get threat intelligence summary
 *     tags: [Threats]
 *     responses:
 *       200:
 *         description: Intelligence summary retrieved
 */
router.get('/intelligence', asyncHandler(async (req, res) => {
  const threatDetection = req.app.locals.threatDetection;
  
  if (!threatDetection) {
    throw new AppError('Threat detection not initialized', 503);
  }
  
  const summary = await threatDetection.getIntelligenceSummary();
  
  res.json({
    status: 'success',
    data: summary,
  });
}));

/**
 * @swagger
 * /api/v1/threats/report:
 *   post:
 *     summary: Report suspicious activity
 *     tags: [Threats]
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
 *               severity:
 *                 type: string
 *               source:
 *                 type: object
 *               details:
 *                 type: object
 *     responses:
 *       201:
 *         description: Activity reported
 */
router.post('/report', asyncHandler(async (req, res) => {
  const threatDetection = req.app.locals.threatDetection;
  
  if (!threatDetection) {
    throw new AppError('Threat detection not initialized', 503);
  }
  
  const incident = await threatDetection.reportSuspiciousActivity(req.body);
  
  res.status(201).json({
    status: 'success',
    data: incident,
  });
}));

/**
 * @swagger
 * /api/v1/threats/stats:
 *   get:
 *     summary: Get threat detection statistics
 *     tags: [Threats]
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const threatDetection = req.app.locals.threatDetection;
  
  if (!threatDetection) {
    throw new AppError('Threat detection not initialized', 503);
  }
  
  res.json({
    status: 'success',
    data: threatDetection.getStats(),
  });
}));

module.exports = router;
