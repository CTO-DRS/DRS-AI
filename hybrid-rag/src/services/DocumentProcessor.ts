/**
 * Document Processor
 * Processes various document types for indexing
 */

import { createLogger } from '../utils/logger';
import { ProcessedDocument, DocumentChunk, ProcessingOptions } from '../models/types';

const logger = createLogger('DocumentProcessor');

export class DocumentProcessor {
  private maxChunkSize: number;
  private chunkOverlap: number;

  constructor() {
    this.maxChunkSize = 1000;
    this.chunkOverlap = 200;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Document Processor...');
    logger.info(`✅ Chunk size: ${this.maxChunkSize}, Overlap: ${this.chunkOverlap}`);
  }

  async processDocument(
    content: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessedDocument> {
    const {
      title,
      source,
      sourceType = 'text',
      metadata = {},
      chunkSize = this.maxChunkSize,
      chunkOverlap = this.chunkOverlap
    } = options;

    const startTime = Date.now();

    // Clean content
    const cleanedContent = this.cleanContent(content);

    // Extract title if not provided
    const extractedTitle = title || this.extractTitle(cleanedContent);

    // Chunk the document
    const chunks = this.chunkDocument(cleanedContent, chunkSize, chunkOverlap);

    // Extract summary
    const summary = this.extractSummary(cleanedContent);

    logger.info(`Processed document in ${Date.now() - startTime}ms, created ${chunks.length} chunks`);

    return {
      title: extractedTitle,
      content: cleanedContent,
      chunks,
      summary,
      metadata: {
        ...metadata,
        source,
        sourceType,
        processedAt: Date.now(),
        wordCount: cleanedContent.split(/\s+/).length,
        charCount: cleanedContent.length,
        chunkCount: chunks.length
      }
    };
  }

  private cleanContent(content: string): string {
    return content
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove null bytes
      .replace(/\x00/g, '')
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove control characters except newlines
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();
  }

  private extractTitle(content: string): string | undefined {
    // Try to find a markdown header
    const headerMatch = content.match(/^#\s+(.+)$/m);
    if (headerMatch) {
      return headerMatch[1].trim();
    }

    // Try first sentence if it's short
    const firstSentence = content.match(/^([^.!?]{10,100})[.!?]/);
    if (firstSentence) {
      return firstSentence[1].trim();
    }

    return undefined;
  }

  private chunkDocument(
    content: string,
    chunkSize: number,
    chunkOverlap: number
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // Split into paragraphs first
    const paragraphs = content.split(/\n\s*\n/);
    
    let currentChunk = '';
    let chunkIndex = 0;
    let charPosition = 0;

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) continue;

      // If adding this paragraph would exceed chunk size, save current chunk
      if (currentChunk.length + trimmedParagraph.length > chunkSize && currentChunk) {
        chunks.push({
          index: chunkIndex++,
          content: currentChunk.trim(),
          charPosition,
          wordCount: currentChunk.split(/\s+/).length
        });

        // Start new chunk with overlap
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.floor(chunkOverlap / 5));
        currentChunk = overlapWords.join(' ') + ' ';
        charPosition += currentChunk.length;
      }

      currentChunk += trimmedParagraph + '\n\n';
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push({
        index: chunkIndex,
        content: currentChunk.trim(),
        charPosition,
        wordCount: currentChunk.split(/\s+/).length
      });
    }

    return chunks;
  }

  private extractSummary(content: string, maxLength: number = 500): string {
    // Get first few sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    
    let summary = '';
    for (const sentence of sentences.slice(0, 3)) {
      if (summary.length + sentence.length > maxLength) break;
      summary += sentence.trim() + ' ';
    }

    return summary.trim() || content.substring(0, maxLength);
  }

  /**
   * Process code files with language-aware chunking
   */
  async processCode(
    content: string,
    language: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessedDocument> {
    const processed = await this.processDocument(content, {
      ...options,
      sourceType: 'code'
    });

    // Add language-specific metadata
    processed.metadata = {
      ...processed.metadata,
      language,
      functionCount: this.countFunctions(content, language),
      classCount: this.countClasses(content, language),
      importCount: this.countImports(content, language)
    };

    return processed;
  }

  private countFunctions(content: string, language: string): number {
    const patterns: Record<string, RegExp> = {
      javascript: /\bfunction\s+\w+|\bconst\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
      python: /\bdef\s+\w+|\blambda\s*:/g,
      java: /\b(?:public|private|protected)?\s*(?:static)?\s*\w+\s+\w+\s*\([^)]*\)\s*\{/g,
      typescript: /\bfunction\s+\w+|\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g
    };

    const pattern = patterns[language] || patterns.javascript;
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  private countClasses(content: string, language: string): number {
    const patterns: Record<string, RegExp> = {
      javascript: /\bclass\s+\w+/g,
      python: /\bclass\s+\w+/g,
      java: /\bclass\s+\w+/g,
      typescript: /\bclass\s+\w+/g
    };

    const pattern = patterns[language] || patterns.javascript;
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  private countImports(content: string, language: string): number {
    const patterns: Record<string, RegExp> = {
      javascript: /\b(?:import|require)\b/g,
      python: /\b(?:import|from)\b/g,
      java: /\bimport\b/g,
      typescript: /\b(?:import|require)\b/g
    };

    const pattern = patterns[language] || patterns.javascript;
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  /**
   * Process markdown documents
   */
  async processMarkdown(
    content: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessedDocument> {
    const processed = await this.processDocument(content, {
      ...options,
      sourceType: 'markdown'
    });

    // Extract markdown-specific metadata
    processed.metadata = {
      ...processed.metadata,
      headingCount: (content.match(/^#{1,6}\s+/gm) || []).length,
      codeBlockCount: (content.match(/```[\s\S]*?```/g) || []).length,
      linkCount: (content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length,
      imageCount: (content.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || []).length
    };

    return processed;
  }

  updateConfig(config: { chunkSize?: number; chunkOverlap?: number }): void {
    if (config.chunkSize) this.maxChunkSize = config.chunkSize;
    if (config.chunkOverlap) this.chunkOverlap = config.chunkOverlap;
    logger.info(`Document processor config updated: chunkSize=${this.maxChunkSize}, chunkOverlap=${this.chunkOverlap}`);
  }
}
