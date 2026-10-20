import { Router } from 'express';
import { query } from '../utils/db';
import logger from '../utils/logger';

/**
 * Prompt library — ported from OpenDrSai's prompt management
 * (prompt templates with {{variables}} + render endpoint).
 * Teams and agents can reference saved prompt templates by id.
 */

const router = Router();

let tableReady = false;
async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS prompts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      template TEXT NOT NULL,
      variables JSONB DEFAULT '[]'::jsonb,
      tags JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  tableReady = true;
}

function extractVariables(template: string): string[] {
  const vars = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(template)) !== null) vars.add(m[1]);
  return Array.from(vars);
}

// Create prompt
router.post('/', async (req, res) => {
  try {
    await ensureTable();
    const userId = (req.headers['x-user-id'] as string) || null;
    const { name, template, description, tags } = req.body;
    if (!name || !template) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'name and template are required' } });
    }
    const variables = extractVariables(template);
    const result = await query(
      `INSERT INTO prompts (user_id, name, description, template, variables, tags)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING *`,
      [userId, name, description || null, template, JSON.stringify(variables), JSON.stringify(tags || [])]
    );
    res.status(201).json({ success: true, data: { prompt: result.rows[0] } });
  } catch (error: any) {
    logger.error('Failed to create prompt:', error);
    res.status(500).json({ success: false, error: { code: 'CREATE_FAILED', message: error.message } });
  }
});

// List prompts
router.get('/', async (req, res) => {
  try {
    await ensureTable();
    const userId = req.headers['x-user-id'] as string;
    const { limit = 100 } = req.query;
    const result = await query(
      `SELECT * FROM prompts WHERE user_id = $1 OR user_id IS NULL ORDER BY created_at DESC LIMIT $2`,
      [userId || '', Number(limit)]
    );
    res.json({ success: true, data: { prompts: result.rows } });
  } catch (error: any) {
    logger.error('Failed to list prompts:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Get one prompt
router.get('/:id', async (req, res) => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM prompts WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prompt not found' } });
    }
    res.json({ success: true, data: { prompt: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'FETCH_FAILED', message: error.message } });
  }
});

// Update prompt
router.put('/:id', async (req, res) => {
  try {
    await ensureTable();
    const { name, template, description, tags } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (template !== undefined) {
      updates.push(`template = $${idx++}`); params.push(template);
      updates.push(`variables = $${idx++}`); params.push(JSON.stringify(extractVariables(template)));
    }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (tags !== undefined) { updates.push(`tags = $${idx++}::jsonb`); params.push(JSON.stringify(tags)); }
    if (!updates.length) {
      return res.status(400).json({ success: false, error: { code: 'NOTHING_TO_UPDATE', message: 'No updatable fields provided' } });
    }
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await query(
      `UPDATE prompts SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prompt not found' } });
    }
    res.json({ success: true, data: { prompt: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
});

// Delete prompt
router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const result = await query(`DELETE FROM prompts WHERE id = $1`, [req.params.id]);
    if (!result.rowCount) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prompt not found' } });
    }
    res.json({ success: true, data: { message: 'Prompt deleted' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'DELETE_FAILED', message: error.message } });
  }
});

// Render prompt with variables
router.post('/:id/render', async (req, res) => {
  try {
    await ensureTable();
    const result = await query(`SELECT * FROM prompts WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prompt not found' } });
    }
    const prompt = result.rows[0];
    const variables: Record<string, string> = req.body.variables || {};
    let rendered: string = prompt.template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(value));
    }
    const missing = extractVariables(prompt.template).filter(v => !(v in variables));
    res.json({ success: true, data: { rendered, missingVariables: missing } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'RENDER_FAILED', message: error.message } });
  }
});

export default router;
