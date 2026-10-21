import { Router, Request, Response } from 'express';
import webSearchService from '../services/webSearchService';

const router = Router();

const getUserId = (req: Request): string => req.headers['x-user-id'] as string;

const unauthorized = (res: Response) =>
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });

/* -------------------------- Status --------------------------- */

// Which built-in tools are available for agent runs
router.get('/status', async (_req, res) => {
  res.json({
    success: true,
    data: {
      webSearch: webSearchService.isEnabled(),
      memory: true
    }
  });
});

/* ------------------------ Web search ------------------------- */

// Run a keyless web search (drSai web_search / deepsearch parity)
router.post('/web-search', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const { query, maxResults } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: { code: 'MISSING_QUERY', message: 'query is required' } });
    }
    if (!webSearchService.isEnabled()) {
      return res.status(403).json({ success: false, error: { code: 'WEB_SEARCH_DISABLED', message: 'Web search is disabled' } });
    }

    const results = await webSearchService.search(query, Number(maxResults) || 5);
    res.json({ success: true, data: { results, context: webSearchService.formatResultsBlock(query, results) } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false, error: { code: 'WEB_SEARCH_FAILED', message: error.message }
    });
  }
});

export default router;
