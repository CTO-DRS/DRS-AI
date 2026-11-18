import { Router, Request, Response } from 'express';
import multer from 'multer';
import { STTService } from '../services/sttService';
import { TTSService } from '../services/ttsService';
import sttService from '../services/sttService';
import ttsService from '../services/ttsService';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// Report which voice capabilities are live so the frontend can pick the
// browser (Web Speech) path or the server (provider) path accordingly.
router.get('/capabilities', (_req, res) => {
  res.json({
    success: true,
    data: {
      serverStt: STTService.isConfigured(),
      serverTts: TTSService.isConfigured(),
      defaultVoice: TTSService.defaultVoice(),
      // Browser Web Speech API is always the keyless default path.
      browserStt: true,
      browserTts: true
    }
  });
});

// Speech to Text (server-side provider; 501 when not configured)
router.post('/stt', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_AUDIO', message: 'No audio file provided' } });
    }

    const language = typeof req.body?.language === 'string' ? req.body.language : undefined;
    const text = await sttService.transcribe(req.file.buffer, req.file.mimetype, language);
    res.json({ success: true, data: { text } });
  } catch (error: any) {
    logger.error('STT failed:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'STT_FAILED', message: error.message }
    });
  }
});

// Text to Speech (server-side provider; 501 when not configured)
router.post('/tts', async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: { code: 'NO_TEXT', message: 'Text is required' } });
    }

    const audioBuffer = await ttsService.synthesize(text, voice);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"');
    res.send(audioBuffer);
  } catch (error: any) {
    logger.error('TTS failed:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: { code: error.code || 'TTS_FAILED', message: error.message }
    });
  }
});

export default router;
