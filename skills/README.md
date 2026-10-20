# DRS AI — Skills System

SKILL.md-based skills library, ported from OpenDrSai's skills system
(`modules/components/skills/skill_loader.py` + skills marketplace).

## SKILL.md format

```markdown
---
name: "my-skill"
description: "What this skill teaches the agent"
version: "1.0.0"
tags: ["research", "web"]
tools: ["web_search", "http_fetch"]
---

# My Skill

(markdown instructions injected into the agent's system prompt)
```

## How it integrates

- **Agent Teams** (`orchestrator`): pass `skills: ["web-research"]` when creating a
  team — member system prompts are augmented with the enabled skill bodies.
- **Tool recommendations**: the `tools` field names platform tools the skill expects;
  teams with `enableTools: true` expose them automatically.
- **Chat**: skill bodies can be fetched via `GET /skills/:name` and injected into
  any request's system prompt.

## Bundled skills

Seeded automatically on first boot: `web-research`, `code-review`, `doc-writer`, `meeting-notes`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/skills` | All skills (full bodies) |
| GET | `/skills/marketplace` | Lightweight metadata list |
| GET | `/skills/:id` | One skill (id or name) |
| POST | `/skills` | Install: `{content: "<raw SKILL.md>"}` |
| POST | `/skills/:id/enable` \| `/disable` | Toggle |
| DELETE | `/skills/:id` | Remove |

## Environment

- `PORT` (default 3045)
- `REDIS_URL` — skill storage
- `SKILLS_DIR` — SKILL.md file persistence (default `./data/skills`)
