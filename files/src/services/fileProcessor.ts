import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import logger from '../utils/logger';

export class FileProcessor {
  async processPDF(buffer: Buffer): Promise<{ text: string; metadata: any }> {
    try {
      const data = await pdfParse(buffer);
      return {
        text: data.text,
        metadata: {
          pages: data.numpages,
          info: data.info
        }
      };
    } catch (error) {
      logger.error('PDF processing failed:', error);
      throw new Error('Failed to process PDF');
    }
  }

  async processDOCX(buffer: Buffer): Promise<{ text: string; metadata: any }> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return {
        text: result.value,
        metadata: {
          messages: result.messages
        }
      };
    } catch (error) {
      logger.error('DOCX processing failed:', error);
      throw new Error('Failed to process DOCX');
    }
  }

  async processTXT(buffer: Buffer): Promise<{ text: string; metadata: any }> {
    try {
      const text = buffer.toString('utf-8');
      return {
        text,
        metadata: {
          encoding: 'utf-8',
          size: buffer.length
        }
      };
    } catch (error) {
      logger.error('TXT processing failed:', error);
      throw new Error('Failed to process TXT');
    }
  }

  async processCSV(buffer: Buffer): Promise<{ text: string; metadata: any; rows: any[] }> {
    try {
      const text = buffer.toString('utf-8');
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0]?.split(',').map(h => h.trim()) || [];
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, i) => row[h] = values[i] || '');
        return row;
      });

      return {
        text,
        metadata: {
          rows: rows.length,
          columns: headers.length
        },
        rows
      };
    } catch (error) {
      logger.error('CSV processing failed:', error);
      throw new Error('Failed to process CSV');
    }
  }

  async processFile(buffer: Buffer, mimetype: string): Promise<{ text: string; metadata: any; rows?: any[] }> {
    switch (mimetype) {
      case 'application/pdf':
        return this.processPDF(buffer);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.processDOCX(buffer);
      case 'text/plain':
        return this.processTXT(buffer);
      case 'text/csv':
        return this.processCSV(buffer);
      default:
        throw new Error(`Unsupported file type: ${mimetype}`);
    }
  }

  chunkText(text: string, chunkSize: number = 1000, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start = end - overlap;
      if (start >= end) start = end;
    }

    return chunks;
  }
}

export default new FileProcessor();
