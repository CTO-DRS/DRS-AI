/**
 * Safe filesystem path helpers for skill packages.
 * All user-supplied paths (archive entries, inline file trees) must go through
 * these before touching the disk, to prevent path traversal attacks.
 */
import path from 'path';

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

/**
 * Normalize a user-supplied relative path to a clean POSIX-style path.
 * Returns null when the path is unsafe or unusable:
 * - absolute paths ("/etc/passwd", "C:\x")
 * - any ".." segment (path traversal)
 * - empty after normalization
 */
export function sanitizeRelativePath(inputPath: string): string | null {
  if (typeof inputPath !== 'string' || inputPath.trim().length === 0) {
    return null;
  }
  const unified = inputPath.replace(/\\/g, '/');
  if (path.isAbsolute(unified)) {
    return null;
  }
  const segments: string[] = [];
  for (const segment of unified.split('/')) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      return null;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    return null;
  }
  return segments.join('/');
}

/**
 * Decide whether a relative path is OS/SCM noise that should be dropped
 * from uploaded skill packages.
 */
export function isJunkPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  if (segments.some((s) => s === '__MACOSX' || s === '.git')) {
    return true;
  }
  const base = segments[segments.length - 1];
  return base === '.DS_Store' || base === 'Thumbs.db';
}

/**
 * Resolve a sanitized relative path under baseDir and guarantee that the
 * result stays inside baseDir. Throws PathTraversalError otherwise.
 */
export function toSafeAbsolutePath(baseDir: string, relativePath: string): string {
  const rel = sanitizeRelativePath(relativePath);
  if (!rel) {
    throw new PathTraversalError(`Unsafe path rejected: "${relativePath}"`);
  }
  const base = path.resolve(baseDir);
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new PathTraversalError(`Path escapes skill directory: "${relativePath}"`);
  }
  return abs;
}
