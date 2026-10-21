import axios from 'axios';
import logger from '../utils/logger';

/**
 * TTSService — real text-to-speech via an OpenAI-compatible
 * `/v1/audio/speech` endpoint (tts-1 family).
 *
 * Configuration (env):
 *  - TTS_BASE_URL   e.g. https://api.openai.com/v1        (required)
 *  - TTS_API_KEY    bearer token for the provider          (required)
 *  - TTS_MODEL      default: tts-1
 *  - TTS_VOICE      default: alloy
 *  - TTS_FORMAT     default: mp3 (mp3 | opus | aac | flac | wav | pcm)
 *
 * When not configured the service raises a descriptive error so the
 * route can return 501 and the frontend falls back to the browser's
 * speechSynthesis API (keyless path).
 */

const TTS_BASE_URL = process.env.TTS_BASE_URL || '';
const TTS_API_KEY = process.env.TTS_API_KEY || process.env.OPENAI_API_KEY || '';
const TTS_MODEL = process.env.TTS_MODEL || 'tts-1';
const TTS_VOICE = process.env.TTS_VOICE || 'alloy';
const TTS_FORMAT = process.env.TTS_FORMAT || 'mp3';

export class TTSService {
  static isConfigured(): boolean {
    return Boolean(TTS_BASE_URL && TTS_API_KEY);
  }

  static defaultVoice(): string {
    return TTS_VOICE;
  }

  async synthesize(text: string, voice?: string): Promise<Buffer> {
    if (!TTSService.isConfigured()) {
      throw Object.assign(
        new Error('TTS provider not configured (set TTS_BASE_URL and TTS_API_KEY); use the browser speechSynthesis mode instead'),
        { statusCode: 501, code: 'TTS_NOT_CONFIGURED' }
      );
    }

    const trimmed = (text || '').trim().slice(0, 4096); // API cap
    logger.info(`Synthesizing ${trimmed.length} chars via ${TTS_BASE_URL} (${TTS_MODEL}/${voice || TTS_VOICE})`);

    try {
      const resp = await axios.post(
        `${TTS_BASE_URL.replace(/\/+$/, '')}/audio/speech`,
        {
          model: TTS_MODEL,
          voice: voice || TTS_VOICE,
          input: trimmed,
          response_format: TTS_FORMAT
        },
        {
          headers: { Authorization: `Bearer ${TTS_API_KEY}` },
          timeout: 120000,
          responseType: 'arraybuffer'
        }
      );
      return Buffer.from(resp.data);
    } catch (error: any) {
      const detail = error.response?.data?.error?.message || error.message;
      logger.error('Synthesis failed:', detail);
      throw Object.assign(new Error(`Synthesis failed: ${detail}`), {
        statusCode: error.response?.status || 500
      });
    }
  }
}

export default new TTSService();
