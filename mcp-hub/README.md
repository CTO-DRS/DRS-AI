# DRS AI — MCP Hub

Model Context Protocol (MCP) Hub — ported from OpenDrSai's MCP toolchain.

## What it does

1. **MCP Client** — connects to external MCP servers and aggregates their tools:
   - `stdio` transport: spawns a local MCP server process (e.g. `npx @modelcontextprotocol/server-filesystem /data`)
   - `http` transport: Streamable HTTP transport (POST JSON-RPC 2.0)
2. **MCP Server** — exposes the DRS AI platform tool registry (web_search, calculator, code_execute, memory_search, ...) as a standard MCP server at `POST /mcp`.

Any MCP client (Claude Desktop, Cursor, OpenDrSai, ...) can connect to DRS AI via:

```
POST http://<host>:3044/mcp   (JSON-RPC 2.0: initialize / tools/list / tools/call)
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/servers` | List registered MCP servers + live status |
| POST | `/servers` | Register server: `{name, transport: "stdio"\|"http", command?, args?, url?, env?}` |
| DELETE | `/servers/:name` | Remove server |
| POST | `/servers/:name/connect` | Connect/reconnect now |
| GET | `/servers/:name/status` | Single server status |
| GET | `/tools` | Tools from ALL connected servers |
| POST | `/tools/call` | `{server, tool, args}` — invoke a tool |
| POST | `/mcp` | **MCP server endpoint** (JSON-RPC 2.0) |

## Example: register the official filesystem MCP server

```bash
curl -X POST http://localhost:3044/servers -H 'Content-Type: application/json' -d '{
  "name": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/docs"]
}'

# Then list + call its tools:
curl http://localhost:3044/tools
curl -X POST http://localhost:3044/tools/call -H 'Content-Type: application/json' -d '{
  "server": "filesystem",
  "tool": "read_file",
  "args": {"path": "/home/user/docs/notes.txt"}
}'
```

## Environment

- `PORT` (default 3044)
- `REDIS_URL` — persistence of server registry
- `ORCHESTRATOR_URL` — platform tool registry for the server mode
- `MCP_REQUEST_TIMEOUT_MS` — per-request timeout (default 120000)
