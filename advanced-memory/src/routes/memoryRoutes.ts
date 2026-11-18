import { Router } from 'express';
import {
  storeMemory,
  retrieveWithRAG,
  compressContext,
  generateSummary,
  getKnowledgeGraph,
  consolidateMemories,
  cleanupExpired
} from '../controllers/memoryController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Store a new memory
router.post('/store', storeMemory);

// Retrieve memories using RAG
router.post('/rag', retrieveWithRAG);

// Compress context
router.post('/compress', compressContext);

// Generate memory summary
router.post('/summary', generateSummary);

// Get knowledge graph
router.get('/knowledge-graph', getKnowledgeGraph);

// Consolidate memories
router.post('/consolidate', consolidateMemories);

// Cleanup expired memories (admin only)
router.post('/cleanup', cleanupExpired);

export default router;
