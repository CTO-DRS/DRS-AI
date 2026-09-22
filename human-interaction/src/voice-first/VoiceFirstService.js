/**
 * Voice-First Interface Service
 *
 * Conversational AI with multi-modal output:
 * - Continuous listening with wake word
 * - Natural language understanding
 * - Bilingual responses (Arabic + English)
 * - Audio streaming via WebSocket
 * - Voice activity detection
 *
 * @class VoiceFirstService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class VoiceFirstService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.wsManager = options.wsManager;
    this.redis = null;
    this.isInitialized = false;
    this.activeSessions = new Map();
    this.wakeWords = ['هيا', 'hey drs', 'drs', 'يا درس'];
  }

  async initialize() {
    try {
      logger.info('🎙️ Initializing Voice-First Service...');
      this.redis = await getRedisClient();
      this.isInitialized = true;
      logger.info('✅ Voice-First Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Voice-First:', error);
      throw error;
    }
  }

  /**
   * Start a voice session
   * @param {Object} config - Session config
   * @returns {Object} Session info
   */
  startSession(config) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      userId: config.userId,
      language: config.language || 'auto', // auto, ar, en, ar-en
      voiceProfile: config.voiceProfile || 'neutral',
      wakeWordEnabled: config.wakeWordEnabled !== false,
      continuousListening: config.continuousListening || false,
      status: 'listening',
      createdAt: Date.now(),
    };

    this.activeSessions.set(sessionId, session);

    logger.info(`🎙️ Voice session started: ${sessionId} (${session.language})`);

    return {
      sessionId,
      status: 'listening',
      wakeWords: this.wakeWords,
      supportedLanguages: ['ar', 'en', 'ar-en', 'auto'],
    };
  }

  /**
   * Process audio input
   * @param {string} sessionId - Session ID
   * @param {Buffer} audioData - Audio buffer
   * @param {Object} metadata - Audio metadata
   * @returns {Promise<Object>} Processing result
   */
  async processAudio(sessionId, audioData, metadata) {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error('Voice session not found');

    session.lastActivity = Date.now();

    // Simulate STT processing
    const transcription = await this.transcribeAudio(audioData, session.language);

    // Check for wake word if not yet activated
    if (session.wakeWordEnabled && !session.activated) {
      const detected = this.detectWakeWord(transcription.text);
      if (!detected) {
        return { sessionId, status: 'waiting_for_wake_word', transcription };
      }
      session.activated = true;
    }

    // Process the transcribed text
    const intent = await this.detectIntent(transcription.text);

    const result = {
      sessionId,
      transcription,
      intent,
      language: transcription.detectedLanguage,
      response: {
        text: this.generateResponseText(intent, transcription.text),
        textAr: this.generateResponseTextAr(intent, transcription.text),
        audioUrl: null, // Would be TTS output
      },
      suggestions: this.generateSuggestions(intent),
    };

    // Broadcast via WebSocket
    if (this.wsManager) {
      this.wsManager.sendToUser(session.userId, {
        type: 'voice:response',
        data: result,
      });
    }

    return result;
  }

  async transcribeAudio(audioData, language) {
    // Simulated STT
    return {
      text: 'What do you see around me?',
      textAr: 'ماذا ترى من حولي؟',
      confidence: 0.95,
      detectedLanguage: language === 'auto' ? 'en' : language,
      duration: 2.5,
    };
  }

  detectWakeWord(text) {
    const lower = text.toLowerCase();
    return this.wakeWords.some(ww => lower.includes(ww.toLowerCase()));
  }

  async detectIntent(text) {
    const intents = [
      { name: 'visual_query', keywords: ['see', 'look', 'what is', 'mushāhadah', 'أرى', 'ما هذا'] },
      { name: 'navigation', keywords: ['where', 'go to', 'direction', 'ayn', 'أين', 'الاتجاه'] },
      { name: 'translation', keywords: ['translate', 'meaning', 'tarjamah', 'ترجم', 'معنى'] },
      { name: 'general_query', keywords: ['what', 'how', 'why', 'ما', 'كيف', 'لماذا'] },
      { name: 'command', keywords: ['do', 'start', 'stop', 'record', 'سجل', 'ابدأ'] },
    ];

    const lower = text.toLowerCase();
    for (const intent of intents) {
      if (intent.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        return { name: intent.name, confidence: 0.9 };
      }
    }

    return { name: 'general_query', confidence: 0.6 };
  }

  generateResponseText(intent, originalText) {
    const responses = {
      visual_query: 'I can see a laptop, coffee cup, and notebook on your desk.',
      navigation: 'I\'ll guide you. Turn right and walk 20 meters.',
      translation: 'The translation is ready.',
      general_query: 'I understand your question. Let me think...',
      command: 'Executing your command now.',
    };
    return responses[intent.name] || 'I\'m here to help.';
  }

  generateResponseTextAr(intent, originalText) {
    const responses = {
      visual_query: 'أستطيع رؤية حاسوب محمول وفنجان قهوة ودفتر على مكتبك.',
      navigation: 'سأرشدك. استدر يميناً وامشِ ٢٠ متراً.',
      translation: 'الترجمة جاهزة.',
      general_query: 'أفهم سؤالك. دعني أفكر...',
      command: 'أنفذ أمرك الآن.',
    };
    return responses[intent.name] || 'أنا هنا للمساعدة.';
  }

  generateSuggestions(intent) {
    const suggestions = {
      visual_query: ['Describe details', 'Identify brand', 'Count objects'],
      navigation: ['Show map', 'Find alternatives', 'Save location'],
      translation: ['Translate more', 'Switch languages', 'Save phrase'],
      general_query: ['Tell me more', 'Simplify', 'Related topics'],
      command: ['Undo', 'Change settings', 'History'],
    };
    return suggestions[intent.name] || ['Help', 'Settings', 'Exit'];
  }

  /**
   * Generate TTS audio
   * @param {string} text - Text to speak
   * @param {Object} options - TTS options
   * @returns {Promise<Object>} Audio data
   */
  async textToSpeech(text, options = {}) {
    const ttsId = uuidv4();

    logger.info(`🔊 TTS: ${text.slice(0, 50)}...`);

    // Simulated TTS
    return {
      ttsId,
      text,
      language: options.language || 'ar',
      voice: options.voice || 'neutral',
      gender: options.gender || 'female',
      speed: options.speed || 1.0,
      duration: text.length * 0.08, // Rough estimate
      audioUrl: `/api/v1/voice/audio/${ttsId}`,
    };
  }

  endSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'ended';
      this.activeSessions.delete(sessionId);
    }
    return { sessionId, status: 'ended' };
  }

  getStats() {
    return {
      activeSessions: Array.from(this.activeSessions.values()).filter(s => s.status === 'listening').length,
      wakeWords: this.wakeWords,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Voice-First Service...');
    this.activeSessions.clear();
    if (this.redis) await this.redis.quit();
    logger.info('✅ Voice-First Service shutdown complete');
  }
}

module.exports = VoiceFirstService;
