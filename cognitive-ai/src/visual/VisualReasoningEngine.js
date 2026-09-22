/**
 * Visual Reasoning Engine
 * 
 * Multi-modal understanding with support for:
 * - Qwen-VL and LLaVA-1.6 models
 * - Image analysis and description
 * - Visual question answering
 * - Flowchart and diagram generation
 * - OCR and text extraction
 * - Object detection and segmentation
 * 
 * @class VisualReasoningEngine
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { getMinioClient } = require('../utils/minio');

class VisualReasoningEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      modelPath: options.modelPath || 'Qwen/Qwen-VL-Chat',
      backupModelPath: options.backupModelPath || 'liuhaotian/llava-v1.6-34b',
      useGPU: options.useGPU !== false,
      maxImageSize: options.maxImageSize || 2048,
      batchSize: options.batchSize || 4,
      cacheTTL: options.cacheTTL || 3600,
      ollamaUrl: options.ollamaUrl || process.env.OLLAMA_URL || 'http://ollama:11434',
      ...options,
    };
    
    // Model state
    this.primaryModel = null;
    this.backupModel = null;
    this.modelType = null; // 'qwen-vl' or 'llava'
    this.isInitialized = false;
    
    // Processing queues
    this.processingQueue = [];
    this.isProcessing = false;
    
    // Clients
    this.redis = null;
    this.minio = null;
    
    // Cache
    this.responseCache = new Map();
    
    // Stats
    this.stats = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      averageProcessingTime: 0,
    };
  }

  async initialize() {
    try {
      logger.info('👁️ Initializing Visual Reasoning Engine...');
      logger.info(`🎯 Primary model: ${this.config.modelPath}`);
      logger.info(`🔄 Backup model: ${this.config.backupModelPath}`);
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Initialize MinIO
      this.minio = await getMinioClient();
      
      // Ensure bucket exists
      await this.ensureBucketExists();
      
      // Load primary model
      await this.loadPrimaryModel();
      
      this.isInitialized = true;
      logger.info('✅ Visual Reasoning Engine initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Visual Reasoning Engine:', error);
      // Try to use backup initialization
      await this.fallbackInitialization();
    }
  }

  async ensureBucketExists() {
    try {
      const bucketName = 'visual-analysis';
      const exists = await this.minio.bucketExists(bucketName);
      if (!exists) {
        await this.minio.makeBucket(bucketName, 'us-east-1');
        logger.info(`✅ Created bucket: ${bucketName}`);
      }
    } catch (error) {
      logger.warn('⚠️ Could not ensure MinIO bucket:', error.message);
    }
  }

  async loadPrimaryModel() {
    try {
      // Detect model type
      if (this.config.modelPath.includes('qwen')) {
        this.modelType = 'qwen-vl';
        await this.loadQwenVL();
      } else if (this.config.modelPath.includes('llava')) {
        this.modelType = 'llava';
        await this.loadLLaVA();
      } else {
        // Default to Ollama-based loading
        await this.loadViaOllama();
      }
      
    } catch (error) {
      logger.error('❌ Failed to load primary model:', error);
      throw error;
    }
  }

  async loadQwenVL() {
    logger.info('📥 Loading Qwen-VL model...');
    
    try {
      // Check if model is available in Ollama
      const response = await axios.get(`${this.config.ollamaUrl}/api/tags`);
      const models = response.data.models || [];
      
      const qwenModel = models.find(m => m.name.includes('qwen') && m.name.includes('vl'));
      
      if (qwenModel) {
        logger.info(`✅ Found Qwen-VL in Ollama: ${qwenModel.name}`);
        this.primaryModel = {
          type: 'ollama',
          modelName: qwenModel.name,
          url: this.config.ollamaUrl,
        };
      } else {
        // Pull the model
        logger.info('📥 Pulling Qwen-VL model from Ollama...');
        await axios.post(`${this.config.ollamaUrl}/api/pull`, {
          name: 'qwen-vl-chat',
          stream: false,
        });
        
        this.primaryModel = {
          type: 'ollama',
          modelName: 'qwen-vl-chat',
          url: this.config.ollamaUrl,
        };
      }
      
    } catch (error) {
      logger.error('❌ Failed to load Qwen-VL:', error.message);
      throw error;
    }
  }

  async loadLLaVA() {
    logger.info('📥 Loading LLaVA-1.6 model...');
    
    try {
      const response = await axios.get(`${this.config.ollamaUrl}/api/tags`);
      const models = response.data.models || [];
      
      const llavaModel = models.find(m => m.name.includes('llava'));
      
      if (llavaModel) {
        logger.info(`✅ Found LLaVA in Ollama: ${llavaModel.name}`);
        this.primaryModel = {
          type: 'ollama',
          modelName: llavaModel.name,
          url: this.config.ollamaUrl,
        };
      } else {
        logger.info('📥 Pulling LLaVA model from Ollama...');
        await axios.post(`${this.config.ollamaUrl}/api/pull`, {
          name: 'llava:34b',
          stream: false,
        });
        
        this.primaryModel = {
          type: 'ollama',
          modelName: 'llava:34b',
          url: this.config.ollamaUrl,
        };
      }
      
    } catch (error) {
      logger.error('❌ Failed to load LLaVA:', error.message);
      throw error;
    }
  }

  async loadViaOllama() {
    logger.info('🔄 Loading model via Ollama...');
    
    try {
      // Try to use any available vision model
      const response = await axios.get(`${this.config.ollamaUrl}/api/tags`);
      const models = response.data.models || [];
      
      // Look for vision-capable models
      const visionModels = models.filter(m => 
        m.name.includes('llava') || 
        m.name.includes('vision') || 
        m.name.includes('vl') ||
        m.name.includes('bakllava')
      );
      
      if (visionModels.length > 0) {
        const selectedModel = visionModels[0];
        logger.info(`✅ Using vision model: ${selectedModel.name}`);
        
        this.primaryModel = {
          type: 'ollama',
          modelName: selectedModel.name,
          url: this.config.ollamaUrl,
        };
      } else {
        throw new Error('No vision models available in Ollama');
      }
      
    } catch (error) {
      logger.error('❌ Ollama loading failed:', error.message);
      throw error;
    }
  }

  async fallbackInitialization() {
    logger.warn('⚠️ Attempting fallback initialization...');
    
    try {
      // Try to use any available model
      await this.loadViaOllama();
      this.isInitialized = true;
      logger.info('✅ Fallback initialization successful');
      
    } catch (error) {
      logger.error('❌ Fallback initialization failed:', error);
      // Mark as partially initialized - will use API fallback
      this.isInitialized = true;
      this.primaryModel = null;
    }
  }

  /**
   * Analyze image with visual reasoning
   * @param {Object} options - Analysis options
   * @param {Buffer|string} options.image - Image buffer or URL
   * @param {string} options.prompt - Analysis prompt/question
   * @param {string} options.userId - User identifier
   * @param {boolean} options.stream - Stream response
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeImage(options) {
    if (!this.isInitialized) {
      throw new Error('VisualReasoningEngine not initialized');
    }
    
    const { image, prompt = 'Describe this image in detail', userId, stream = false } = options;
    
    try {
      const startTime = Date.now();
      
      // Preprocess image
      const processedImage = await this.preprocessImage(image);
      
      // Check cache
      const cacheKey = this.generateCacheKey(processedImage.buffer, prompt);
      const cached = await this.getCachedResponse(cacheKey);
      if (cached && !stream) {
        logger.info('📦 Returning cached visual analysis');
        return { ...cached, cached: true };
      }
      
      // Generate analysis
      let result;
      if (this.primaryModel) {
        result = await this.generateWithOllama(processedImage, prompt, stream);
      } else {
        result = await this.generateWithAPI(processedImage, prompt, stream);
      }
      
      // Store result
      const analysisResult = {
        id: uuidv4(),
        userId,
        prompt,
        analysis: result,
        processingTime: Date.now() - startTime,
        model: this.primaryModel?.modelName || 'api-fallback',
        timestamp: Date.now(),
      };
      
      // Cache result
      await this.cacheResponse(cacheKey, analysisResult);
      
      // Store in MinIO
      await this.storeAnalysis(analysisResult, processedImage);
      
      // Update stats
      this.updateStats(Date.now() - startTime, true);
      
      this.emit('analysis-complete', analysisResult);
      
      return analysisResult;
      
    } catch (error) {
      logger.error('❌ Image analysis failed:', error);
      this.updateStats(0, false);
      throw error;
    }
  }

  async preprocessImage(image) {
    let imageBuffer;
    let source = 'buffer';
    
    // Load image
    if (Buffer.isBuffer(image)) {
      imageBuffer = image;
    } else if (typeof image === 'string') {
      if (image.startsWith('http')) {
        // Download from URL
        const response = await axios.get(image, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(response.data);
        source = 'url';
      } else if (image.startsWith('data:image')) {
        // Base64 data URL
        const base64Data = image.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
        source = 'base64';
      } else {
        // Local file path
        imageBuffer = await fs.readFile(image);
        source = 'file';
      }
    } else {
      throw new Error('Invalid image input');
    }
    
    // Process with Sharp
    const processed = await sharp(imageBuffer)
      .resize(this.config.maxImageSize, this.config.maxImageSize, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    // Get metadata
    const metadata = await sharp(processed).metadata();
    
    return {
      buffer: processed,
      base64: processed.toString('base64'),
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: processed.length,
        source,
      },
    };
  }

  async generateWithOllama(processedImage, prompt, stream = false) {
    try {
      const requestBody = {
        model: this.primaryModel.modelName,
        prompt: prompt,
        images: [processedImage.base64],
        stream: stream,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 2048,
        },
      };
      
      if (stream) {
        // Return stream handler
        return this.createStreamHandler(requestBody);
      }
      
      const response = await axios.post(
        `${this.primaryModel.url}/api/generate`,
        requestBody,
        { timeout: 120000 }
      );
      
      return {
        text: response.data.response,
        done: response.data.done,
        totalDuration: response.data.total_duration,
        loadDuration: response.data.load_duration,
        promptEvalCount: response.data.prompt_eval_count,
        evalCount: response.data.eval_count,
      };
      
    } catch (error) {
      logger.error('❌ Ollama generation failed:', error.message);
      throw error;
    }
  }

  async generateWithAPI(processedImage, prompt, stream = false) {
    // Fallback to external API (OpenAI, Anthropic, etc.)
    // This would be implemented based on available API keys
    
    logger.warn('⚠️ Using API fallback for visual analysis');
    
    // For now, return a placeholder
    return {
      text: 'Visual analysis via external API is not configured. Please set up Ollama with a vision model.',
      fallback: true,
    };
  }

  createStreamHandler(requestBody) {
    const { Readable } = require('stream');
    
    const stream = new Readable({
      read() {},
    });
    
    // Start async generation
    axios.post(
      `${this.primaryModel.url}/api/generate`,
      { ...requestBody, stream: true },
      { responseType: 'stream' }
    ).then(response => {
      response.data.on('data', (chunk) => {
        try {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            const data = JSON.parse(line);
            stream.push(JSON.stringify({
              text: data.response,
              done: data.done,
            }) + '\n');
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      response.data.on('end', () => {
        stream.push(null);
      });
    }).catch(error => {
      stream.destroy(error);
    });
    
    return stream;
  }

  /**
   * Visual Question Answering
   * @param {Object} options - VQA options
   * @param {Buffer|string} options.image - Image
   * @param {string} options.question - Question about the image
   * @returns {Promise<Object>} Answer
   */
  async visualQA(options) {
    const { image, question } = options;
    
    const prompt = `Answer the following question about the image: ${question}`;
    
    return this.analyzeImage({
      image,
      prompt,
      ...options,
    });
  }

  /**
   * Generate flowchart from description
   * @param {Object} options - Flowchart options
   * @param {string} options.description - Process description
   * @param {string} options.type - Flowchart type (mermaid, plantuml, etc.)
   * @returns {Promise<Object>} Generated flowchart
   */
  async generateFlowchart(options) {
    const { description, type = 'mermaid' } = options;
    
    const prompt = `
      Generate a ${type} flowchart diagram for the following process:
      
      ${description}
      
      Provide only the diagram code without any explanation.
    `;
    
    // For flowchart generation, we don't need an image input
    // Use text-only model
    try {
      const response = await axios.post(`${this.config.ollamaUrl}/api/generate`, {
        model: this.primaryModel.modelName,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1500,
        },
      });
      
      return {
        type,
        code: this.extractDiagramCode(response.data.response, type),
        raw: response.data.response,
      };
      
    } catch (error) {
      logger.error('❌ Flowchart generation failed:', error);
      throw error;
    }
  }

  extractDiagramCode(response, type) {
    // Extract code block from response
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);
    
    if (match) {
      return match[1].trim();
    }
    
    // If no code block, return the whole response
    return response.trim();
  }

  /**
   * Extract text from image (OCR)
   * @param {Object} options - OCR options
   * @param {Buffer|string} options.image - Image
   * @param {string} options.language - Text language
   * @returns {Promise<Object>} Extracted text
   */
  async extractText(options) {
    const { image, language = 'auto' } = options;
    
    const prompt = language === 'auto' 
      ? 'Extract all text from this image. Preserve the layout and formatting as much as possible.'
      : `Extract all text from this image. The text is in ${language} language. Preserve the layout and formatting.`;
    
    const result = await this.analyzeImage({
      image,
      prompt,
      ...options,
    });
    
    return {
      ...result,
      extractedText: result.analysis.text,
      language: language === 'auto' ? 'detected' : language,
    };
  }

  /**
   * Detect objects in image
   * @param {Object} options - Detection options
   * @param {Buffer|string} options.image - Image
   * @param {Array} options.classes - Specific classes to detect
   * @returns {Promise<Object>} Detection results
   */
  async detectObjects(options) {
    const { image, classes = [] } = options;
    
    let prompt = 'List all objects visible in this image with their approximate locations.';
    if (classes.length > 0) {
      prompt += ` Focus on: ${classes.join(', ')}.`;
    }
    
    const result = await this.analyzeImage({
      image,
      prompt,
      ...options,
    });
    
    // Parse object list from response
    const objects = this.parseObjectList(result.analysis.text);
    
    return {
      ...result,
      objects,
      objectCount: objects.length,
    };
  }

  parseObjectList(text) {
    // Simple parsing - in production, use structured output
    const lines = text.split('\n').filter(l => l.trim());
    const objects = [];
    
    for (const line of lines) {
      // Look for patterns like "- Object name" or "1. Object name"
      const match = line.match(/^(?:[-*\d.]+\s*)?(.+?)(?:\s*[-:]\s*(.+))?$/);
      if (match) {
        objects.push({
          name: match[1].trim(),
          description: match[2]?.trim() || '',
        });
      }
    }
    
    return objects;
  }

  /**
   * Batch process multiple images
   * @param {Array} images - Array of image options
   * @returns {Promise<Array>} Batch results
   */
  async batchAnalyze(images) {
    logger.info(`🔄 Batch processing ${images.length} images`);
    
    const results = [];
    const batchSize = this.config.batchSize;
    
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      
      const batchPromises = batch.map(img => 
        this.analyzeImage(img).catch(error => ({
          error: error.message,
          image: img.image?.toString()?.slice(0, 50) + '...',
        }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      logger.info(`✅ Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(images.length / batchSize)}`);
    }
    
    return {
      total: images.length,
      successful: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      results,
    };
  }

  generateCacheKey(imageBuffer, prompt) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5');
    hash.update(imageBuffer);
    hash.update(prompt);
    return `visual:${hash.digest('hex')}`;
  }

  async getCachedResponse(key) {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      return null;
    }
  }

  async cacheResponse(key, response) {
    try {
      await this.redis.setex(
        key,
        this.config.cacheTTL,
        JSON.stringify(response)
      );
    } catch (error) {
      logger.warn('⚠️ Failed to cache response:', error.message);
    }
  }

  async storeAnalysis(analysis, processedImage) {
    try {
      const timestamp = Date.now();
      const key = `analysis/${analysis.userId}/${timestamp}-${analysis.id}.json`;
      
      // Store analysis metadata
      await this.minio.putObject(
        'visual-analysis',
        key,
        JSON.stringify(analysis),
        'application/json'
      );
      
      // Store image
      const imageKey = `images/${analysis.userId}/${timestamp}-${analysis.id}.jpg`;
      await this.minio.putObject(
        'visual-analysis',
        imageKey,
        processedImage.buffer,
        'image/jpeg'
      );
      
    } catch (error) {
      logger.warn('⚠️ Failed to store analysis:', error.message);
    }
  }

  updateStats(processingTime, success) {
    this.stats.totalProcessed++;
    
    if (success) {
      this.stats.successful++;
    } else {
      this.stats.failed++;
    }
    
    // Update average processing time
    this.stats.averageProcessingTime = 
      (this.stats.averageProcessingTime * (this.stats.totalProcessed - 1) + processingTime) / 
      this.stats.totalProcessed;
  }

  handleRealtimeAnalysis(data) {
    // Handle real-time analysis requests from WebSocket
    if (data.image && data.prompt) {
      this.analyzeImage(data).catch(error => {
        logger.error('❌ Real-time analysis failed:', error);
      });
    }
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.responseCache.size,
      modelType: this.modelType,
      modelName: this.primaryModel?.modelName,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Visual Reasoning Engine...');
    
    // Clear cache
    this.responseCache.clear();
    
    // Close Redis
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Visual Reasoning Engine shutdown complete');
  }
}

module.exports = VisualReasoningEngine;
