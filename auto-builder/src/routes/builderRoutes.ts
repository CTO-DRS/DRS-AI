import { Router } from 'express';
import {
  createBuildRequest,
  getBuildStatus,
  getBuildResult,
  downloadBuild,
  parseRequirements
} from '../controllers/builderController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Create a new build request
router.post('/build', createBuildRequest);

// Get build status
router.get('/build/:id/status', getBuildStatus);

// Get build result
router.get('/build/:id/result', getBuildResult);

// Download build
router.get('/build/:id/download', downloadBuild);

// Parse requirements from description
router.post('/parse', parseRequirements);

export default router;
