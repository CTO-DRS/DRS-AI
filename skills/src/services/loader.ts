import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger';

/**
 * SKILL.md loader — ported from OpenDrSai's skill system
 * (modules/components/skills/skill_loader.py).
 *
 * A skill is a markdown file with YAML frontmatter:
 *
 * ---
 * name: web-research
 * description: Deep web research with source citation
 * version: 1.0.0
 * tags: [research, web]
 * tools: [web_search, http_fetch]
 * ---
 * (markdown instructions the agent should follow when this skill is active)
 *
 * Frontmatter parsing is implemented natively (no YAML dependency) and covers
 * the subset of YAML that SKILL.md files use: scalars, strings and arrays.
 */

export interface SkillMeta {
  name: string;
  description: string;
  version: string;
  tags: string[];
  /** tool names this skill recommends */
  tools: string[];
  author?: string;
}

export interface Skill {
  id: string;
  meta: SkillMeta;
  body: string;
  enabled: boolean;
  source: 'bundled' | 'installed';
  installedAt: string;
  updatedAt: string;
}

const SKILLS_DIR = process.env.SKILLS_DIR || path.join(process.cwd(), 'data', 'skills');

export function parseFrontmatter(content: string): { meta: Partial<SkillMeta>; body: string } {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: normalized };
  }
  const [, frontmatter, body] = match;
  const meta: any = {};
  const lines = frontmatter.split('\n');
  let currentKey: string | null = null;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // array item under current key
    if (/^\s+-\s+/.test(line) && currentKey) {
      const item = line.replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, '');
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(item);
      continue;
    }

    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      let value: any = kv[2].trim();
      if (value === '') {
        meta[currentKey] = [];
        continue;
      }
      // inline array [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        meta[currentKey] = value
          .slice(1, -1)
          .split(',')
          .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        continue;
      }
      value = value.replace(/^['"]|['"]$/g, '');
      meta[currentKey] = value;
    }
  }
  return { meta, body: body.trim() };
}

export function renderFrontmatter(meta: SkillMeta): string {
  const tags = meta.tags?.length ? `[${meta.tags.map(t => `"${t}"`).join(', ')}]` : '[]';
  const tools = meta.tools?.length ? `[${meta.tools.map(t => `"${t}"`).join(', ')}]` : '[]';
  return `---
name: "${meta.name}"
description: "${meta.description.replace(/"/g, '\\"')}"
version: "${meta.version}"
tags: ${tags}
tools: ${tools}
${meta.author ? `author: "${meta.author}"\n` : ''}---`;
}

export function validateSkillContent(content: string): { ok: boolean; error?: string; meta?: SkillMeta } {
  const { meta } = parseFrontmatter(content);
  if (!meta.name) return { ok: false, error: 'SKILL.md frontmatter must include a "name" field' };
  if (!meta.description) return { ok: false, error: 'SKILL.md frontmatter must include a "description" field' };
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(String(meta.name))) {
    return { ok: false, error: 'Skill name must be alphanumeric with dashes/underscores' };
  }
  return {
    ok: true,
    meta: {
      name: String(meta.name),
      description: String(meta.description),
      version: String(meta.version || '1.0.0'),
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      tools: Array.isArray(meta.tools) ? meta.tools.map(String) : [],
      author: meta.author ? String(meta.author) : undefined
    }
  };
}

export async function ensureSkillsDir(): Promise<void> {
  await fs.mkdir(SKILLS_DIR, { recursive: true });
}

export async function persistSkill(id: string, content: string): Promise<void> {
  const filePath = path.join(SKILLS_DIR, `${id}.md`);
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function readPersistedSkill(id: string): Promise<string | null> {
  try {
    const filePath = path.join(SKILLS_DIR, `${id}.md`);
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function deletePersistedSkill(id: string): Promise<void> {
  try {
    await fs.unlink(path.join(SKILLS_DIR, `${id}.md`));
  } catch (e: any) {
    logger.debug(`deletePersistedSkill ${id}: ${e.message}`);
  }
}
