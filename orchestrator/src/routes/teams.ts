import { Router, Request, Response } from 'express';
import teamService from '../services/teamService';
import logger from '../utils/logger';

const router = Router();

const getUserId = (req: Request): string => req.headers['x-user-id'] as string;
const getUserRole = (req: Request): string => (req.headers['x-user-role'] as string) || 'user';
const isAdmin = (req: Request): boolean => getUserRole(req) === 'admin';

const unauthorized = (res: Response) =>
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });

/* ----------------------------- Teams ----------------------------- */

// Create team
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const { name, description, agentIds, strategy, maxRounds, selectorModel, terminatePhrase } = req.body;
    if (!name || !Array.isArray(agentIds) || agentIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TEAM', message: 'name and at least 2 agentIds are required' }
      });
    }

    const team = await teamService.createTeam({
      name, description, agentIds, strategy, maxRounds, selectorModel, terminatePhrase, createdBy: userId
    });

    res.status(201).json({ success: true, data: { team } });
  } catch (error: any) {
    logger.error('Team creation failed:', error);
    res.status(error.statusCode || 500).json({
      success: false, error: { code: 'TEAM_CREATION_FAILED', message: error.message }
    });
  }
});

// List teams (mine, or all for admin)
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const teams = isAdmin(req) && req.query.all === 'true'
      ? await teamService.listTeams()
      : await teamService.listTeams(userId);
    res.json({ success: true, data: { teams } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'TEAMS_FETCH_FAILED', message: error.message } });
  }
});

// Get team
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const team = await teamService.getTeam(req.params.id);
    if (!team) return res.status(404).json({ success: false, error: { code: 'TEAM_NOT_FOUND', message: 'Team not found' } });
    res.json({ success: true, data: { team } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'TEAM_FETCH_FAILED', message: error.message } });
  }
});

// Delete team
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const deleted = await teamService.deleteTeam(req.params.id, userId, isAdmin(req));
    if (!deleted) return res.status(404).json({ success: false, error: { code: 'TEAM_NOT_FOUND', message: 'Team not found' } });
    res.json({ success: true, data: { message: 'Team deleted' } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'TEAM_DELETE_FAILED', message: error.message } });
  }
});

/* --------------------------- Team runs --------------------------- */

// Run team (synchronous — streaming progress flows via WS events)
router.post('/:id/run', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);

    const { input, maxRounds, useMemory, useWebSearch, jsonOutput } = req.body;
    if (!input) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_INPUT', message: 'input is required' } });
    }

    const run = await teamService.runTeam({
      teamId: req.params.id,
      userId,
      input,
      maxRoundsOverride: maxRounds,
      useMemory: useMemory !== false,
      useWebSearch: Boolean(useWebSearch),
      jsonOutput: Boolean(jsonOutput)
    });
    res.json({ success: true, data: { run } });
  } catch (error: any) {
    logger.error('Team run failed:', error);
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'TEAM_RUN_FAILED', message: error.message } });
  }
});

// List runs (optionally for one team)
router.get('/:id/runs', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const runs = await teamService.listRuns(req.params.id, userId);
    res.json({ success: true, data: { runs } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'RUNS_FETCH_FAILED', message: error.message } });
  }
});

// All my runs across teams
router.get('/runs/all', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const runs = await teamService.listRuns(undefined, userId);
    res.json({ success: true, data: { runs } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'RUNS_FETCH_FAILED', message: error.message } });
  }
});

// Get one run
router.get('/runs/:runId', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const run = await teamService.getRun(req.params.runId, userId);
    if (!run) return res.status(404).json({ success: false, error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } });
    res.json({ success: true, data: { run } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'RUN_FETCH_FAILED', message: error.message } });
  }
});

// Stop a running team run (cooperative)
router.post('/runs/:runId/stop', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return unauthorized(res);
    const stopped = await teamService.stopRun(req.params.runId, userId);
    if (!stopped) {
      return res.status(400).json({ success: false, error: { code: 'STOP_FAILED', message: 'Run is not active' } });
    }
    res.json({ success: true, data: { message: 'Stop signal sent' } });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: { code: 'STOP_FAILED', message: error.message } });
  }
});

export default router;
