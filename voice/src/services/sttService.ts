import axios from 'axios';
import FormData from 'form-data';
import logger from '../utils/logger';

/**
 * STTService — real speech-to-text via an OpenAI-compatible
 * `/v1/audio/transcriptions` endpoint (Whisper family).
 *
 * Configuration (env):
 *  - STT_BASE_URL   e.g. https://api.openai.com/v1        (required)
 *  - STT_API_KEY    bearer token for the provider          (required)
 *  - STT_MODEL      default: whisper-1
 *  - STT_LANGUAGE   optional ISO-639-1 hint (e.g. "ar")
 *
 * When not configured the service raises a descriptive error so the
 * route can return 501 and the frontend falls back to the browser's
 * Web Speech API (keyless path).
 */

const STT_BASE_URL = process.env.STT_BASE_URL || '';
const STT_API_KEY = process.env.STT_API_KEY || process.env.OPENAI_API_KEY || '';
const STT_MODEL = process.env.STT_MODEL || 'whisper-1';
const STT_LANGUAGE = process.env.STT_LANGUAGE || '';

export class STTService {
  static isConfigured(): boolean {
    return Boolean(STT_BASE_URL && STT_API_KEY);
  }

  async transcribe(audioBuffer: Buffer, format: string = 'wav', language?: string): Promise<string> {
    if (!STTService.isConfigured()) {
      throw Object.assign(
        new Error('STT provider not configured (set STT_BASE_URL and STT_API_KEY); use the browser Web Speech mode instead'),
        { statusCode: 501, code: 'STT_NOT_CONFIGURED' }
      );
    }

    logger.info(`Transcribing audio: ${audioBuffer.length} bytes via ${STT_BASE_URL} (${STT_MODEL})`);

    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: `audio.${(format || 'wav').split('/').pop()}`,
      contentType: format.includes('/') ? format : 'audio/wav'
    });
    form.append('model', STT_MODEL);
    const lang = language || STT_LANGUAGE;
    if (lang) form.append('language', lang);

    try {
      const resp = await axios.post(`${STT_BASE_URL.replace(/\/+$/, '')}/audio/transcriptions`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${STT_API_KEY}`
        },
        timeout: 60000,
        maxBodyLength: Infinity
      });
      const text = resp.data?.text;
      if (typeof text !== 'string') {
        throw new Error('Unexpected STT response shape');
      }
      return text;
    } catch (error: any) {
      const detail = error.response?.data?.error?.message || error.message;
      logger.error('Transcription failed:', detail);
      throw Object.assign(new Error(`Transcription failed: ${detail}`), {
        statusCode: error.response?.status || 500
      });
    }
  }
}

export default new STTService();
