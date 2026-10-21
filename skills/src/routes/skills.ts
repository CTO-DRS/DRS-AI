import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { createGzip } from 'zlib';
import { Pack } from 'tar';

import skillService from '../services/skillService';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { HttpError, badRequest, notFound } from '../utils/errors';
import { PathTraversalError } from '../utils/pathSafety';
import logger from '../utils/logger';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const PUBLIC_PATH_PREFIX = process.env.SKILLS_PUBLIC_PATH || '/api/skills';

/**
 * Map any thrown value onto the standard response envelope:
 *   { success: false, error: { code, message } }
 */
function respondError(res: import('express').Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      success: false,
      error: { code: error.code, message: error.message }
    });
    return;
  }
  if (error instanceof PathTraversalError) {
    res.status(400).json({
      success: false,
      error: { code: 'UNSAFE_PATH', message: error.message }
    });
    return;
  }
  logger.error('Request failed:', error);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error instanceof Error
            ? error.message
            : 'Internal server error'
    }
  });
}

function parseJsonField(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest('Field "files" must be valid JSON: [{ path, content }]', 'INVALID_FILES');
  }
}

// ---------------------------------------------------------------------------
// Non-parameterized routes first
// ---------------------------------------------------------------------------

// GET /tags/list — distinct tags across all skills
router.get('/tags/list', async (req, res) => {
  try {
    const tags = await skillService.listTags();
    res.json({ success: true, data: { tags } });
  } catch (error) {
    respondError(res, error);
  }
});

// GET /shared/:token — resolve a share link to a full skill detail (public)
router.get('/shared/:token', async (req, res) => {
  try {
    const detail = await skillService.resolveShare(String(req.params.token));
    res.json({ success: true, data: detail });
  } catch (error) {
    respondError(res, error);
  }
});

// POST /upload — create a skill from an archive (field "file")
// or from an inline file tree (field "files": [{ path, content }] as JSON).
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const userId = req.userId as string;

    let meta;
    if (req.file) {
      const originalName = req.file.originalname.toLowerCase();
      if (
        !originalName.endsWith('.tar.gz') &&
        !originalName.endsWith('.tgz') &&
        !originalName.endsWith('.zip')
      ) {
        throw badRequest(
          'Unsupported archive type: upload a .tar.gz, .tgz or .zip file',
          'UNSUPPORTED_ARCHIVE'
        );
      }
      meta = await skillService.createSkillFromArchive(req.file.buffer, userId);
    } else {
      meta = await skillService.createSkillFromInlineFiles(parseJsonField(req.body?.files), userId);
    }

    res.status(201).json({ success: true, data: meta });
  } catch (error) {
    respondError(res, error);
  }
});

// GET / — list skills (?tag=&q=&mine=true)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const mine = req.query.mine === 'true';
    const skills = await skillService.listSkills({ tag, q, mine, userId: req.userId });
    res.json({ success: true, data: { skills, count: skills.length } });
  } catch (error) {
    respondError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Parameterized routes
// ---------------------------------------------------------------------------

// GET /:id — skill detail (metadata + markdown body + file list)
router.get('/:id', async (req, res) => {
  try {
    const detail = await skillService.getSkillDetail(String(req.params.id));
    res.json({ success: true, data: detail });
  } catch (error) {
    respondError(res, error);
  }
});

// GET /:id/download — stream the skill folder as a .tar.gz
router.get('/:id/download', async (req, res) => {
  try {
    const id = String(req.params.id);
    const meta = await skillService.getSkillMeta(id);
    if (!meta) {
      throw notFound(`Skill "${id}" not found`, 'SKILL_NOT_FOUND');
    }
    const skillsDir = skillService.getSkillsDir();
    if (!fs.existsSync(path.join(skillsDir, meta.id))) {
      throw notFound(`Skill package files for "${id}" are missing on disk`, 'SKILL_FILES_MISSING');
    }

    await skillService.recordDownload(meta.id);

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${meta.id}.tar.gz"`);

    const pack = new Pack({ cwd: skillsDir, portable: true });
    pack.on('error', (err: Error) => {
      logger.error(`Failed to stream archive for skill "${meta.id}"`, { error: err });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: { code: 'ARCHIVE_FAILED', message: 'Failed to build skill archive' }
        });
      } else {
        res.end();
      }
    });
    pack.pipe(createGzip()).pipe(res);
    pack.add(meta.id);
    pack.end();
  } catch (error) {
    respondError(res, error);
  }
});

// GET /:id/context — { name, description, body } (orchestrator prompt injection)
router.get('/:id/context', async (req, res) => {
  try {
    const context = await skillService.getSkillContext(String(req.params.id));
    res.json({ success: true, data: context });
  } catch (error) {
    respondError(res, error);
  }
});

// POST /:id/invoke — increment usage counter and return the context
router.post('/:id/invoke', async (req, res) => {
  try {
    const context = await skillService.recordInvocation(String(req.params.id));
    res.json({ success: true, data: context });
  } catch (error) {
    respondError(res, error);
  }
});

// GET /:id/stats — { downloads, invocations, shares }
router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await skillService.getSkillStats(String(req.params.id));
    res.json({ success: true, data: stats });
  } catch (error) {
    respondError(res, error);
  }
});

// POST /:id/share — create a share token { expiresInDays }
router.post('/:id/share', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const userId = req.userId as string;
    const publicBaseUrl =
      process.env.SKILLS_PUBLIC_URL ||
      `${req.protocol}://${req.get('host') || `localhost:${process.env.PORT || 3044}`}${PUBLIC_PATH_PREFIX}`;
    const result = await skillService.createShare(id, userId, req.body?.expiresInDays, publicBaseUrl);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    respondError(res, error);
  }
});

// PUT /:id — update { description?, tags?, body? }, owner or admin only
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const detail = await skillService.updateSkill(
      id,
      {
        description: req.body?.description,
        tags: req.body?.tags,
        body: req.body?.body
      },
      req.userId as string,
      req.userRole
    );
    res.json({ success: true, data: detail });
  } catch (error) {
    respondError(res, error);
  }
});

// DELETE /:id — owner or admin only
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await skillService.deleteSkill(id, req.userId as string, req.userRole);
    res.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    respondError(res, error);
  }
});

export default router;
