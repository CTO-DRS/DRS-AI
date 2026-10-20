import { Router } from 'express';
import { teamOrchestrator, TeamPattern, TeamMessage } from '../teams';
import logger from '../utils/logger';

const router = Router();

const PATTERNS: TeamPattern[] = ['round_robin', 'selector', 'handoff'];

// Create team
router.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { name, pattern, members, maxRounds, enableTools, skills } = req.body;
    if (!name || !pattern || !Array.isArray(members)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'name, pattern and members are required' }
      });
    }
    if (!PATTERNS.includes(pattern)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATTERN', message: `pattern must be one of: ${PATTERNS.join(', ')}` }
      });
    }

    const team = await teamOrchestrator.createTeam({
      name,
      pattern,
      members,
      maxRounds,
      enableTools,
      skills,
      userId
    });

    res.status(201).json({ success: true, data: { team } });
  } catch (error: any) {
    logger.error('Failed to create team:', error);
    res.status(400).json({ success: false, error: { code: 'TEAM_CREATION_FAILED', message: error.message } });
  }
});

// List teams
router.get('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const teams = await teamOrchestrator.listTeams(userId);
    res.json({ success: true, data: { teams } });
  } catch (error: any) {
    logger.error('Failed to list teams:', error);
    res.status(500).json({ success: false, error: { code: 'TEAMS_FETCH_FAILED', message: error.message } });
  }
});

// Get team
router.get('/:id', async (req, res) => {
  try {
    const team = await teamOrchestrator.getTeam(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
    }
    res.json({ success: true, data: { team } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Delete team
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await teamOrchestrator.deleteTeam(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
    }
    res.json({ success: true, data: { message: 'Team deleted' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

// Run team (SSE stream of the multi-agent conversation)
router.post('/:id/run', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { task, stream = true } = req.body;
    if (!task) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_TASK', message: 'task is required' } });
    }

    if (!stream) {
      const run = await teamOrchestrator.runTeam(req.params.id, task, undefined, userId);
      return res.json({ success: true, data: { run } });
    }

    // SSE mode: emit each conversation message as it happens
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'run_start', teamId: req.params.id, task })}\n\n`);

    let closed = false;
    res.on('close', () => { closed = true; });

    const onMessage = (msg: TeamMessage) => {
      if (!closed) {
        res.write(`data: ${JSON.stringify({ type: 'message', message: msg })}\n\n`);
      }
    };

    const run = await teamOrchestrator.runTeam(req.params.id, task, onMessage, userId);

    if (!closed) {
      res.write(`data: ${JSON.stringify({ type: 'run_done', status: run.status, finalOutput: run.finalOutput, error: run.error, runId: run.id })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error: any) {
    logger.error('Team run failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: { code: 'RUN_FAILED', message: error.message } });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Get a run
router.get('/:id/runs/:runId', async (req, res) => {
  try {
    const run = await teamOrchestrator.getRun(req.params.runId);
    if (!run || run.teamId !== req.params.id) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Run not found' } });
    }
    res.json({ success: true, data: { run } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

export default router;
