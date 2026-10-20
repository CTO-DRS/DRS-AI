import logger from '../utils/logger';

/**
 * Tool registry with function-calling support.
 * Ported from OpenDrSai's tool/workbench architecture (DrSaiStaticWorkbench):
 *  - tools are declared with JSON-schema parameters
 *  - an executor runs tool calls and returns structured results
 *  - custom tools can be registered at runtime and persisted in Redis
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ToolEntry {
  name: string;
  description: string;
  parameters: Record<string, any>;
  source: 'builtin' | 'custom' | 'mcp';
  /** For custom webhook tools */
  webhookUrl?: string;
  /** For mcp-sourced tools */
  mcpServer?: string;
  createdAt?: string;
}

export interface ToolResult {
  name: string;
  ok: boolean;
  result?: any;
  error?: string;
}

const REDIS_CUSTOM_TOOLS = 'drs:tools:custom';

// ---------------------------------------------------------------------------
// Built-in tools
// ---------------------------------------------------------------------------

async function webSearch(args: { query: string; max_results?: number }): Promise<any> {
  const maxResults = args.max_results ?? 5;
  const tavilyKey = process.env.TAVILY_API_KEY;
  const searxngUrl = process.env.SEARXNG_URL;

  if (tavilyKey) {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: tavilyKey, query: args.query, max_results: maxResults })
    });
    const json: any = await res.json();
    return (json.results || []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content }));
  }

  if (searxngUrl) {
    const res = await fetch(`${searxngUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(args.query)}&format=json`);
    const json: any = await res.json();
    return (json.results || []).slice(0, maxResults).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content }));
  }

  // Keyless fallback: DuckDuckGo HTML + Instant Answer API
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DRS-AI/1.0)' }, signal: AbortSignal.timeout(15000) }
    );
    const html = await res.text();
    const results: any[] = [];
    const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null && results.length < maxResults) {
      results.push({
        title: m[2].replace(/<[^>]+>/g, '').trim(),
        url: m[1],
        snippet: m[3].replace(/<[^>]+>/g, '').trim()
      });
    }
    if (results.length) return results;

    const ia = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json`);
    const iaJson: any = await ia.json();
    const topics = (iaJson.RelatedTopics || []).filter((t: any) => t.FirstURL).slice(0, maxResults);
    const out = topics.map((t: any) => ({ title: t.Text, url: t.FirstURL, snippet: t.Text }));
    if (iaJson.AbstractText) {
      out.unshift({ title: iaJson.Heading || args.query, url: iaJson.AbstractURL, snippet: iaJson.AbstractText });
    }
    return out;
  } catch (e: any) {
    throw new Error(`web_search failed (offline?): ${e.message}`);
  }
}

async function httpFetch(args: { url: string; method?: string }): Promise<any> {
  const res = await fetch(args.url, {
    method: args.method || 'GET',
    headers: { 'User-Agent': 'DRS-AI/1.0', Accept: 'text/html,application/json,text/plain' },
    signal: AbortSignal.timeout(20000)
  });
  const text = await res.text();
  return { status: res.status, contentType: res.headers.get('content-type'), body: text.slice(0, 8000) };
}

function calculator(args: { expression: string }): any {
  const expr = args.expression;
  if (/[^0-9+\-*/().,%^\s a-zA-Z]/.test(expr)) {
    throw new Error('Invalid characters in expression');
  }
  const sanitized = expr
    .replace(/\^/g, '**')
    .replace(/\b(sqrt|pow|abs|round|floor|ceil|min|max|log|sin|cos|tan)\b/g, 'Math.$1')
    .replace(/\bPI\b/g, 'Math.PI')
    .replace(/\bE\b/g, 'Math.E');
  const fn = new Function(`return (${sanitized});`);
  const value = fn();
  if (typeof value !== 'number' || !isFinite(value)) throw new Error('Expression did not evaluate to a finite number');
  return { expression: args.expression, value };
}

function currentDatetime(_args: any): any {
  const now = new Date();
  return { iso: now.toISOString(), utc: now.toUTCString(), epochMs: now.getTime() };
}

async function memorySearch(args: { query: string; limit?: number }, userId?: string): Promise<any> {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3004';
  const res = await fetch(`${memoryUrl}/memories/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || 'system' },
    body: JSON.stringify({ query: args.query, limit: args.limit ?? 5 }),
    signal: AbortSignal.timeout(15000)
  });
  const json: any = await res.json();
  return json?.data?.memories || [];
}

async function codeExecute(args: { code: string }): Promise<any> {
  const interpreterUrl = process.env.CODE_INTERPRETER_URL || 'http://localhost:3014';
  const res = await fetch(`${interpreterUrl}/python`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: args.code }),
    signal: AbortSignal.timeout(60000)
  });
  const json: any = await res.json();
  return json?.data ?? json;
}

const BUILTIN_TOOLS: Record<string, { description: string; parameters: Record<string, any>; handler: (args: any, userId?: string) => Promise<any> }> = {
  web_search: {
    description: 'Search the web for current information. Returns a list of results with title, url and snippet.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        max_results: { type: 'number', description: 'Maximum number of results (default 5)' }
      },
      required: ['query']
    },
    handler: webSearch
  },
  http_fetch: {
    description: 'Fetch content from a URL and return the response body (truncated to 8000 chars).',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method (default GET)' }
      },
      required: ['url']
    },
    handler: httpFetch
  },
  calculator: {
    description: 'Evaluate an arithmetic/math expression safely (e.g. "2*(3+4)/7", "sqrt(16)+PI").',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'The math expression to evaluate' }
      },
      required: ['expression']
    },
    handler: calculator
  },
  current_datetime: {
    description: 'Get the current date and time.',
    parameters: { type: 'object', properties: {} },
    handler: currentDatetime
  },
  memory_search: {
    description: 'Search the user stored memories for relevant context.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        limit: { type: 'number', description: 'Max memories to return (default 5)' }
      },
      required: ['query']
    },
    handler: memorySearch
  },
  code_execute: {
    description: 'Execute Python code in a sandboxed interpreter and return stdout/stderr/result.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python source code to execute' }
      },
      required: ['code']
    },
    handler: codeExecute
  }
};

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

export class ToolRegistry {
  async listTools(): Promise<ToolEntry[]> {
    const builtin: ToolEntry[] = Object.entries(BUILTIN_TOOLS).map(([name, t]) => ({
      name,
      description: t.description,
      parameters: t.parameters,
      source: 'builtin'
    }));

    let custom: ToolEntry[] = [];
    try {
      const { default: redis } = await import('../utils/redis');
      const raw = await redis.get(REDIS_CUSTOM_TOOLS);
      if (raw) custom = JSON.parse(raw);
    } catch (e: any) {
      logger.warn('Failed to load custom tools from Redis:', e.message);
    }

    return [...builtin, ...custom];
  }

  async toOpenAITools(names?: string[]): Promise<ToolDefinition[]> {
    const tools = await this.listTools();
    const selected = names?.length ? tools.filter(t => names.includes(t.name)) : tools;
    return selected.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));
  }

  async registerCustomTool(entry: { name: string; description: string; parameters: Record<string, any>; webhookUrl: string }): Promise<ToolEntry> {
    if (BUILTIN_TOOLS[entry.name]) {
      throw new Error(`Cannot override built-in tool: ${entry.name}`);
    }
    const tool: ToolEntry = {
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
      source: 'custom',
      webhookUrl: entry.webhookUrl,
      createdAt: new Date().toISOString()
    };
    const { default: redis } = await import('../utils/redis');
    const raw = await redis.get(REDIS_CUSTOM_TOOLS);
    const list: ToolEntry[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(t => t.name === entry.name);
    if (idx >= 0) list[idx] = tool;
    else list.push(tool);
    await redis.set(REDIS_CUSTOM_TOOLS, JSON.stringify(list));
    return tool;
  }

  async unregisterTool(name: string): Promise<boolean> {
    const { default: redis } = await import('../utils/redis');
    const raw = await redis.get(REDIS_CUSTOM_TOOLS);
    const list: ToolEntry[] = raw ? JSON.parse(raw) : [];
    const next = list.filter(t => t.name !== name);
    if (next.length === list.length) return false;
    await redis.set(REDIS_CUSTOM_TOOLS, JSON.stringify(next));
    return true;
  }

  async execute(name: string, args: any, userId?: string): Promise<ToolResult> {
    try {
      if (BUILTIN_TOOLS[name]) {
        const result = await BUILTIN_TOOLS[name].handler(args, userId);
        return { name, ok: true, result };
      }

      // custom webhook tool
      let custom: ToolEntry | undefined;
      try {
        const { default: redis } = await import('../utils/redis');
        const raw = await redis.get(REDIS_CUSTOM_TOOLS);
        const list: ToolEntry[] = raw ? JSON.parse(raw) : [];
        custom = list.find(t => t.name === name);
      } catch (e: any) {
        logger.warn(`Custom tool lookup failed (redis down?): ${e.message}`);
      }
      if (custom?.webhookUrl) {
        const res = await fetch(custom.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, args, userId }),
          signal: AbortSignal.timeout(60000)
        });
        const json: any = await res.json().catch(() => ({}));
        return { name, ok: true, result: json };
      }

      return { name, ok: false, error: `Unknown tool: ${name}` };
    } catch (e: any) {
      logger.error(`Tool ${name} execution failed:`, e);
      return { name, ok: false, error: e.message };
    }
  }
}

export const toolRegistry = new ToolRegistry();
