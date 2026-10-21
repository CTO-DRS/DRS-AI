import axios from 'axios';
import logger from '../utils/logger';

/**
 * WebSearchService — keyless web search for agent runs, inspired by
 * drSai's examples/agent_groupchat/web_search (assistant_deepsearch.py /
 * assistant_deepresearch.py). Uses the DuckDuckGo HTML endpoint, which
 * requires no API key, and gracefully degrades when the network is
 * unavailable so team runs never hard-fail because of search.
 *
 * Set WEB_SEARCH_ENABLED=false to disable the capability entirely.
 */

const DDG_ENDPOINT = process.env.WEB_SEARCH_ENDPOINT || 'https://html.duckduckgo.com/html/';
const DEFAULT_TIMEOUT = 12000;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/* ------------------------------------------------------------------ */
/* HTML helpers                                                        */
/* ------------------------------------------------------------------ */

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 10));
      } catch {
        return '';
      }
    });
}

function stripTags(input: string): string {
  return decodeEntities(input.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** DDG result links are redirects of the form /l/?uddg=<encoded-url>&rut=... */
function resolveDdgLink(href: string): string {
  const match = href.match(/[?&]uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      /* fall through */
    }
  }
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `https://duckduckgo.com${href}`;
  return href;
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

class WebSearchService {
  isEnabled(): boolean {
    return (process.env.WEB_SEARCH_ENABLED || 'true').toLowerCase() !== 'false';
  }

  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const q = (query || '').trim();
    if (!q) return [];
    if (!this.isEnabled()) {
      throw Object.assign(new Error('Web search is disabled'), { statusCode: 403 });
    }

    try {
      const response = await axios.post(
        DDG_ENDPOINT,
        new URLSearchParams({ q, kl: process.env.WEB_SEARCH_REGION || 'wt-wt' }).toString(),
        {
          timeout: DEFAULT_TIMEOUT,
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html'
          },
          maxRedirects: 3
        }
      );

      const html: string = response.data || '';
      const results: WebSearchResult[] = [];

      // Each result block: <div class="result results_links..."> ... </div>
      const blockRe = /<div class="result[s]?[^"]*results_links[^"]*"[^>]*>([\s\S]*?)(?=<div class="result[s]?[^"]*results_links|<div class="nav-link|$)/g;
      const titleRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
      const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/;

      const blocks = html.match(blockRe) || [];
      for (const block of blocks) {
        const titleMatch = block.match(titleRe);
        if (!titleMatch) continue;
        const url = resolveDdgLink(titleMatch[1]);
        const title = stripTags(titleMatch[2]);
        if (!title || !/^https?:\/\//.test(url)) continue;

        const snippetMatch = block.match(snippetRe);
        const snippet = snippetMatch ? stripTags(snippetMatch[1]).slice(0, 400) : '';

        if (!results.some((r) => r.url === url)) {
          results.push({ title, url, snippet });
        }
        if (results.length >= Math.min(Math.max(maxResults, 1), 10)) break;
      }

      logger.info(`Web search "${q.slice(0, 80)}" → ${results.length} results`);
      return results;
    } catch (error: any) {
      logger.error(`Web search failed for "${q.slice(0, 80)}": ${error.message}`);
      // Non-fatal: callers inject an empty context and the run continues.
      return [];
    }
  }

  /** Format results as a context block for an agent prompt. */
  formatResultsBlock(query: string, results: WebSearchResult[]): string | null {
    if (!results.length) return null;
    const lines = results.map(
      (r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`
    );
    return (
      `Web search results for "${query}" (retrieved ${new Date().toISOString()}):\n\n` +
      lines.join('\n\n') +
      `\n\nCite sources as [n] when you use them.`
    );
  }

  /** Search + format in one call; never throws (returns null on failure). */
  async buildContextBlock(query: string, maxResults = 5): Promise<{ block: string; results: number } | null> {
    try {
      const results = await this.search(query, maxResults);
      const block = this.formatResultsBlock(query, results);
      return block ? { block, results: results.length } : null;
    } catch (error: any) {
      logger.error('Web search context build failed (non-fatal):', error.message);
      return null;
    }
  }
}

export default new WebSearchService();
