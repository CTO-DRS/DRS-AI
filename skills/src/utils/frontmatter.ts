/**
 * Minimal YAML frontmatter parser + serializer for the SKILL.md convention.
 *
 * Supports the subset of YAML required by the spec (no external yaml dep):
 *   name: web-search-pro          # scalar
 *   description: "Does research"  # optional quotes are stripped
 *   tags: [search, web]           # inline array
 *   tags:                         # block list
 *     - search
 *     - web
 * Unknown keys are ignored. Values may not span multiple lines.
 */

export interface SkillFrontmatter {
  name: string;
  description: string;
  version: string;
  author: string | null;
  tags: string[];
}

export interface ParsedSkillMd {
  frontmatter: SkillFrontmatter;
  body: string;
}

export class SkillPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillPackageError';
  }
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineArray(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) {
    return [];
  }
  return inner
    .split(',')
    .map((item) => unquote(item))
    .filter((item) => item.length > 0);
}

/**
 * Split a SKILL.md document into frontmatter + markdown body.
 * Throws SkillPackageError when the structure or required fields are missing.
 */
export function parseFrontmatter(content: string): ParsedSkillMd {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new SkillPackageError('SKILL.md must start with a YAML frontmatter block delimited by ---');
  }

  // find the closing "---" line
  let endIdx = -1;
  let searchFrom = 4;
  for (;;) {
    const idx = normalized.indexOf('\n---', searchFrom);
    if (idx === -1) {
      break;
    }
    const after = normalized.slice(idx + 4);
    if (after.startsWith('\n') || after === '') {
      endIdx = idx;
      break;
    }
    searchFrom = idx + 1;
  }
  if (endIdx === -1) {
    throw new SkillPackageError('SKILL.md frontmatter is missing its closing "---" delimiter');
  }

  const header = normalized.slice(4, endIdx);
  const rawBody = normalized.slice(endIdx + 4).replace(/^\n/, '');

  const values = new Map<string, string | string[]>();
  let currentKey: string | null = null;

  for (const line of header.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    // block list item: "  - value" (belongs to the previous key)
    const listItem = /^-\s+(.*)$/.exec(trimmed);
    if (listItem && currentKey) {
      const existing = values.get(currentKey);
      const list = Array.isArray(existing) ? existing : [];
      list.push(unquote(listItem[1]));
      values.set(currentKey, list);
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new SkillPackageError(`Invalid frontmatter line: "${trimmed}"`);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    currentKey = key;

    if (value.length === 0) {
      values.set(key, []);
    } else if (value.startsWith('[')) {
      values.set(key, parseInlineArray(value));
    } else {
      values.set(key, unquote(value));
    }
  }

  const readString = (key: string): string | null => {
    const value = values.get(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  const name = readString('name');
  const description = readString('description');
  if (!name) {
    throw new SkillPackageError('SKILL.md frontmatter is missing the required field "name"');
  }
  if (!description) {
    throw new SkillPackageError('SKILL.md frontmatter is missing the required field "description"');
  }

  const rawTags = values.get('tags');
  const tags = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === 'string' && rawTags.length > 0
      ? parseInlineArray(rawTags)
      : [];

  return {
    frontmatter: {
      name,
      description,
      version: readString('version') || '1.0.0',
      author: readString('author'),
      tags: tags.filter((tag) => typeof tag === 'string' && tag.length > 0)
    },
    body: rawBody.trim()
  };
}

/**
 * Serialize frontmatter + body back into a SKILL.md document.
 * Used when a skill is created or updated so the on-disk file stays
 * the single source of truth.
 */
export function buildSkillMd(frontmatter: SkillFrontmatter, body: string): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${sanitizeLine(frontmatter.name)}`);
  lines.push(`description: ${sanitizeLine(frontmatter.description)}`);
  if (frontmatter.version) {
    lines.push(`version: ${sanitizeLine(frontmatter.version)}`);
  }
  if (frontmatter.author) {
    lines.push(`author: ${sanitizeLine(frontmatter.author)}`);
  }
  if (frontmatter.tags.length > 0) {
    lines.push(`tags: [${frontmatter.tags.map(sanitizeLine).join(', ')}]`);
  }
  lines.push('---');
  lines.push('');
  return `${lines.join('\n')}\n${body.trim()}\n`;
}

function sanitizeLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
