import { Router } from 'express';
import multer from 'multer';
import sttService from '../services/sttService';
import ttsService from '../services/ttsService';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// Speech to Text
router.post('/stt', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_AUDIO', message: 'No audio file provided' } });
    }

    const text = await sttService.transcribe(req.file.buffer, req.file.mimetype);
    res.json({ success: true, data: { text } });
  } catch (error: any) {
    logger.error('STT failed:', error);
    res.status(500).json({ success: false, error: { code: 'STT_FAILED', message: error.message } });
  }
});

// Text to Speech
router.post('/tts', async (req, res) => {
  try {
    const { text, voice = 'default' } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: { code: 'NO_TEXT', message: 'Text is required' } });
    }

    const audioBuffer = await ttsService.synthesize(text, voice);
    
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', 'attachment; filename="speech.wav"');
    res.send(audioBuffer);
  } catch (error: any) {
    logger.error('TTS failed:', error);
    res.status(500).json({ success: false, error: { code: 'TTS_FAILED', message: error.message } });
  }
});

export default router;
