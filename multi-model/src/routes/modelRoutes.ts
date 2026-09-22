import { Router } from 'express';
import {
  listModels,
  getModel,
  generate,
  generateEnsemble,
  autoSelect,
  routeRequest,
  getPerformance,
  addModel,
  updateModel,
  removeModel
} from '../controllers/modelController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', listModels);
router.get('/:id', getModel);

// Protected routes
router.use(authenticateToken);

router.post('/generate', generate);
router.post('/ensemble', generateEnsemble);
router.post('/auto-select', autoSelect);
router.post('/route', routeRequest);
router.get('/:id/performance', getPerformance);

// Admin routes
router.post('/', requireRole(['admin']), addModel);
router.put('/:id', requireRole(['admin']), updateModel);
router.delete('/:id', requireRole(['admin']), removeModel);

export default router;
