import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import logger from '../utils/logger';
import {
  Skill,
  SkillMeta,
  validateSkillContent,
  persistSkill,
  readPersistedSkill,
  deletePersistedSkill,
  ensureSkillsDir
} from './loader';

const REDIS_KEY = 'drs:skills';
const REDIS_BUNDLED_KEY = 'drs:skills:bundled-seeded';

const BUNDLED_SKILLS: Array<{ content: string }> = [
  {
    content: `---
name: "web-research"
description: "Systematic web research: search, cross-check sources, and produce a cited summary"
version: "1.0.0"
tags: ["research", "web"]
tools: ["web_search", "http_fetch"]
---

# Web Research Skill

When this skill is active, follow this methodology:

1. **Decompose** the research question into 2-4 concrete sub-queries.
2. **Search** each sub-query with the \`web_search\` tool (max_results: 5).
3. **Fetch** the 2-3 most promising URLs with \`http_fetch\` to read full content.
4. **Cross-check** claims across at least 2 independent sources before stating them as facts.
5. **Summarize** with citations: use [1], [2] markers mapping to the URLs you used.
6. **Flag uncertainty**: if sources conflict, say so explicitly instead of picking a side.

Output format: a short answer first, then "Sources:" list, then "Confidence:" with a 1-5 score.`
  },
  {
    content: `---
name: "code-review"
description: "Structured code review checklist: correctness, security, performance, style"
version: "1.0.0"
tags: ["code", "quality"]
tools: []
---

# Code Review Skill

Review provided code using this checklist, in order:

1. **Correctness** — logic errors, edge cases, off-by-one, null handling.
2. **Security** — injection, XSS, secrets in code, unsafe deserialization, missing authz.
3. **Error handling** — unhandled promise rejections, missing try/catch around I/O.
4. **Performance** — N+1 queries, unbounded loops, missing indexes, memory leaks.
5. **Readability** — naming, dead code, duplication, missing types.

Output format:
- Verdict: APPROVE / REQUEST_CHANGES
- Findings table: severity (critical/major/minor), file:line, description, suggested fix
- One paragraph summary.`
  },
  {
    content: `---
name: "doc-writer"
description: "Write clear technical documentation with structure, examples and diagrams-as-text"
version: "1.0.0"
tags: ["docs", "writing"]
tools: []
---

# Documentation Writer Skill

When writing documentation:

1. Start with a one-paragraph **overview** answering: what, why, who.
2. Use a **Quick Start** section with copy-pasteable commands.
3. Every API gets: purpose, signature, parameters table, return value, and one realistic example.
4. Prefer **ascii diagrams** for architecture explanations.
5. End with a **Troubleshooting** section listing the 3-5 most likely errors and fixes.
6. Keep sentences short. Second person. Present tense.`
  },
  {
    content: `---
name: "meeting-notes"
description: "Turn raw meeting transcripts into structured notes with decisions and action items"
version: "1.0.0"
tags: ["productivity"]
tools: []
---

# Meeting Notes Skill

Transform a raw transcript into:

## Summary
(3-5 sentences)

## Decisions
- [Decision] — (who, rationale)

## Action Items
- [ ] Task — owner — deadline

## Open Questions
- Question — who needs to answer

Rules: never invent decisions that were not explicitly stated; mark unclear audio as [inaudible]; keep the original speaker attributions.`
  }
];

export class SkillsStore {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
    this.redis.on('error', (err) => logger.error('Skills Redis error:', err.message));
  }

  private async connect(): Promise<void> {
    await this.redis.connect().catch(() => { /* already connected */ });
  }

  async seedBundledSkills(): Promise<void> {
    await this.connect();
    await ensureSkillsDir();
    const seeded = await this.redis.get(REDIS_BUNDLED_KEY);
    if (seeded === '1') return;
    for (const skill of BUNDLED_SKILLS) {
      try {
        await this.install(skill.content, 'bundled');
      } catch (e: any) {
        logger.warn(`Failed to seed bundled skill: ${e.message}`);
      }
    }
    await this.redis.set(REDIS_BUNDLED_KEY, '1');
    logger.info('Bundled skills seeded');
  }

  async list(): Promise<Skill[]> {
    await this.connect();
    const raw = await this.redis.get(REDIS_KEY);
    const skills: Skill[] = raw ? JSON.parse(raw) : [];
    return skills.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
  }

  async get(idOrName: string): Promise<Skill | null> {
    const skills = await this.list();
    return skills.find(s => s.id === idOrName || s.meta.name === idOrName) || null;
  }

  async install(content: string, source: 'bundled' | 'installed' = 'installed'): Promise<Skill> {
    const validation = validateSkillContent(content);
    if (!validation.ok) throw new Error(validation.error);
    const meta: SkillMeta = validation.meta!;

    const skills = await this.list();
    const existing = skills.find(s => s.meta.name === meta.name);
    const now = new Date().toISOString();

    let skill: Skill;
    if (existing) {
      skill = { ...existing, meta, body: content, updatedAt: now };
    } else {
      skill = {
        id: uuidv4(),
        meta,
        body: content,
        enabled: true,
        source,
        installedAt: now,
        updatedAt: now
      };
      skills.push(skill);
    }

    await this.redis.set(REDIS_KEY, JSON.stringify(skills));
    await persistSkill(skill.id, content);
    logger.info(`Skill installed: ${meta.name} (v${meta.version})`);
    return skill;
  }

  async setEnabled(idOrName: string, enabled: boolean): Promise<Skill | null> {
    const skills = await this.list();
    const idx = skills.findIndex(s => s.id === idOrName || s.meta.name === idOrName);
    if (idx < 0) return null;
    skills[idx] = { ...skills[idx], enabled, updatedAt: new Date().toISOString() };
    await this.connect();
    await this.redis.set(REDIS_KEY, JSON.stringify(skills));
    return skills[idx];
  }

  async remove(idOrName: string): Promise<boolean> {
    const skills = await this.list();
    const skill = skills.find(s => s.id === idOrName || s.meta.name === idOrName);
    if (!skill) return false;
    const next = skills.filter(s => s.id !== skill.id);
    await this.connect();
    await this.redis.set(REDIS_KEY, JSON.stringify(next));
    await deletePersistedSkill(skill.id);
    return true;
  }

  async rehydrateFromFile(id: string): Promise<Skill | null> {
    const content = await readPersistedSkill(id);
    if (!content) return null;
    return this.install(content, 'installed');
  }
}

export const skillsStore = new SkillsStore();
