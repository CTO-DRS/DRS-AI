/**
 * Core domain types for the skills service.
 */

/** Public metadata stored in the Redis index (hash drs:skills:index). */
export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string | null;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  sizeBytes: number;
}

/** One file inside a skill package (relative POSIX path + byte size). */
export interface SkillFileEntry {
  path: string;
  size: number;
}

/** Metadata + markdown body + file list (GET /:id). */
export interface SkillDetail extends SkillMeta {
  body: string;
  files: SkillFileEntry[];
}

/** What the orchestrator injects into an agent prompt (GET /:id/context). */
export interface SkillContext {
  name: string;
  description: string;
  body: string;
}

/** Usage counters stored in the per-skill Redis key drs:skill:<id>. */
export interface SkillStats {
  downloads: number;
  invocations: number;
  shares: number;
}

/** JSON payload stored under drs:skill:share:<token>. */
export interface ShareRecord {
  skillId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

/** Result of POST /:id/share. */
export interface ShareResult {
  shareToken: string;
  skillId: string;
  url: string;
  expiresAt: string;
  expiresInDays: number;
}

/** Inline file tree accepted by POST /upload (field "files"). */
export interface SkillFileInput {
  path: string;
  content: string;
}

/** Query options for GET / (list skills). */
export interface ListSkillsOptions {
  tag?: string;
  q?: string;
  mine?: boolean;
  userId?: string;
}

/** Body of PUT /:id. */
export interface UpdateSkillInput {
  description?: string;
  tags?: string[];
  body?: string;
}
