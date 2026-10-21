# DRS AI Skills Service

Skill-package registry for the DRS AI platform (port **3044**), implementing the
**SKILL.md** convention (Anthropic-style agent skills, as popularized by the
drsai Skills Square).

A skill is a directory containing a `SKILL.md` file with YAML frontmatter plus
optional extra files (`scripts/`, `references/`, ...):

```markdown
---
name: web-search-pro
description: Performs structured web research and returns cited summaries
version: 1.0.0
author: someone
tags: [search, web]
---

You are a research assistant. When given a topic, ...
```

- `name` and `description` are **required**; `name` must match
  `/^[a-z0-9][a-z0-9-_]{1,63}$/` and becomes the skill id.
- `version` (default `1.0.0`), `author`, `tags` are optional.
- The markdown body below the frontmatter is the skill instructions/prompt that
  the orchestrator injects into agent prompts.

## Storage

- Skill packages on disk under `SKILLS_DIR` (env, default `/app/data/skills`,
  falls back to `./data/skills` in local dev; created automatically).
- Metadata index in Redis hash `drs:skills:index` (`skillId -> JSON metadata`),
  missing entries are rebuilt from disk at boot.
- Usage stats in `drs:skill:<id>` (`downloads`, `invocations`, `shares`).
- Share tokens in `drs:skill:share:<token>` (7-day TTL by default, 1–30 days).

## API

| Method | Path                | Auth              | Description |
| ------ | ------------------- | ----------------- | ----------- |
| POST   | `/upload`           | user              | Upload a skill. Multipart field `file` (`.tar.gz`/`.tgz`/`.zip`) **or** field `files` = JSON `[{ path, content }]`. Returns metadata. |
| GET    | `/`                 | public            | List skills. Query: `?tag=`, `?q=`, `?mine=true` (requires `x-user-id`). |
| GET    | `/:id`              | public            | Skill detail: metadata + markdown body + file list. |
| PUT    | `/:id`              | owner/admin       | Update `{ description?, tags?, body? }` — rewrites `SKILL.md`. |
| DELETE | `/:id`              | owner/admin       | Delete the skill (index entry, stats, files). |
| GET    | `/:id/download`     | public            | Stream the skill folder as `.tar.gz` (increments `downloads`). |
| GET    | `/:id/context`      | public            | `{ name, description, body }` — what the orchestrator injects into agent prompts. |
| POST   | `/:id/invoke`       | public            | Increment `invocations` and return the context (agent "uses" a skill). |
| GET    | `/:id/stats`        | public            | `{ downloads, invocations, shares }`. |
| POST   | `/:id/share`        | user              | Create a share token (`{ expiresInDays }`, default 7, max 30) → `{ shareToken, url }`. |
| GET    | `/shared/:token`    | public            | Resolve a share token → full skill detail. |
| GET    | `/tags/list`        | public            | Distinct tags across all skills. |
| GET    | `/health`           | public            | Health check. |

All responses use the platform envelope `{ success: true, data }` /
`{ success: false, error: { code, message } }`.

## Auth

The service trusts the gateway: authenticated requests carry `x-user-id` and
`x-user-role` headers injected by the gateway. Owner/admin checks apply to
`PUT`/`DELETE`. For local development set `NODE_ENV != production` and
`DEV_AUTH_BYPASS=true` to skip the `x-user-id` requirement (requests are then
treated as `dev-user` with the `admin` role).

## Environment

| Variable                   | Default                | Description |
| -------------------------- | ---------------------- | ----------- |
| `PORT`                     | `3044`                 | HTTP port |
| `REDIS_URL`                | `redis://localhost:6379` | Redis connection (also `REDIS_HOST`/`REDIS_PORT`) |
| `SKILLS_DIR`               | `/app/data/skills`     | Skill package storage (volume mount point) |
| `SKILLS_MAX_FILES`         | `200`                  | Max files per package |
| `SKILLS_MAX_TOTAL_BYTES`   | `20971520` (20MB)      | Max total package size |
| `SKILLS_MAX_FILE_BYTES`    | `5242880` (5MB)        | Max single-file size |
| `SKILLS_PUBLIC_URL`        | request origin         | Base URL used in share links |
| `SKILLS_PUBLIC_PATH`       | `/api/skills`          | Gateway path prefix used in share links |
| `DEV_AUTH_BYPASS`          | unset                  | Dev-only auth bypass (see above) |

## Development

```bash
npm install
npm run dev          # ts-node-dev, SKILLS_DIR falls back to ./data/skills
npm run build && npm start
npm run smoke        # e2e smoke test (boots the service against an in-process fake Redis)
```

### Examples

Upload from an inline file tree:

```bash
curl -X POST http://localhost:3044/upload \
  -H 'content-type: application/json' \
  -H 'x-user-id: u1' \
  -d '{"files":[{"path":"SKILL.md","content":"---\nname: web-search-pro\ndescription: Web research\n---\nDo research."}]}'
```

Upload an archive and fetch the prompt context:

```bash
curl -X POST http://localhost:3044/upload -H 'x-user-id: u1' -F file=@web-search-pro.zip
curl http://localhost:3044/web-search-pro/context
curl -OJ http://localhost:3044/web-search-pro/download   # .tar.gz
```
