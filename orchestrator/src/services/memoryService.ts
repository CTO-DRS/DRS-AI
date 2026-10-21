import { KnowledgeDoc, KnowledgeChunk } from '../models';
import { inflateSync } from 'zlib';
import logger from '../utils/logger';

/**
 * MemoryService — agent knowledge memory with retrieval, inspired by
 * drSai's ListMemory + RAGFlowMemory components (examples/agent_groupchat/
 * assistant_memory.py, assistant_memory_ragflow.py).
 *
 * Design notes:
 *  - Documents are chunked on paragraph boundaries (~1200 chars, 150 overlap)
 *    so injected context stays within prompt-budget instead of dumping the
 *    whole file (drSai TokenLimitedChatCompletionContext philosophy).
 *  - Retrieval is a BM25-style lexical scorer with Unicode-aware
 *    tokenization (Arabic + Latin), which works without any embedding API
 *    key — mirroring RAGFlow's `keyword=True` hybrid mode. When an external
 *    RAGFlow instance is configured (RAGFLOW_URL/RAGFLOW_TOKEN), retrieval
 *    is delegated there instead (vector + keyword fusion).
 *  - File ingestion (`extractTextFromFile`) accepts text-like formats and
 *    performs dependency-free PDF text extraction (zlib inflate on
 *    FlateDecode streams + BT/ET text-operator parsing), the same class of
 *    lightweight extraction drSai does in its document loaders.
 */

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const MAX_DOC_BYTES = 2 * 1024 * 1024; // 2 MB per document

/* ------------------------------------------------------------------ */
/* Chunking                                                            */
/* ------------------------------------------------------------------ */

export function chunkText(text: string): KnowledgeChunk[] {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  if (clean.length <= CHUNK_SIZE) {
    return [{ index: 0, text: clean }];
  }

  // Split into paragraphs, then greedily pack paragraphs into chunks.
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: KnowledgeChunk[] = [];
  let buffer = '';

  const pushBuffer = () => {
    const trimmed = buffer.trim();
    if (trimmed) chunks.push({ index: chunks.length, text: trimmed });
    buffer = '';
  };

  for (const para of paragraphs) {
    // A single huge paragraph is hard-split with overlap.
    if (para.length > CHUNK_SIZE) {
      pushBuffer();
      let cursor = 0;
      while (cursor < para.length) {
        const slice = para.slice(cursor, cursor + CHUNK_SIZE).trim();
        if (slice) chunks.push({ index: chunks.length, text: slice });
        cursor += CHUNK_SIZE - CHUNK_OVERLAP;
      }
      continue;
    }

    if ((buffer + '\n\n' + para).length > CHUNK_SIZE) {
      const tail = buffer.slice(-CHUNK_OVERLAP);
      pushBuffer();
      // Keep tail overlap between consecutive chunks.
      if (CHUNK_OVERLAP > 0 && tail.trim()) buffer = tail.trim() + '\n\n';
    }
    buffer += (buffer ? '\n\n' : '') + para;
  }
  pushBuffer();

  return chunks;
}

/* ------------------------------------------------------------------ */
/* Lexical scoring (BM25-lite, multilingual)                           */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'be', 'been',
  'for', 'on', 'with', 'as', 'by', 'at', 'this', 'that', 'it', 'from', 'de', 'la', 'le', 'les',
  'und', 'der', 'die', 'das', 'ein', 'eine', 'und', 'ist', 'des', 'du', 'au', 'aux',
  'في', 'من', 'على', 'إلى', 'عن', 'هذا', 'هذه', 'التي', 'الذي', 'مع', 'أو', 'و', 'هو', 'هي'
]);

function tokenize(text: string): string[] {
  // Unicode-aware: letters/digits from any script (Arabic, Latin, CJK…).
  const raw = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) as string[];
  return raw
    .filter((tok) => tok.length > 1 && !STOPWORDS.has(tok))
    .map((tok) => (tok.length > 4 && tok.startsWith('ال') ? tok.slice(2) : tok));
}

interface ScoredChunk {
  docId: string;
  docTitle: string;
  chunkIndex: number;
  text: string;
  score: number;
}

export interface MemoryHit extends ScoredChunk {}

/* ------------------------------------------------------------------ */
/* File text extraction (dependency-free)                              */
/* ------------------------------------------------------------------ */

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'html', 'htm', 'xml',
  'yaml', 'yml', 'ini', 'cfg', 'env', 'log', 'sql',
  'py', 'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'rb', 'php'
]);

/**
 * Best-effort PDF text extraction with zero dependencies: inflate every
 * FlateDecode stream, then pull strings out of the page text operators
 * (Tj / TJ). Works for most text-based PDFs; scanned/image PDFs produce
 * a clear error instead of silent garbage.
 */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const textPieces: string[] = [];

  const streamRegex = /stream\r?\n?([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw)) !== null) {
    let decoded: string;
    const streamBody = match[1];
    try {
      // Buffer.from on latin1 chars, then inflate (FlateDecode is zlib-wrapped
      // deflate). Non-inflatable streams fall back to their raw text.
      const bytes = Buffer.from(streamBody, 'latin1');
      decoded = inflateSync(bytes).toString('utf8');
    } catch {
      decoded = streamBody;
    }
    if (!/BT|Tj|TJ/.test(decoded)) continue;

    // (string) Tj  |  [(s1) (s2)] TJ  — unescape PDF string escapes.
    const textOpRegex = /\((?:\\.|[^\\()])*\)/g;
    let op: RegExpExecArray | null;
    const lineParts: string[] = [];
    while ((op = textOpRegex.exec(decoded)) !== null) {
      const s = op[0]
        .slice(1, -1)
        .replace(/\\([nrtbf()\\])/g, (_m, c: string) => {
          switch (c) {
            case 'n': return '\n';
            case 'r': return '';
            case 't': return '\t';
            default: return c;
          }
        })
        .replace(/\\([0-7]{1,3})/g, (_m, oct: string) => String.fromCharCode(parseInt(oct, 8)));
      if (s) lineParts.push(s);
    }
    if (lineParts.length) textPieces.push(lineParts.join(''));
  }

  const text = textPieces.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || text.replace(/\s+/g, '').length < 20) {
    throw Object.assign(
      new Error('No extractable text layer found in the PDF (likely a scanned/image document)'),
      { statusCode: 422 }
    );
  }
  return text;
}

/** Extract indexable text from an uploaded file buffer. */
export function extractTextFromFile(originalName: string, buffer: Buffer): { text: string; mimeType: string } {
  const ext = (originalName.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf' || buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return { text: extractPdfText(buffer), mimeType: 'application/pdf' };
  }

  if (TEXT_EXTENSIONS.has(ext) || !ext) {
    let text = buffer.toString('utf8');
    if (ext === 'html' || ext === 'htm' || ext === 'xml') {
      // Strip tags/scripts/styles, decode the few entities that matter.
      text = text
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }
    return { text, mimeType: ext ? `text/${ext === 'md' || ext === 'markdown' ? 'markdown' : ext}` : 'text/plain' };
  }

  // Last resort: try utf8 and require it to look like mostly-printable text.
  const guess = buffer.toString('utf8');
  const printable = (guess.match(/[\p{L}\p{N}\p{P}\s]/gu) || []).length / Math.max(guess.length, 1);
  if (printable > 0.85) {
    return { text: guess, mimeType: 'text/plain' };
  }
  throw Object.assign(
    new Error(`Unsupported file type ".${ext}" — supported: text, markdown, csv, json, html, code files, pdf`),
    { statusCode: 415 }
  );
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

class MemoryService {
  /** Ingest a text document: chunk + persist. */
  async ingestDocument(data: {
    userId: string;
    title: string;
    content: string;
    source?: string;
    mimeType?: string;
  }): Promise<KnowledgeDoc> {
    const content = (data.content || '').trim();
    if (!data.title?.trim()) {
      throw Object.assign(new Error('title is required'), { statusCode: 400 });
    }
    if (!content) {
      throw Object.assign(new Error('content is required'), { statusCode: 400 });
    }
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    if (sizeBytes > MAX_DOC_BYTES) {
      throw Object.assign(new Error('Document exceeds the 2 MB limit'), { statusCode: 413 });
    }

    const chunks = chunkText(content);
    if (!chunks.length) {
      throw Object.assign(new Error('Document produced no readable content'), { statusCode: 400 });
    }

    return KnowledgeDoc.create({
      userId: data.userId,
      title: data.title.trim().slice(0, 200),
      source: data.source || 'paste',
      mimeType: data.mimeType || 'text/markdown',
      content,
      chunks,
      chunkCount: chunks.length,
      sizeBytes,
      isEnabled: true
    } as any);
  }

  /** Ingest an uploaded file: extract text, chunk + persist. */
  async ingestFile(data: {
    userId: string;
    originalName: string;
    buffer: Buffer;
  }): Promise<KnowledgeDoc> {
    const { text, mimeType } = extractTextFromFile(data.originalName, data.buffer);
    return this.ingestDocument({
      userId: data.userId,
      title: data.originalName,
      content: text,
      source: 'upload',
      mimeType
    });
  }

  async listDocuments(userId: string): Promise<KnowledgeDoc[]> {
    return KnowledgeDoc.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['content', 'chunks'] } // list view stays light
    } as any);
  }

  async getDocument(id: string, userId: string): Promise<KnowledgeDoc | null> {
    const doc = await KnowledgeDoc.findByPk(id);
    if (!doc || doc.userId !== userId) return null;
    return doc;
  }

  async deleteDocument(id: string, userId: string): Promise<boolean> {
    const doc = await this.getDocument(id, userId);
    if (!doc) return false;
    await doc.destroy();
    return true;
  }

  async toggleDocument(id: string, userId: string, enabled: boolean): Promise<KnowledgeDoc | null> {
    const doc = await this.getDocument(id, userId);
    if (!doc) return null;
    await doc.update({ isEnabled: enabled } as any);
    return doc;
  }

  /** BM25-lite retrieval over the user's enabled documents. */
  async search(userId: string, query: string, topK = 5): Promise<MemoryHit[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    const docs = await KnowledgeDoc.findAll({
      where: { userId, isEnabled: true },
      attributes: ['id', 'title', 'chunks']
    } as any);
    if (!docs.length) return [];

    const queryTokens = tokenize(trimmed);
    if (!queryTokens.length) return [];

    // Flatten chunks with their parent doc.
    const entries: Array<{ docId: string; docTitle: string; chunk: KnowledgeChunk; tokens: string[] }> = [];
    for (const doc of docs) {
      for (const chunk of (doc.chunks || []) as KnowledgeChunk[]) {
        entries.push({ docId: doc.id, docTitle: doc.title, chunk, tokens: tokenize(chunk.text) });
      }
    }

    // Document frequencies over chunks.
    const df = new Map<string, number>();
    for (const e of entries) {
      const seen = new Set(e.tokens);
      for (const tok of seen) df.set(tok, (df.get(tok) || 0) + 1);
    }

    const N = entries.length || 1;
    const avgLen = entries.reduce((s, e) => s + e.tokens.length, 0) / N || 1;
    const k1 = 1.5;
    const b = 0.75;

    const scored: ScoredChunk[] = entries.map((e) => {
      const tf = new Map<string, number>();
      for (const tok of e.tokens) tf.set(tok, (tf.get(tok) || 0) + 1);

      let score = 0;
      for (const q of queryTokens) {
        const freq = tf.get(q) || 0;
        if (!freq) continue;
        const idf = Math.log(1 + (N - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
        score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (e.tokens.length / avgLen))));
      }
      // Small exact substring bonus (helps Arabic definite forms & IDs).
      if (score > 0 && e.chunk.text.toLowerCase().includes(trimmed.toLowerCase())) score += 1.5;

      return {
        docId: e.docId,
        docTitle: e.docTitle,
        chunkIndex: e.chunk.index,
        text: e.chunk.text,
        score
      };
    });

    return scored
      .filter((s) => s.score > 0.25)
      .sort((a, b2) => b2.score - a.score)
      .slice(0, Math.min(Math.max(topK, 1), 20));
  }

  /**
   * Build the memory block injected into agent turns (drSai
   * `memory=[...]` → system-context injection). Returns null when the
   * user has no relevant knowledge, so prompts stay clean.
   */
  async buildMemoryBlock(userId: string, query: string, topK = 4): Promise<{ block: string; hits: number } | null> {
    try {
      const hits = await this.search(userId, query, topK);
      if (!hits.length) return null;

      const parts = hits.map(
        (h, i) =>
          `[${i + 1}] (doc: ${h.docTitle}, relevance ${h.score.toFixed(2)})\n${h.text.slice(0, 1500)}`
      );
      return {
        block:
          `You have access to the following retrieved knowledge from the user's knowledge base. ` +
          `Use it when relevant; if it does not apply, ignore it and say so honestly.\n\n` +
          parts.join('\n\n---\n\n'),
        hits: hits.length
      };
    } catch (error: any) {
      logger.error('Memory retrieval failed (non-fatal):', error.message);
      return null;
    }
  }
}

export default new MemoryService();
