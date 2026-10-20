import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { skillsStore } from './services/store';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3045;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'skills', timestamp: new Date().toISOString() });
});

// List all skills
app.get('/skills', async (_req, res) => {
  try {
    const skills = await skillsStore.list();
    // Full body included — orchestrator/teams inject it into agent prompts
    res.json({ success: true, data: { skills } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Marketplace view (lightweight metadata, grouped)
app.get('/skills/marketplace', async (_req, res) => {
  try {
    const skills = await skillsStore.list();
    const items = skills.map(s => ({
      id: s.id,
      name: s.meta.name,
      description: s.meta.description,
      version: s.meta.version,
      tags: s.meta.tags,
      tools: s.meta.tools,
      enabled: s.enabled,
      source: s.source,
      installedAt: s.installedAt
    }));
    res.json({ success: true, data: { skills: items } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Get one skill (by id or name)
app.get('/skills/:id', async (req, res) => {
  try {
    const skill = await skillsStore.get(req.params.id);
    if (!skill) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Skill not found' } });
    }
    res.json({ success: true, data: { skill } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Install a skill from raw SKILL.md content
app.post('/skills', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'content (raw SKILL.md text) is required' }
      });
    }
    const skill = await skillsStore.install(content, 'installed');
    res.status(201).json({ success: true, data: { skill } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'INSTALL_FAILED', message: error.message } });
  }
});

// Enable / disable
app.post('/skills/:id/enable', async (req, res) => {
  try {
    const skill = await skillsStore.setEnabled(req.params.id, true);
    if (!skill) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Skill not found' } });
    res.json({ success: true, data: { skill } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
});

app.post('/skills/:id/disable', async (req, res) => {
  try {
    const skill = await skillsStore.setEnabled(req.params.id, false);
    if (!skill) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Skill not found' } });
    res.json({ success: true, data: { skill } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
});

// Delete skill
app.delete('/skills/:id', async (req, res) => {
  try {
    const deleted = await skillsStore.remove(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Skill not found' } });
    res.json({ success: true, data: { message: 'Skill removed' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
});

app.listen(PORT, () => {
  logger.info('=================================');
  logger.info('DRS AI Skills Service');
  logger.info(`Port: ${PORT}`);
  logger.info('=================================');
  skillsStore.seedBundledSkills().catch(e => logger.warn(`Seeding failed: ${e.message}`));
});

export default app;
