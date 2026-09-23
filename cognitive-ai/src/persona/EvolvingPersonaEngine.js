/**
 * Evolving Persona Engine
 * 
 * Implements meta-learning based user persona evolution with:
 * - Dynamic personality adaptation
 * - User embedding integration
 * - Few-shot learning for rapid adaptation
 * - Personality drift detection and correction
 * 
 * @class EvolvingPersonaEngine
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
// TensorFlow.js is optional — initialize() will gracefully degrade if not installed
let tf = null;
try { tf = require('@tensorflow/tfjs-node'); } catch (e) {
  console.warn('⚠️  @tensorflow/tfjs-node not available — EvolvingPersonaEngine will run in degraded mode:', e.message);
}
const { Matrix } = require('ml-matrix');
const KMeans = require('ml-kmeans');
const natural = require('natural');
const compromise = require('compromise');
const { v4: uuidv4 } = require('uuid');

const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class EvolvingPersonaEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.embeddingService = options.embeddingService;
    this.redis = null;
    
    // Configuration
    this.config = {
      embeddingDimension: options.embeddingDimension || 768,
      personaDimensions: options.personaDimensions || 16,
      adaptationRate: options.adaptationRate || 0.01,
      maxPersonaHistory: options.maxPersonaHistory || 1000,
      driftThreshold: options.driftThreshold || 0.3,
      consolidationInterval: options.consolidationInterval || 3600000, // 1 hour
      ...options,
    };
    
    // Core components
    this.personaModels = new Map();
    this.userProfiles = new Map();
    this.adaptationHistory = new Map();
    this.personaClusters = null;
    
    // Meta-learning model
    this.metaModel = null;
    this.isInitialized = false;
    
    // Background tasks
    this.consolidationTimer = null;
  }

  async initialize() {
    try {
      logger.info('🧬 Initializing Evolving Persona Engine...');

      // Initialize Redis connection
      this.redis = await getRedisClient();

      // Initialize meta-learning model (requires TensorFlow.js)
      if (tf) {
        try {
          await this.initializeMetaModel();
        } catch (modelErr) {
          logger.warn(`⚠️  Meta-model init failed, running without neural adaptation: ${modelErr.message}`);
        }
      } else {
        logger.warn('⚠️  TensorFlow.js not available — running without neural meta-learning');
      }

      // Load existing personas from Redis
      await this.loadPersistedPersonas();

      // Initialize persona clustering
      await this.initializeClustering();

      // Start background consolidation
      this.startConsolidationTask();

      this.isInitialized = true;
      logger.info('✅ Evolving Persona Engine initialized');

    } catch (error) {
      logger.error('❌ Failed to initialize Evolving Persona Engine:', error);
      throw error;
    }
  }

  async initializeMetaModel() {
    // Create meta-learning model for few-shot adaptation
    // Architecture: Input (embedding) -> Dense -> LSTM -> Persona Vector
    
    const input = tf.input({ shape: [this.config.embeddingDimension] });
    
    // Encoder layers
    const dense1 = tf.layers.dense({
      units: 512,
      activation: 'relu',
      name: 'encoder_dense_1',
    }).apply(input);
    
    const dropout1 = tf.layers.dropout({ rate: 0.2 }).apply(dense1);
    
    const dense2 = tf.layers.dense({
      units: 256,
      activation: 'relu',
      name: 'encoder_dense_2',
    }).apply(dropout1);
    
    // Reshape for LSTM
    const reshape = tf.layers.reshape({
      targetShape: [1, 256],
    }).apply(dense2);
    
    // LSTM for temporal patterns
    const lstm = tf.layers.lstm({
      units: 128,
      returnSequences: false,
      name: 'temporal_lstm',
    }).apply(reshape);
    
    // Persona output layers
    const personaDense = tf.layers.dense({
      units: 128,
      activation: 'relu',
      name: 'persona_dense',
    }).apply(lstm);
    
    const dropout2 = tf.layers.dropout({ rate: 0.1 }).apply(personaDense);
    
    // Multi-dimensional persona output
    const personaOutput = tf.layers.dense({
      units: this.config.personaDimensions,
      activation: 'tanh',
      name: 'persona_vector',
    }).apply(dropout2);
    
    this.metaModel = tf.model({
      inputs: input,
      outputs: personaOutput,
    });
    
    // Compile model
    this.metaModel.compile({
      optimizer: tf.train.adam(this.config.adaptationRate),
      loss: 'meanSquaredError',
      metrics: ['mse'],
    });
    
    logger.info('✅ Meta-learning model created');
  }

  async initializeClustering() {
    // Initialize K-means clustering for persona archetypes
    this.personaClusters = {
      kmeans: null,
      archetypes: [
        'analytical',      // Data-driven, logical
        'creative',        // Imaginative, exploratory
        'pragmatic',       // Practical, results-oriented
        'social',          // Collaborative, empathetic
        'strategic',       // Long-term thinking, planning
        'detail-oriented', // Precise, thorough
        'innovative',      // Risk-taking, pioneering
        'traditional',     // Conservative, proven methods
      ],
    };
    
    logger.info('✅ Persona clustering initialized');
  }

  async loadPersistedPersonas() {
    try {
      const keys = await this.redis.keys('persona:*');
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const persona = JSON.parse(data);
          const userId = key.replace('persona:', '');
          this.userProfiles.set(userId, persona);
        }
      }
      
      logger.info(`📊 Loaded ${this.userProfiles.size} persisted personas`);
      
    } catch (error) {
      logger.warn('⚠️ Could not load persisted personas:', error.message);
    }
  }

  /**
   * Create or update user persona based on interaction
   * @param {string} userId - User identifier
   * @param {Object} interaction - Interaction data
   * @returns {Promise<Object>} Updated persona
   */
  async evolvePersona(userId, interaction) {
    if (!this.isInitialized) {
      throw new Error('EvolvingPersonaEngine not initialized');
    }
    
    try {
      // Get or create user profile
      let profile = this.userProfiles.get(userId);
      if (!profile) {
        profile = this.createDefaultProfile(userId);
      }
      
      // Extract features from interaction
      const features = await this.extractInteractionFeatures(interaction);
      
      // Get user embedding
      const userEmbedding = await this.embeddingService.getUserEmbedding(userId);
      
      // Combine interaction features with user embedding
      const combinedInput = this.combineFeatures(features, userEmbedding);
      
      // Predict persona update using meta-model
      const personaUpdate = await this.predictPersonaUpdate(combinedInput);
      
      // Apply update with momentum
      profile.personaVector = this.applyPersonaUpdate(
        profile.personaVector,
        personaUpdate,
        profile.adaptationMomentum
      );
      
      // Update interaction history
      profile.interactionHistory.push({
        timestamp: Date.now(),
        interactionType: interaction.type,
        features: features,
      });
      
      // Trim history if needed
      if (profile.interactionHistory.length > this.config.maxPersonaHistory) {
        profile.interactionHistory = profile.interactionHistory.slice(-this.config.maxPersonaHistory);
      }
      
      // Detect and handle persona drift
      const drift = this.detectPersonaDrift(profile);
      if (drift.isDrifting) {
        await this.handlePersonaDrift(userId, profile, drift);
      }
      
      // Update archetype classification
      profile.archetype = this.classifyArchetype(profile.personaVector);
      
      // Update adaptation momentum
      profile.adaptationMomentum = this.updateMomentum(profile);
      
      // Save updated profile
      this.userProfiles.set(userId, profile);
      await this.persistPersona(userId, profile);
      
      // Emit update event
      this.emit('persona-evolved', {
        userId,
        persona: profile,
        drift: drift.isDrifting,
      });
      
      return profile;
      
    } catch (error) {
      logger.error(`❌ Failed to evolve persona for user ${userId}:`, error);
      throw error;
    }
  }

  createDefaultProfile(userId) {
    return {
      userId,
      personaVector: new Array(this.config.personaDimensions).fill(0),
      archetype: 'neutral',
      interactionHistory: [],
      adaptationMomentum: 0.5,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      version: 1,
      traits: {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5,
      },
      preferences: {
        communicationStyle: 'balanced',
        detailLevel: 'moderate',
        responseSpeed: 'normal',
        creativityLevel: 'balanced',
      },
    };
  }

  async extractInteractionFeatures(interaction) {
    const features = {
      // Linguistic features
      linguistic: await this.extractLinguisticFeatures(interaction.text || ''),
      
      // Behavioral features
      behavioral: {
        responseTime: interaction.responseTime || 0,
        messageLength: interaction.text?.length || 0,
        questionCount: (interaction.text?.match(/\?/g) || []).length,
        exclamationCount: (interaction.text?.match(/!/g) || []).length,
        emojiCount: (interaction.text?.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length,
        codeBlocks: (interaction.text?.match(/```/g) || []).length / 2,
      },
      
      // Contextual features
      contextual: {
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        sessionDuration: interaction.sessionDuration || 0,
        topicCount: interaction.topics?.length || 0,
      },
      
      // Emotional features
      emotional: await this.extractEmotionalFeatures(interaction.text || ''),
    };
    
    return features;
  }

  async extractLinguisticFeatures(text) {
    // Use compromise.js for NLP analysis
    const doc = compromise(text);
    
    return {
      wordCount: doc.wordCount(),
      sentenceCount: doc.sentences().json().length,
      averageWordLength: text.length / (doc.wordCount() || 1),
      uniqueWords: doc.terms().unique().json().length,
      nounCount: doc.nouns().json().length,
      verbCount: doc.verbs().json().length,
      adjectiveCount: doc.adjectives().json().length,
      adverbCount: doc.adverbs().json().length,
      questionWords: doc.questions().json().length,
      pastTenseRatio: doc.verbs().toPastTense().json().length / (doc.verbs().json().length || 1),
      futureTenseRatio: doc.verbs().toFutureTense().json().length / (doc.verbs().json().length || 1),
    };
  }

  async extractEmotionalFeatures(text) {
    // Simple sentiment analysis using natural
    const Analyzer = natural.SentimentAnalyzer;
    const stemmer = natural.PorterStemmer;
    const analyzer = new Analyzer('English', stemmer, 'afinn');
    
    const tokens = text.toLowerCase().split(/\s+/);
    const sentiment = analyzer.getSentiment(tokens);
    
    // Detect emotional intensity
    const intensityWords = ['very', 'extremely', 'incredibly', 'absolutely', 'totally', 'completely'];
    const intensity = tokens.filter(t => intensityWords.includes(t)).length;
    
    return {
      sentiment: sentiment,
      intensity: intensity,
      positiveWords: tokens.filter(t => analyzer.getSentiment([t]) > 0).length,
      negativeWords: tokens.filter(t => analyzer.getSentiment([t]) < 0).length,
    };
  }

  combineFeatures(features, userEmbedding) {
    // Flatten features into a vector
    const featureVector = [
      // Linguistic features
      features.linguistic.wordCount / 100,
      features.linguistic.sentenceCount / 10,
      features.linguistic.averageWordLength / 10,
      features.linguistic.uniqueWords / 50,
      features.linguistic.nounCount / 20,
      features.linguistic.verbCount / 20,
      features.linguistic.adjectiveCount / 10,
      features.linguistic.adverbCount / 10,
      features.linguistic.pastTenseRatio,
      features.linguistic.futureTenseRatio,
      
      // Behavioral features
      features.behavioral.responseTime / 60000, // Normalize to minutes
      features.behavioral.messageLength / 1000,
      features.behavioral.questionCount / 5,
      features.behavioral.exclamationCount / 5,
      features.behavioral.emojiCount / 10,
      features.behavioral.codeBlocks / 3,
      
      // Contextual features
      features.contextual.timeOfDay / 24,
      features.contextual.dayOfWeek / 7,
      features.contextual.sessionDuration / 3600000,
      features.contextual.topicCount / 10,
      
      // Emotional features
      (features.emotional.sentiment + 5) / 10, // Normalize to 0-1
      features.emotional.intensity / 5,
      features.emotional.positiveWords / 10,
      features.emotional.negativeWords / 10,
    ];
    
    // Pad to match embedding dimension
    while (featureVector.length < this.config.embeddingDimension) {
      featureVector.push(0);
    }
    
    // Combine with user embedding (weighted average)
    const combined = featureVector.map((f, i) => {
      const embedding = userEmbedding[i] || 0;
      return f * 0.3 + embedding * 0.7;
    });
    
    return combined.slice(0, this.config.embeddingDimension);
  }

  async predictPersonaUpdate(inputFeatures) {
    const inputTensor = tf.tensor2d([inputFeatures]);
    
    const prediction = this.metaModel.predict(inputTensor);
    const personaUpdate = await prediction.data();
    
    inputTensor.dispose();
    prediction.dispose();
    
    return Array.from(personaUpdate);
  }

  applyPersonaUpdate(currentPersona, update, momentum) {
    // Apply update with momentum-based smoothing
    return currentPersona.map((current, i) => {
      const change = update[i] * this.config.adaptationRate * momentum;
      // Apply tanh to keep values in [-1, 1] range
      return Math.tanh(current + change);
    });
  }

  detectPersonaDrift(profile) {
    if (profile.interactionHistory.length < 10) {
      return { isDrifting: false, magnitude: 0 };
    }
    
    // Calculate recent vs historical persona differences
    const recentInteractions = profile.interactionHistory.slice(-10);
    const historicalInteractions = profile.interactionHistory.slice(0, -10);
    
    // Simple drift detection based on interaction pattern changes
    const recentAvgLength = recentInteractions.reduce(
      (sum, i) => sum + (i.features?.behavioral?.messageLength || 0), 0
    ) / recentInteractions.length;
    
    const historicalAvgLength = historicalInteractions.reduce(
      (sum, i) => sum + (i.features?.behavioral?.messageLength || 0), 0
    ) / historicalInteractions.length;
    
    const driftMagnitude = Math.abs(recentAvgLength - historicalAvgLength) / 
      (historicalAvgLength || 1);
    
    return {
      isDrifting: driftMagnitude > this.config.driftThreshold,
      magnitude: driftMagnitude,
      direction: recentAvgLength > historicalAvgLength ? 'increasing' : 'decreasing',
    };
  }

  async handlePersonaDrift(userId, profile, drift) {
    logger.info(`🌊 Persona drift detected for user ${userId}: ${drift.magnitude.toFixed(3)}`);
    
    // Create drift record
    const driftRecord = {
      timestamp: Date.now(),
      magnitude: drift.magnitude,
      direction: drift.direction,
      previousArchetype: profile.archetype,
    };
    
    // Adjust adaptation momentum based on drift
    if (drift.magnitude > this.config.driftThreshold * 2) {
      // Significant drift - reduce momentum for stability
      profile.adaptationMomentum = Math.max(0.1, profile.adaptationMomentum * 0.8);
    } else {
      // Moderate drift - allow more adaptation
      profile.adaptationMomentum = Math.min(1.0, profile.adaptationMomentum * 1.1);
    }
    
    // Store drift record
    await this.redis.lpush(`drift:${userId}`, JSON.stringify(driftRecord));
    await this.redis.ltrim(`drift:${userId}`, 0, 99);
    
    // Emit drift event
    this.emit('persona-drift', {
      userId,
      drift: driftRecord,
      profile,
    });
  }

  classifyArchetype(personaVector) {
    // Simple classification based on persona vector dimensions
    // In production, this would use trained classifiers
    
    const [analytical, creative, pragmatic, social, strategic, detailOriented, innovative, traditional] = personaVector;
    
    const scores = {
      analytical: analytical || 0,
      creative: creative || 0,
      pragmatic: pragmatic || 0,
      social: social || 0,
      strategic: strategic || 0,
      'detail-oriented': detailOriented || 0,
      innovative: innovative || 0,
      traditional: traditional || 0,
    };
    
    // Find highest scoring archetype
    let maxScore = -Infinity;
    let archetype = 'neutral';
    
    for (const [type, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        archetype = type;
      }
    }
    
    return archetype;
  }

  updateMomentum(profile) {
    // Adjust momentum based on interaction frequency and consistency
    const recentInteractions = profile.interactionHistory.slice(-20);
    
    if (recentInteractions.length < 5) {
      return 0.5; // Default momentum for new users
    }
    
    // Calculate interaction consistency
    const timeGaps = [];
    for (let i = 1; i < recentInteractions.length; i++) {
      const gap = recentInteractions[i].timestamp - recentInteractions[i - 1].timestamp;
      timeGaps.push(gap);
    }
    
    const avgGap = timeGaps.reduce((a, b) => a + b, 0) / timeGaps.length;
    const variance = timeGaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / timeGaps.length;
    const consistency = 1 / (1 + Math.sqrt(variance) / 60000); // Normalize to 0-1
    
    // Higher consistency = higher momentum
    const newMomentum = 0.3 + consistency * 0.7;
    
    return Math.max(0.1, Math.min(1.0, newMomentum));
  }

  async persistPersona(userId, profile) {
    try {
      profile.lastUpdated = Date.now();
      profile.version += 1;
      
      await this.redis.setex(
        `persona:${userId}`,
        86400 * 30, // 30 days TTL
        JSON.stringify(profile)
      );
      
    } catch (error) {
      logger.error(`❌ Failed to persist persona for user ${userId}:`, error);
    }
  }

  /**
   * Get user persona
   * @param {string} userId - User identifier
   * @returns {Object|null} User persona profile
   */
  async getPersona(userId) {
    return this.userProfiles.get(userId) || null;
  }

  /**
   * Get persona-based response adaptation
   * @param {string} userId - User identifier
   * @param {string} baseResponse - Base AI response
   * @returns {Promise<Object>} Adapted response with metadata
   */
  async adaptResponse(userId, baseResponse) {
    const profile = await this.getPersona(userId);
    
    if (!profile) {
      return { response: baseResponse, adaptations: [] };
    }
    
    const adaptations = [];
    let adaptedResponse = baseResponse;
    
    // Adapt based on persona traits
    if (profile.preferences.detailLevel === 'concise') {
      adaptations.push('conciseness');
      // Truncate or summarize if too long
      if (adaptedResponse.length > 500) {
        adaptedResponse = this.summarizeResponse(adaptedResponse);
      }
    } else if (profile.preferences.detailLevel === 'detailed') {
      adaptations.push('detail_enhancement');
      // Could add more context or examples
    }
    
    // Adapt communication style
    if (profile.preferences.communicationStyle === 'formal') {
      adaptations.push('formality');
      adaptedResponse = this.formalizeResponse(adaptedResponse);
    } else if (profile.preferences.communicationStyle === 'casual') {
      adaptations.push('casualness');
      adaptedResponse = this.casualizeResponse(adaptedResponse);
    }
    
    // Adapt creativity level
    if (profile.preferences.creativityLevel === 'high') {
      adaptations.push('creativity_enhancement');
    }
    
    return {
      response: adaptedResponse,
      adaptations,
      persona: profile,
    };
  }

  summarizeResponse(response) {
    // Simple summarization - in production, use proper summarization model
    const sentences = response.split(/[.!?]+/);
    if (sentences.length <= 3) return response;
    
    // Take first and last sentence, plus key points
    const keySentences = [sentences[0], sentences[sentences.length - 2]];
    return keySentences.join('. ') + '...';
  }

  formalizeResponse(response) {
    // Simple formalization rules
    return response
      .replace(/\b(gonna|wanna|gotta)\b/g, (match) => ({
        gonna: 'going to',
        wanna: 'want to',
        gotta: 'have to',
      })[match])
      .replace(/\b(don't|doesn't|didn't|can't|won't)\b/g, (match) => ({
        "don't": 'do not',
        "doesn't": 'does not',
        "didn't": 'did not',
        "can't": 'cannot',
        "won't": 'will not',
      })[match]);
  }

  casualizeResponse(response) {
    // Simple casualization - mostly keeping as-is for now
    return response;
  }

  /**
   * Few-shot learning adaptation
   * @param {string} userId - User identifier
   * @param {Array} examples - Few-shot examples
   * @returns {Promise<Object>} Adapted model parameters
   */
  async fewShotAdapt(userId, examples) {
    logger.info(`🎯 Few-shot adaptation for user ${userId} with ${examples.length} examples`);
    
    const profile = await this.getPersona(userId);
    if (!profile) {
      throw new Error(`No persona found for user ${userId}`);
    }
    
    // Extract patterns from examples
    const patterns = examples.map(ex => ({
      input: ex.input,
      output: ex.output,
      features: this.extractLinguisticFeatures(ex.output),
    }));
    
    // Update persona based on patterns
    const avgFeatures = patterns.reduce((acc, p) => {
      acc.wordCount += p.features.wordCount / patterns.length;
      acc.sentenceCount += p.features.sentenceCount / patterns.length;
      return acc;
    }, { wordCount: 0, sentenceCount: 0 });
    
    // Adjust preferences based on examples
    if (avgFeatures.wordCount > 100) {
      profile.preferences.detailLevel = 'detailed';
    } else if (avgFeatures.wordCount < 30) {
      profile.preferences.detailLevel = 'concise';
    }
    
    // Save updated profile
    await this.persistPersona(userId, profile);
    
    return {
      userId,
      adapted: true,
      patterns: patterns.length,
      updatedPreferences: profile.preferences,
    };
  }

  startConsolidationTask() {
    this.consolidationTimer = setInterval(async () => {
      await this.consolidatePersonas();
    }, this.config.consolidationInterval);
    
    logger.info('🔄 Persona consolidation task started');
  }

  async consolidatePersonas() {
    logger.info('🔄 Consolidating personas...');
    
    try {
      // Cluster similar personas
      const personas = Array.from(this.userProfiles.values());
      
      if (personas.length < 10) {
        logger.info('Not enough personas for clustering');
        return;
      }
      
      const vectors = personas.map(p => p.personaVector);
      const matrix = new Matrix(vectors);
      
      // Perform K-means clustering
      const kmeans = new KMeans(8, { initialization: 'kmeans++' });
      const clusters = kmeans.predict(matrix);
      
      // Update cluster assignments
      personas.forEach((persona, i) => {
        persona.clusterId = clusters[i];
      });
      
      // Store cluster centroids
      await this.redis.set('persona:clusters:centroids', JSON.stringify(kmeans.centroids));
      
      logger.info(`✅ Consolidated ${personas.length} personas into ${kmeans.centroids.length} clusters`);
      
    } catch (error) {
      logger.error('❌ Persona consolidation failed:', error);
    }
  }

  handleRealtimeUpdate(data) {
    // Handle real-time persona updates from WebSocket
    if (data.userId && data.interaction) {
      this.evolvePersona(data.userId, data.interaction).catch(error => {
        logger.error('❌ Real-time persona update failed:', error);
      });
    }
  }

  async shutdown() {
    logger.info('🛑 Shutting down Evolving Persona Engine...');
    
    // Stop consolidation timer
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
    }
    
    // Dispose TensorFlow model
    if (this.metaModel) {
      this.metaModel.dispose();
    }
    
    // Persist all personas
    for (const [userId, profile] of this.userProfiles) {
      await this.persistPersona(userId, profile);
    }
    
    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Evolving Persona Engine shutdown complete');
  }
}

module.exports = EvolvingPersonaEngine;
