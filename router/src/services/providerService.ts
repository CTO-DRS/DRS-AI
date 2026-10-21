/**
 * ProviderService — multi-provider LLM routing (drSai provider_presets).
 *
 * Adds OpenAI-compatible / Anthropic-compatible remote providers as a
 * fallback chain behind Ollama, so the platform can serve models that
 * are not pulled locally:
 *
 *   routing order for POST /chat:
 *     1. explicit "provider/model" syntax  (e.g. "openai/gpt-4o-mini")
 *     2. Ollama (if the model exists locally)
 *     3. remote providers (enabled, priority order) that list the model
 *
 * Built-in presets (drSai parity): openai, anthropic, deepseek,
 * openrouter, gemini (OpenAI-compatible endpoint), groq, custom.
 * Registry is persisted in Redis hash "drs:providers".
 */

import Redis from 'ioredis';
import logger from '../utils/logger';

const PROVIDERS_KEY = 'drs:providers';

export type WireApi = 'openai' | 'anthropic';

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  wireApi: WireApi;
  models: string[];       // cached model ids (provider-native naming)
  enabled: boolean;
  priority: number;       // lower = tried first
  lastTestedAt?: string;
  lastTestOk?: boolean;
}

export const PROVIDER_PRESETS: Record<string, { baseUrl: string; wireApi: WireApi; label: string }> = {
  openai:     { baseUrl: 'https://api.openai.com/v1', wireApi: 'openai', label: 'OpenAI' },
  anthropic:  { baseUrl: 'https://api.anthropic.com/v1', wireApi: 'anthropic', label: 'Anthropic' },
  deepseek:   { baseUrl: 'https://api.deepseek.com/v1', wireApi: 'openai', label: 'DeepSeek' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', wireApi: 'openai', label: 'OpenRouter' },
  gemini:     { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', wireApi: 'openai', label: 'Google Gemini (OpenAI-compatible)' },
  groq:       { baseUrl: 'https://api.groq.com/openai/v1', wireApi: 'openai', label: 'Groq' },
  custom:     { baseUrl: '', wireApi: 'openai', label: 'Custom OpenAI-compatible' }
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderChatResult {
  content: string;
  model: string;
  provider: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

class ProviderService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 2
    });
    this.redis.on('error', (err) => logger.error('ProviderService Redis error:', err.message));
  }

  /* ------------------------- Registry ------------------------- */

  async list(): Promise<Provider[]> {
    const raw = await this.redis.hgetall(PROVIDERS_KEY);
    return Object.values(raw)
      .map((v) => JSON.parse(v) as Provider)
      .sort((a, b) => a.priority - b.priority);
  }

  async get(id: string): Promise<Provider | null> {
    const raw = await this.redis.hget(PROVIDERS_KEY, id);
    return raw ? (JSON.parse(raw) as Provider) : null;
  }

  async save(data: {
    id: string;
    name?: string;
    baseUrl?: string;
    apiKey: string;
    wireApi?: WireApi;
    priority?: number;
    enabled?: boolean;
  }): Promise<Provider> {
    const preset = PROVIDER_PRESETS[data.id];
    if (!preset && !data.baseUrl) {
      throw Object.assign(new Error('baseUrl is required for custom providers'), { statusCode: 400 });
    }

    const provider: Provider = {
      id: data.id,
      name: data.name || preset?.label || data.id,
      baseUrl: (data.baseUrl || preset?.baseUrl || '').replace(/\/$/, ''),
      apiKey: data.apiKey,
      wireApi: data.wireApi || preset?.wireApi || 'openai',
      models: [],
      enabled: data.enabled ?? true,
      priority: data.priority ?? 50
    };

    await this.redis.hset(PROVIDERS_KEY, provider.id, JSON.stringify(provider));
    return provider;
  }

  async remove(id: string): Promise<boolean> {
    const removed = await this.redis.hdel(PROVIDERS_KEY, id);
    return removed > 0;
  }

  async toggle(id: string, enabled: boolean): Promise<Provider | null> {
    const provider = await this.get(id);
    if (!provider) return null;
    provider.enabled = enabled;
    await this.redis.hset(PROVIDERS_KEY, id, JSON.stringify(provider));
    return provider;
  }

  getPresets(): Array<{ id: string; label: string; baseUrl: string; wireApi: WireApi }> {
    return Object.entries(PROVIDER_PRESETS).map(([id, p]) => ({
      id,
      label: p.label,
      baseUrl: p.baseUrl,
      wireApi: p.wireApi
    }));
  }

  /* --------------------------- Probe --------------------------- */

  async test(id: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
    const provider = await this.get(id);
    if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 404 });

    try {
      const models = await this.fetchModels(provider);
      provider.models = models;
      provider.lastTestedAt = new Date().toISOString();
      provider.lastTestOk = true;
      await this.redis.hset(PROVIDERS_KEY, id, JSON.stringify(provider));
      return { ok: true, models };
    } catch (error: any) {
      provider.lastTestedAt = new Date().toISOString();
      provider.lastTestOk = false;
      await this.redis.hset(PROVIDERS_KEY, id, JSON.stringify(provider));
      return { ok: false, models: [], error: error.message };
    }
  }

  private async fetchModels(provider: Provider): Promise<string[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (provider.wireApi === 'anthropic') {
        headers['x-api-key'] = provider.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }

      const response = await fetch(`${provider.baseUrl}/models`, { headers, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: any = await response.json();
      const list = body?.data || body?.models || [];
      return list
        .map((m: any) => m.id || m.name || '')
        .filter(Boolean)
        .slice(0, 200);
    } finally {
      clearTimeout(timer);
    }
  }

  /* --------------------------- Chat --------------------------- */

  /**
   * Send a chat completion to a specific provider (non-streaming).
   * Normalizes both wire APIs into a single result shape.
   */
  async chat(provider: Provider, model: string, messages: ChatMessage[], options: {
    temperature?: number;
    maxTokens?: number;
  } = {}): Promise<ProviderChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300000);

    try {
      let url: string;
      let body: Record<string, any>;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (provider.wireApi === 'anthropic') {
        url = `${provider.baseUrl}/messages`;
        headers['x-api-key'] = provider.apiKey;
        headers['anthropic-version'] = '2023-06-01';
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
        body = {
          model,
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
          system: system || undefined,
          messages: messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content }))
        };
      } else {
        url = `${provider.baseUrl}/chat/completions`;
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
        body = {
          model,
          messages,
          stream: false,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`${provider.id} HTTP ${response.status}: ${text.slice(0, 300)}`);
      }

      const data: any = await response.json();

      if (provider.wireApi === 'anthropic') {
        const content = (data?.content || []).map((c: any) => c?.text || '').join('');
        return {
          content,
          model,
          provider: provider.id,
          usage: {
            promptTokens: data?.usage?.input_tokens,
            completionTokens: data?.usage?.output_tokens
          }
        };
      }

      return {
        content: data?.choices?.[0]?.message?.content || '',
        model,
        provider: provider.id,
        usage: {
          promptTokens: data?.usage?.prompt_tokens,
          completionTokens: data?.usage?.completion_tokens
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Resolve which provider should serve a model.
   * Returns null when no provider can serve it (caller falls back to Ollama).
   */
  async resolveProviderForModel(model: string): Promise<{ provider: Provider; model: string } | null> {
    // 1. Explicit "provider/model" syntax
    const slashIdx = model.indexOf('/');
    if (slashIdx > 0) {
      const maybeId = model.slice(0, slashIdx);
      const rest = model.slice(slashIdx + 1);
      const provider = await this.get(maybeId);
      if (provider && provider.enabled) {
        return { provider, model: rest };
      }
    }

    // 2. Any enabled provider whose cached model list contains the model
    const providers = (await this.list()).filter((p) => p.enabled && p.models.length > 0);
    for (const provider of providers) {
      if (provider.models.includes(model)) {
        return { provider, model };
      }
    }
    return null;
  }
}

export default new ProviderService();
