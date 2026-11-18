import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import * as tar from 'tar';

import redis from '../utils/redis';
import logger from '../utils/logger';
import { buildSkillMd, parseFrontmatter, SkillFrontmatter } from '../utils/frontmatter';
import { isJunkPath, sanitizeRelativePath, toSafeAbsolutePath } from '../utils/pathSafety';
import { HttpError, badRequest, conflict, forbidden, notFound, unauthorized } from '../utils/errors';
import type {
  ListSkillsOptions,
  ShareRecord,
  ShareResult,
  SkillDetail,
  SkillFileEntry,
  SkillMeta,
  SkillStats,
  UpdateSkillInput
} from '../types';

// ---------------------------------------------------------------------------
// Storage layout
//
//   <SKILLS_DIR>/<skillId>/SKILL.md        <- frontmatter + instructions body
//   <SKILLS_DIR>/<skillId>/scripts/...     <- optional extra files, stored as-is
//   <SKILLS_DIR>/<skillId>/references/...
//
// Redis keys:
//   drs:skills:index            hash  skillId -> JSON SkillMeta
//   drs:skill:<id>              hash  { downloads, invocations, shares }
//   drs:skill:share:<token>     JSON  ShareRecord, TTL = share lifetime
// ---------------------------------------------------------------------------

const INDEX_KEY = 'drs:skills:index';
const STATS_KEY_PREFIX = 'drs:skill:';
const SHARE_KEY_PREFIX = 'drs:skill:share:';

const SHARE_TTL_DEFAULT_DAYS = 7;
const SHARE_TTL_MIN_DAYS = 1;
const SHARE_TTL_MAX_DAYS = 30;

const SLUG_REGEX = /^[a-z0-9][a-z0-9-_]{1,63}$/;

const MAX_FILES = Number(process.env.SKILLS_MAX_FILES || 200);
const MAX_TOTAL_BYTES = Number(process.env.SKILLS_MAX_TOTAL_BYTES || 20 * 1024 * 1024); // 20MB
const MAX_FILE_BYTES = Number(process.env.SKILLS_MAX_FILE_BYTES || 5 * 1024 * 1024); // 5MB

/** A single file of an in-memory skill package. */
export interface StoredSkillFile {
  path: string;
  data: Buffer;
}

function resolveSkillsDir(): string {
  const configured = process.env.SKILLS_DIR;
  if (configured && configured.trim().length > 0) {
    return path.resolve(configured.trim());
  }
  if (fs.existsSync('/app/data')) {
    return '/app/data/skills';
  }
  return path.resolve(process.cwd(), 'data', 'skills');
}

const SKILLS_DIR = resolveSkillsDir();

export function getSkillsDir(): string {
  return SKILLS_DIR;
}

export async function ensureStorage(): Promise<void> {
  await fsp.mkdir(SKILLS_DIR, { recursive: true });
}

export function validateSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

function skillDir(id: string): string {
  if (!validateSlug(id)) {
    // defense in depth: ids are always slugs, never raw user paths
    throw badRequest(`Invalid skill id "${id}"`, 'INVALID_SKILL_ID');
  }
  return path.join(SKILLS_DIR, id);
}

// ---------------------------------------------------------------------------
// Redis index helpers
// ---------------------------------------------------------------------------

async function readMeta(id: string): Promise<SkillMeta | null> {
  const raw = await redis.hget(INDEX_KEY, id);
  if (!raw) {
    return null;
  }
  try {
    const meta = JSON.parse(raw) as SkillMeta;
    return meta && typeof meta.id === 'string' ? meta : null;
  } catch (error) {
    logger.warn(`Corrupted index entry for skill "${id}"`, { error });
    return null;
  }
}

async function writeMeta(meta: SkillMeta): Promise<void> {
  await redis.hset(INDEX_KEY, meta.id, JSON.stringify(meta));
}

async function listMetas(): Promise<SkillMeta[]> {
  const all = await redis.hgetall(INDEX_KEY);
  const metas: SkillMeta[] = [];
  for (const raw of Object.values(all)) {
    try {
      const meta = JSON.parse(raw) as SkillMeta;
      if (meta && typeof meta.id === 'string') {
        metas.push(meta);
      }
    } catch {
      logger.warn('Skipping corrupted skill index entry');
    }
  }
  return metas;
}

async function requireMeta(id: string): Promise<SkillMeta> {
  const meta = await readMeta(id);
  if (!meta) {
    throw notFound(`Skill "${id}" not found`, 'SKILL_NOT_FOUND');
  }
  return meta;
}

function assertCanModify(meta: SkillMeta, userId: string, userRole: string | undefined): void {
  if (meta.createdBy !== userId && userRole !== 'admin') {
    throw forbidden('Only the skill owner or an admin can modify this skill');
  }
}

function statsKeyFor(id: string): string {
  return `${STATS_KEY_PREFIX}${id}`;
}

// ---------------------------------------------------------------------------
// Package files helpers
// ---------------------------------------------------------------------------

async function listSkillFiles(id: string): Promise<SkillFileEntry[]> {
  const dir = skillDir(id);
  const out: SkillFileEntry[] = [];

  const walk = async (current: string): Promise<void> => {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const rel = sanitizeRelativePath(path.relative(dir, abs));
        if (rel) {
          const stat = await fsp.stat(abs);
          out.push({ path: rel, size: stat.size });
        }
      }
    }
  };

  try {
    await walk(dir);
  } catch (error) {
    logger.warn(`Failed to list files for skill "${id}"`, { error });
    return [];
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function totalSizeOf(files: StoredSkillFile[]): Promise<number> {
  return files.reduce((sum, file) => sum + file.data.length, 0);
}

/** Drop junk, normalize and deduplicate (last one wins) package files. */
function normalizeFiles(files: StoredSkillFile[]): StoredSkillFile[] {
  const byPath = new Map<string, Buffer>();
  for (const file of files) {
    const rel = sanitizeRelativePath(file.path);
    if (!rel || isJunkPath(rel)) {
      continue;
    }
    byPath.set(rel, file.data);
  }
  return Array.from(byPath.entries()).map(([p, data]) => ({ path: p, data }));
}

/**
 * Locate SKILL.md inside a package. Accepts the file at the archive root or
 * inside a single top-level folder (as produced by zipping a skill folder).
 * When wrapped, the wrapper prefix is stripped from every file.
 */
function locateSkillMd(files: StoredSkillFile[]): StoredSkillFile[] {
  const rootMd = files.find((f) => f.path === 'SKILL.md');
  if (rootMd) {
    return files;
  }

  const wrapped = files
    .filter((f) => /^[^/]+\/SKILL\.md$/.test(f.path))
    .sort((a, b) => a.path.length - b.path.length)[0];

  if (!wrapped) {
    throw badRequest(
      'Skill package must contain a SKILL.md file at its root (or inside a single top-level folder)',
      'SKILL_MD_MISSING'
    );
  }

  const prefix = wrapped.path.slice(0, -'SKILL.md'.length); // includes trailing "/"
  return files
    .filter((f) => f.path.startsWith(prefix))
    .map((f) => ({ path: f.path.slice(prefix.length), data: f.data }));
}

function parseSkillMdFile(file: StoredSkillFile): { frontmatter: SkillFrontmatter; body: string } {
  const content = file.data.toString('utf8');
  try {
    return parseFrontmatter(content);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid SKILL.md', 'SKILL_INVALID');
  }
}

function validateFrontmatter(frontmatter: SkillFrontmatter): void {
  if (!validateSlug(frontmatter.name)) {
    throw badRequest(
      `Invalid skill name "${frontmatter.name}": must match /^[a-z0-9][a-z0-9-_]{1,63}$/ (lowercase slug, 2-64 chars)`,
      'NAME_INVALID'
    );
  }
  if (frontmatter.tags.length > 20) {
    throw badRequest('A skill may declare at most 20 tags', 'TOO_MANY_TAGS');
  }
}

async function extractZipArchive(buffer: Buffer): Promise<StoredSkillFile[]> {
  const zip = new AdmZip(buffer);
  const out: StoredSkillFile[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }
    const rel = sanitizeRelativePath(entry.entryName);
    if (!rel || isJunkPath(rel)) {
      continue;
    }
    out.push({ path: rel, data: entry.getData() });
  }
  return out;
}

async function extractTarGzArchive(buffer: Buffer): Promise<StoredSkillFile[]> {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'skill-extract-'));
  try {
    const archivePath = path.join(workDir, 'upload.tar.gz');
    await fsp.writeFile(archivePath, buffer);

    const extractDir = path.join(workDir, 'extracted');
    await fsp.mkdir(extractDir, { recursive: true });

    // strict mode + file/directory-only filter: symlinks, hardlinks and other
    // exotic entry types are rejected so nothing can escape via a link
    await tar.x({
      cwd: extractDir,
      file: archivePath,
      strict: true,
      filter: (_entryPath: string, entry: fs.Stats | tar.ReadEntry): boolean => {
        const type = (entry as { type?: string }).type;
        return type === 'File' || type === 'Directory';
      }
    });

    const out: StoredSkillFile[] = [];
    const walk = async (current: string): Promise<void> => {
      const entries = await fsp.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const abs = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.isFile()) {
          const rel = sanitizeRelativePath(path.relative(extractDir, abs));
          if (!rel || isJunkPath(rel)) {
            continue;
          }
          out.push({ path: rel, data: await fsp.readFile(abs) });
        }
      }
    };
    await walk(extractDir);
    return out;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Create / read / update / delete
// ---------------------------------------------------------------------------

async function persistSkill(
  files: StoredSkillFile[],
  createdBy: string
): Promise<SkillMeta> {
  const normalized = locateSkillMd(normalizeFiles(files));
  const skillMd = normalized.find((f) => f.path === 'SKILL.md');
  if (!skillMd) {
    throw badRequest('Skill package must contain a SKILL.md file', 'SKILL_MD_MISSING');
  }

  const { frontmatter, body } = parseSkillMdFile(skillMd);
  validateFrontmatter(frontmatter);

  const id = frontmatter.name;
  if (normalized.length > MAX_FILES) {
    throw badRequest(`Skill package exceeds the maximum of ${MAX_FILES} files`, 'TOO_MANY_FILES');
  }
  for (const file of normalized) {
    if (file.data.length > MAX_FILE_BYTES) {
      throw badRequest(
        `File "${file.path}" exceeds the maximum size of ${MAX_FILE_BYTES} bytes`,
        'FILE_TOO_LARGE'
      );
    }
  }
  const totalBytes = await totalSizeOf(normalized);
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw badRequest(
      `Skill package exceeds the maximum total size of ${MAX_TOTAL_BYTES} bytes`,
      'PACKAGE_TOO_LARGE'
    );
  }

  // conflict handling: same owner may overwrite (re-upload), others get 409
  const existing = await readMeta(id);
  if (existing && existing.createdBy !== createdBy) {
    throw conflict(`A skill named "${id}" already exists (owned by another user)`);
  }
  if (existing) {
    logger.info(`Overwriting skill "${id}" by its owner "${createdBy}"`);
  }

  const dir = skillDir(id);
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });

  for (const file of normalized) {
    const abs = toSafeAbsolutePath(dir, file.path);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, file.data);
  }

  const now = new Date().toISOString();
  const meta: SkillMeta = {
    id,
    name: frontmatter.name,
    description: frontmatter.description,
    version: frontmatter.version,
    author: frontmatter.author,
    tags: frontmatter.tags,
    createdBy: existing?.createdBy || createdBy,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    fileCount: normalized.length,
    sizeBytes: totalBytes
  };
  await writeMeta(meta);
  logger.info(`Stored skill "${id}" (${normalized.length} files, ${totalBytes} bytes)`);
  return meta;
}

/** Create a skill from an uploaded .zip / .tar.gz / .tgz archive. */
export async function createSkillFromArchive(buffer: Buffer, createdBy: string): Promise<SkillMeta> {
  const isZip = buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
  let files: StoredSkillFile[];
  try {
    files = isZip ? await extractZipArchive(buffer) : await extractTarGzArchive(buffer);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    logger.warn('Archive extraction failed', { error });
    throw badRequest('Archive is corrupted or contains unsafe entries', 'ARCHIVE_INVALID');
  }
  if (files.length === 0) {
    throw badRequest('Archive is empty or contains no usable files', 'ARCHIVE_EMPTY');
  }
  return persistSkill(files, createdBy);
}

/** Create a skill from an inline file tree: [{ path, content }, ...]. */
export async function createSkillFromInlineFiles(
  rawFiles: unknown,
  createdBy: string
): Promise<SkillMeta> {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    throw badRequest(
      'Provide either a "file" field (.tar.gz/.tgz/.zip) or a "files" field: [{ path, content }]',
      'NO_INPUT'
    );
  }

  const files: StoredSkillFile[] = [];
  for (const raw of rawFiles) {
    const item = raw as { path?: unknown; content?: unknown };
    if (
      !item ||
      typeof item.path !== 'string' ||
      typeof item.content !== 'string'
    ) {
      throw badRequest('Each entry of "files" must be { path: string, content: string }', 'INVALID_FILES');
    }
    files.push({ path: item.path, data: Buffer.from(item.content, 'utf8') });
  }
  return persistSkill(files, createdBy);
}

async function readSkillMdRaw(id: string): Promise<string> {
  const dir = skillDir(id);
  const abs = toSafeAbsolutePath(dir, 'SKILL.md');
  try {
    return await fsp.readFile(abs, 'utf8');
  } catch {
    throw notFound(`Skill package files for "${id}" are missing on disk`, 'SKILL_FILES_MISSING');
  }
}

export async function getSkillDetail(id: string): Promise<SkillDetail> {
  const meta = await requireMeta(id);
  let body = '';
  try {
    const parsed = parseFrontmatter(await readSkillMdRaw(meta.id));
    body = parsed.body;
  } catch (error) {
    // SKILL.md exists but cannot be parsed anymore — surface the raw content
    logger.warn(`SKILL.md of "${meta.id}" could not be parsed`, { error });
    body = await readSkillMdRaw(meta.id);
  }
  const files = await listSkillFiles(meta.id);
  return { ...meta, body, files };
}

export async function getSkillMeta(id: string): Promise<SkillMeta | null> {
  return readMeta(id);
}

/** { name, description, body } — injected by the orchestrator into agent prompts. */
export async function getSkillContext(id: string): Promise<{ name: string; description: string; body: string }> {
  const detail = await getSkillDetail(id);
  return { name: detail.name, description: detail.description, body: detail.body };
}

export async function updateSkill(
  id: string,
  patch: UpdateSkillInput,
  userId: string,
  userRole: string | undefined
): Promise<SkillDetail> {
  const meta = await requireMeta(id);
  assertCanModify(meta, userId, userRole);

  if (patch.description !== undefined && typeof patch.description !== 'string') {
    throw badRequest('"description" must be a string', 'INVALID_DESCRIPTION');
  }
  if (patch.body !== undefined && typeof patch.body !== 'string') {
    throw badRequest('"body" must be a string', 'INVALID_BODY');
  }

  let tags = meta.tags;
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags)) {
      throw badRequest('"tags" must be an array of strings', 'INVALID_TAGS');
    }
    tags = patch.tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter((tag) => tag.length > 0 && tag.length <= 32)
      .slice(0, 20);
  }

  const description = patch.description !== undefined ? patch.description : meta.description;

  let currentBody = '';
  try {
    currentBody = parseFrontmatter(await readSkillMdRaw(meta.id)).body;
  } catch {
    currentBody = '';
  }
  const body = patch.body !== undefined ? patch.body : currentBody;

  const frontmatter: SkillFrontmatter = {
    name: meta.name,
    description,
    version: meta.version,
    author: meta.author,
    tags
  };

  const dir = skillDir(meta.id);
  const mdPath = toSafeAbsolutePath(dir, 'SKILL.md');
  await fsp.writeFile(mdPath, buildSkillMd(frontmatter, body), 'utf8');

  const files = await listSkillFiles(meta.id);
  const updated: SkillMeta = {
    ...meta,
    description,
    tags,
    fileCount: files.length,
    sizeBytes: files.reduce((sum, f) => sum + f.size, 0),
    updatedAt: new Date().toISOString()
  };
  await writeMeta(updated);
  logger.info(`Updated skill "${meta.id}"`);

  return { ...updated, body, files };
}

export async function deleteSkill(
  id: string,
  userId: string,
  userRole: string | undefined
): Promise<void> {
  const meta = await requireMeta(id);
  assertCanModify(meta, userId, userRole);

  await redis.hdel(INDEX_KEY, meta.id);
  await redis.del(statsKeyFor(meta.id));
  await fsp.rm(skillDir(meta.id), { recursive: true, force: true });
  logger.info(`Deleted skill "${meta.id}"`);
}

// ---------------------------------------------------------------------------
// Listing / search / tags
// ---------------------------------------------------------------------------

export async function listSkills(options: ListSkillsOptions): Promise<SkillMeta[]> {
  let metas = await listMetas();

  if (options.mine) {
    if (!options.userId) {
      throw unauthorized('Authentication required for ?mine=true');
    }
    metas = metas.filter((meta) => meta.createdBy === options.userId);
  }

  if (options.tag && options.tag.length > 0) {
    const tag = options.tag.toLowerCase();
    metas = metas.filter((meta) => meta.tags.some((t) => t.toLowerCase() === tag));
  }

  if (options.q && options.q.length > 0) {
    const q = options.q.toLowerCase();
    metas = metas.filter(
      (meta) => meta.name.toLowerCase().includes(q) || meta.description.toLowerCase().includes(q)
    );
  }

  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listTags(): Promise<string[]> {
  const metas = await listMetas();
  const tags = new Set<string>();
  for (const meta of metas) {
    for (const tag of meta.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Usage stats / sharing
// ---------------------------------------------------------------------------

async function readStats(id: string): Promise<SkillStats> {
  const raw = await redis.hgetall(statsKeyFor(id));
  const toInt = (value: string | undefined): number => {
    const parsed = Number.parseInt(value || '0', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return {
    downloads: toInt(raw.downloads),
    invocations: toInt(raw.invocations),
    shares: toInt(raw.shares)
  };
}

export async function getSkillStats(id: string): Promise<SkillStats> {
  const meta = await requireMeta(id);
  return readStats(meta.id);
}

export async function recordDownload(id: string): Promise<void> {
  await redis.hincrby(statsKeyFor(id), 'downloads', 1);
}

/** Increment the usage counter and return the context (agent "uses" a skill). */
export async function recordInvocation(id: string): Promise<{ name: string; description: string; body: string }> {
  const context = await getSkillContext(id);
  await redis.hincrby(statsKeyFor(id), 'invocations', 1);
  return context;
}

function clampShareDays(expiresInDays: unknown): number {
  const parsed =
    typeof expiresInDays === 'number'
      ? expiresInDays
      : typeof expiresInDays === 'string' && expiresInDays.trim().length > 0
        ? Number(expiresInDays)
        : NaN;
  if (!Number.isFinite(parsed)) {
    return SHARE_TTL_DEFAULT_DAYS;
  }
  return Math.min(Math.max(Math.round(parsed), SHARE_TTL_MIN_DAYS), SHARE_TTL_MAX_DAYS);
}

export async function createShare(
  id: string,
  userId: string,
  expiresInDays: unknown,
  publicBaseUrl: string
): Promise<ShareResult> {
  const meta = await requireMeta(id);
  const days = clampShareDays(expiresInDays);

  const token = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const record: ShareRecord = {
    skillId: meta.id,
    createdBy: userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  await redis.set(`${SHARE_KEY_PREFIX}${token}`, JSON.stringify(record), 'EX', days * 24 * 60 * 60);
  await redis.hincrby(statsKeyFor(meta.id), 'shares', 1);
  logger.info(`Created share link for skill "${meta.id}" (expires ${record.expiresAt})`);

  return {
    shareToken: token,
    skillId: meta.id,
    url: `${publicBaseUrl}/shared/${token}`,
    expiresAt: record.expiresAt,
    expiresInDays: days
  };
}

export async function resolveShare(token: string): Promise<SkillDetail> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    throw notFound('Share link not found or expired', 'SHARE_NOT_FOUND');
  }
  const raw = await redis.get(`${SHARE_KEY_PREFIX}${token}`);
  if (!raw) {
    throw notFound('Share link not found or expired', 'SHARE_NOT_FOUND');
  }
  let record: ShareRecord;
  try {
    record = JSON.parse(raw) as ShareRecord;
  } catch {
    throw notFound('Share link not found or expired', 'SHARE_NOT_FOUND');
  }
  return getSkillDetail(record.skillId);
}

// ---------------------------------------------------------------------------
// Boot-time index recovery
// ---------------------------------------------------------------------------

/**
 * Rebuild missing Redis index entries from the on-disk skill packages
 * (protects against Redis data loss while SKILLS_DIR is a persistent volume).
 * Existing index entries are never overwritten.
 */
export async function syncIndexFromDisk(): Promise<number> {
  let restored = 0;
  const entries = await fsp.readdir(SKILLS_DIR, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isDirectory() || !validateSlug(entry.name)) {
      continue;
    }
    const existing = await readMeta(entry.name);
    if (existing) {
      continue;
    }
    try {
      const raw = await fsp.readFile(path.join(SKILLS_DIR, entry.name, 'SKILL.md'), 'utf8');
      const parsed = parseFrontmatter(raw);
      const files = await listSkillFiles(entry.name);
      const now = new Date().toISOString();
      const meta: SkillMeta = {
        id: entry.name,
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        version: parsed.frontmatter.version,
        author: parsed.frontmatter.author,
        tags: parsed.frontmatter.tags,
        createdBy: 'unknown',
        createdAt: now,
        updatedAt: now,
        fileCount: files.length,
        sizeBytes: files.reduce((sum, f) => sum + f.size, 0)
      };
      await writeMeta(meta);
      restored += 1;
    } catch (error) {
      logger.warn(`Skipping invalid skill package "${entry.name}" during index sync`, { error });
    }
  }

  return restored;
}

const skillService = {
  getSkillsDir,
  ensureStorage,
  syncIndexFromDisk,
  validateSlug,
  createSkillFromArchive,
  createSkillFromInlineFiles,
  getSkillMeta,
  getSkillDetail,
  getSkillContext,
  updateSkill,
  deleteSkill,
  listSkills,
  listTags,
  getSkillStats,
  recordDownload,
  recordInvocation,
  createShare,
  resolveShare
};

export default skillService;
