/**
 * User Embedding Service
 * 
 * Deep user behavior embedding and clustering:
 * - Multi-dimensional user embeddings
 * - Behavioral pattern extraction
 * - User clustering and segmentation
 * - Similarity search
 * 
 * @class UserEmbeddingService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
// TensorFlow.js is optional — service degrades gracefully without it
let tf = null;
try { tf = require('@tensorflow/tfjs-node'); } catch (e) {
  console.warn('⚠️  @tensorflow/tfjs-node not available — degraded mode:', e.message);
}
const { pipeline } = require('@xenova/transformers');
const { Matrix } = require('ml-matrix');
const KMeans = require('ml-kmeans');
const { v4: uuidv4 } = require('uuid');

const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { getQdrantClient } = require('../utils/qdrant');

class UserEmbeddingService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      embeddingDimension: options.embeddingDimension || 768,
      modelName: options.modelName || 'Xenova/all-MiniLM-L6-v2',
      maxSequenceLength: options.maxSequenceLength || 512,
      batchSize: options.batchSize || 32,
      similarityThreshold: options.similarityThreshold || 0.7,
      ...options,
    };
    
    // Embedding model
    this.embedder = null;
    
    // User embeddings cache
    this.userEmbeddings = new Map();
    this.behavioralEmbeddings = new Map();
    
    // User clusters
    this.userClusters = null;
    this.clusterCentroids = null;
    
    // Clients
    this.redis = null;
    this.qdrant = null;
    
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('📊 Initializing User Embedding Service...');
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Initialize Qdrant for vector search
      this.qdrant = await getQdrantClient();
      await this.initializeQdrantCollection();
      
      // Load embedding model
      await this.loadEmbeddingModel();
      
      // Load cached embeddings
      await this.loadCachedEmbeddings();
      
      // Initialize clustering
      await this.initializeClustering();
      
      this.isInitialized = true;
      logger.info('✅ User Embedding Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize User Embedding Service:', error);
      throw error;
    }
  }

  async loadEmbeddingModel() {
    logger.info(`📥 Loading embedding model: ${this.config.modelName}`);
    
    try {
      this.embedder = await pipeline(
        'feature-extraction',
        this.config.modelName,
        {
          quantized: true,
          revision: 'main',
        }
      );
      
      logger.info('✅ Embedding model loaded');
      
    } catch (error) {
      logger.error('❌ Failed to load embedding model:', error);
      throw error;
    }
  }

  async initializeQdrantCollection() {
    try {
      const collectionName = 'user-embeddings';
      
      // Check if collection exists
      const collections = await this.qdrant.getCollections();
      const exists = collections.collections.some(c => c.name === collectionName);
      
      if (!exists) {
        // Create collection
        await this.qdrant.createCollection(collectionName, {
          vectors: {
            size: this.config.embeddingDimension,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });
        
        logger.info(`✅ Created Qdrant collection: ${collectionName}`);
      }
      
    } catch (error) {
      logger.warn('⚠️ Could not initialize Qdrant:', error.message);
    }
  }

  async loadCachedEmbeddings() {
    try {
      const keys = await this.redis.keys('user-embedding:*');
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const embedding = JSON.parse(data);
          const userId = key.replace('user-embedding:', '');
          this.userEmbeddings.set(userId, embedding);
        }
      }
      
      logger.info(`📊 Loaded ${this.userEmbeddings.size} cached embeddings`);
      
    } catch (error) {
      logger.warn('⚠️ Could not load cached embeddings:', error.message);
    }
  }

  async initializeClustering() {
    // Initialize with empty clusters
    this.userClusters = {
      kmeans: null,
      labels: new Map(),
      lastUpdated: null,
    };
    
    logger.info('✅ Clustering initialized');
  }

  /**
   * Generate text embedding
   * @param {string} text - Text to embed
   * @returns {Promise<Array>} Embedding vector
   */
  async embedText(text) {
    if (!this.embedder) {
      throw new Error('Embedding model not loaded');
    }
    
    try {
      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true,
      });
      
      return Array.from(output.data);
      
    } catch (error) {
      logger.error('❌ Text embedding failed:', error);
      throw error;
    }
  }

  /**
   * Get or create user embedding
   * @param {string} userId - User identifier
   * @returns {Promise<Array>} User embedding
   */
  async getUserEmbedding(userId) {
    // Check cache
    if (this.userEmbeddings.has(userId)) {
      return this.userEmbeddings.get(userId);
    }
    
    // Try to load from Redis
    try {
      const cached = await this.redis.get(`user-embedding:${userId}`);
      if (cached) {
        const embedding = JSON.parse(cached);
        this.userEmbeddings.set(userId, embedding);
        return embedding;
      }
    } catch (error) {
      logger.warn('⚠️ Could not load user embedding from Redis');
    }
    
    // Return zero embedding if not found
    return new Array(this.config.embeddingDimension).fill(0);
  }

  /**
   * Update user embedding based on interaction
   * @param {string} userId - User identifier
   * @param {Object} interaction - Interaction data
   * @returns {Promise<Array>} Updated embedding
   */
  async updateUserEmbedding(userId, interaction) {
    try {
      // Generate embedding for interaction
      const interactionText = this.extractInteractionText(interaction);
      const interactionEmbedding = await this.embedText(interactionText);
      
      // Get current embedding
      const currentEmbedding = await this.getUserEmbedding(userId);
      
      // Update with exponential moving average
      const alpha = 0.1; // Update rate
      const updatedEmbedding = currentEmbedding.map((current, i) => {
        return current * (1 - alpha) + interactionEmbedding[i] * alpha;
      });
      
      // Store updated embedding
      this.userEmbeddings.set(userId, updatedEmbedding);
      await this.persistEmbedding(userId, updatedEmbedding);
      
      // Update behavioral embedding
      await this.updateBehavioralEmbedding(userId, interaction);
      
      // Update in Qdrant
      await this.updateQdrantEmbedding(userId, updatedEmbedding);
      
      this.emit('embedding-updated', { userId, embedding: updatedEmbedding });
      
      return updatedEmbedding;
      
    } catch (error) {
      logger.error(`❌ Failed to update embedding for user ${userId}:`, error);
      throw error;
    }
  }

  extractInteractionText(interaction) {
    const parts = [];
    
    if (interaction.text) {
      parts.push(interaction.text);
    }
    
    if (interaction.intent) {
      parts.push(`Intent: ${interaction.intent}`);
    }
    
    if (interaction.topics?.length) {
      parts.push(`Topics: ${interaction.topics.join(', ')}`);
    }
    
    if (interaction.sentiment) {
      parts.push(`Sentiment: ${interaction.sentiment}`);
    }
    
    return parts.join(' | ');
  }

  async updateBehavioralEmbedding(userId, interaction) {
    // Extract behavioral features
    const behavioralFeatures = this.extractBehavioralFeatures(interaction);
    
    // Get or create behavioral embedding
    let behavioralEmbedding = this.behavioralEmbeddings.get(userId);
    if (!behavioralEmbedding) {
      behavioralEmbedding = new Array(64).fill(0);
    }
    
    // Update with new features
    const alpha = 0.05;
    const updatedBehavioral = behavioralEmbedding.map((current, i) => {
      const feature = behavioralFeatures[i] || 0;
      return current * (1 - alpha) + feature * alpha;
    });
    
    this.behavioralEmbeddings.set(userId, updatedBehavioral);
    
    // Persist
    await this.redis.setex(
      `behavioral-embedding:${userId}`,
      86400 * 30,
      JSON.stringify(updatedBehavioral)
    );
  }

  extractBehavioralFeatures(interaction) {
    const features = new Array(64).fill(0);
    
    // Time-based features
    const hour = new Date().getHours();
    features[0] = hour / 24;
    features[1] = new Date().getDay() / 7;
    
    // Interaction features
    features[2] = Math.min(interaction.text?.length || 0, 1000) / 1000;
    features[3] = (interaction.text?.split(/\s+/).length || 0) / 100;
    features[4] = (interaction.text?.match(/\?/g) || []).length / 5;
    features[5] = (interaction.text?.match(/!/g) || []).length / 5;
    
    // Response time (if available)
    if (interaction.responseTime) {
      features[6] = Math.min(interaction.responseTime, 60000) / 60000;
    }
    
    // Topic diversity
    if (interaction.topics) {
      features[7] = Math.min(interaction.topics.length, 10) / 10;
    }
    
    return features;
  }

  async persistEmbedding(userId, embedding) {
    try {
      await this.redis.setex(
        `user-embedding:${userId}`,
        86400 * 30, // 30 days
        JSON.stringify(embedding)
      );
    } catch (error) {
      logger.error(`❌ Failed to persist embedding for user ${userId}:`, error);
    }
  }

  async updateQdrantEmbedding(userId, embedding) {
    try {
      await this.qdrant.upsert('user-embeddings', {
        points: [{
          id: userId,
          vector: embedding,
          payload: {
            userId,
            updatedAt: Date.now(),
          },
        }],
      });
    } catch (error) {
      logger.warn('⚠️ Could not update Qdrant embedding:', error.message);
    }
  }

  /**
   * Find similar users
   * @param {string} userId - Reference user
   * @param {number} k - Number of similar users
   * @returns {Promise<Array>} Similar users
   */
  async findSimilarUsers(userId, k = 10) {
    const embedding = await this.getUserEmbedding(userId);
    
    try {
      // Search in Qdrant
      const results = await this.qdrant.search('user-embeddings', {
        vector: embedding,
        limit: k + 1, // +1 to exclude self
        with_payload: true,
      });
      
      return results
        .filter(r => r.payload.userId !== userId)
        .map(r => ({
          userId: r.payload.userId,
          similarity: r.score,
        }));
        
    } catch (error) {
      // Fallback to in-memory search
      return this.findSimilarUsersInMemory(userId, embedding, k);
    }
  }

  findSimilarUsersInMemory(userId, embedding, k) {
    const similarities = [];
    
    for (const [otherId, otherEmbedding] of this.userEmbeddings) {
      if (otherId === userId) continue;
      
      const similarity = this.cosineSimilarity(embedding, otherEmbedding);
      similarities.push({ userId: otherId, similarity });
    }
    
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, k);
  }

  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }

  /**
   * Perform user clustering
   * @param {number} k - Number of clusters
   * @returns {Promise<Object>} Clustering result
   */
  async clusterUsers(k = 8) {
    logger.info(`🔍 Clustering users into ${k} clusters...`);
    
    const users = Array.from(this.userEmbeddings.entries());
    
    if (users.length < k) {
      logger.warn('Not enough users for clustering');
      return null;
    }
    
    const vectors = users.map(([_, embedding]) => embedding);
    const matrix = new Matrix(vectors);
    
    // Perform K-means clustering
    const kmeans = new KMeans(k, { initialization: 'kmeans++' });
    const clusters = kmeans.predict(matrix);
    
    // Assign cluster labels
    const clusterLabels = new Map();
    const clusterMembers = new Map();
    
    users.forEach(([userId, _], i) => {
      const clusterId = clusters[i];
      clusterLabels.set(userId, clusterId);
      
      if (!clusterMembers.has(clusterId)) {
        clusterMembers.set(clusterId, []);
      }
      clusterMembers.get(clusterId).push(userId);
    });
    
    // Store clustering results
    this.userClusters = {
      kmeans,
      labels: clusterLabels,
      centroids: kmeans.centroids,
      members: clusterMembers,
      lastUpdated: Date.now(),
    };
    
    // Persist
    await this.redis.setex(
      'user-clusters',
      86400,
      JSON.stringify({
        labels: Array.from(clusterLabels.entries()),
        centroids: kmeans.centroids,
        lastUpdated: Date.now(),
      })
    );
    
    logger.info(`✅ Clustered ${users.length} users into ${k} clusters`);
    
    return {
      clusterCount: k,
      userCount: users.length,
      clusters: Array.from(clusterMembers.entries()).map(([id, members]) => ({
        id,
        size: members.length,
        members: members.slice(0, 10), // First 10 members
      })),
    };
  }

  /**
   * Get user cluster
   * @param {string} userId - User identifier
   * @returns {number|null} Cluster ID
   */
  getUserCluster(userId) {
    return this.userClusters?.labels?.get(userId) || null;
  }

  /**
   * Get cluster members
   * @param {number} clusterId - Cluster identifier
   * @returns {Array} Cluster members
   */
  getClusterMembers(clusterId) {
    return this.userClusters?.members?.get(clusterId) || [];
  }

  /**
   * Batch embed texts
   * @param {Array<string>} texts - Texts to embed
   * @returns {Promise<Array>} Embeddings
   */
  async batchEmbed(texts) {
    const embeddings = [];
    
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      
      const batchPromises = batch.map(text => this.embedText(text));
      const batchEmbeddings = await Promise.all(batchPromises);
      
      embeddings.push(...batchEmbeddings);
    }
    
    return embeddings;
  }

  getStats() {
    return {
      cachedEmbeddings: this.userEmbeddings.size,
      behavioralEmbeddings: this.behavioralEmbeddings.size,
      clusters: this.userClusters ? Object.keys(this.userClusters.members || {}).length : 0,
      lastClusterUpdate: this.userClusters?.lastUpdated,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down User Embedding Service...');
    
    // Clear caches
    this.userEmbeddings.clear();
    this.behavioralEmbeddings.clear();
    
    // Close connections
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ User Embedding Service shutdown complete');
  }
}

module.exports = UserEmbeddingService;
