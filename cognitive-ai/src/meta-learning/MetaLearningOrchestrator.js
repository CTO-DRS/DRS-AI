/**
 * Meta-Learning Orchestrator
 * 
 * Implements few-shot learning and rapid adaptation:
 * - MAML (Model-Agnostic Meta-Learning) style adaptation
 * - Task-specific fine-tuning
 * - Gradient-based meta-updates
 * - Fast adaptation to new domains
 * 
 * @class MetaLearningOrchestrator
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const tf = require('@tensorflow/tfjs-node');
const { Matrix } = require('ml-matrix');
const { v4: uuidv4 } = require('uuid');

const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class MetaLearningOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      innerLearningRate: options.innerLearningRate || 0.01,
      metaLearningRate: options.metaLearningRate || 0.001,
      innerSteps: options.innerSteps || 5,
      metaBatchSize: options.metaBatchSize || 4,
      adaptationSteps: options.adaptationSteps || 10,
      embeddingDimension: options.embeddingDimension || 768,
      taskMemorySize: options.taskMemorySize || 100,
      ...options,
    };
    
    // External services
    this.personaEngine = options.personaEngine;
    this.embeddingService = options.embeddingService;
    
    // Meta-learning model
    this.metaModel = null;
    this.taskModels = new Map();
    
    // Task memory
    this.taskMemory = new Map();
    this.taskEmbeddings = new Map();
    
    // Redis client
    this.redis = null;
    
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('🎯 Initializing Meta-Learning Orchestrator...');
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Initialize meta-learning model
      await this.initializeMetaModel();
      
      // Load saved task models
      await this.loadTaskModels();
      
      this.isInitialized = true;
      logger.info('✅ Meta-Learning Orchestrator initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Meta-Learning Orchestrator:', error);
      throw error;
    }
  }

  async initializeMetaModel() {
    // Create MAML-style meta-learning model
    // This model learns how to learn - it finds good initial parameters
    // that can be quickly adapted to new tasks
    
    const input = tf.input({ shape: [this.config.embeddingDimension] });
    
    // Shared feature extractor
    const shared1 = tf.layers.dense({
      units: 512,
      activation: 'relu',
      kernelInitializer: 'glorotUniform',
      name: 'shared_dense_1',
    }).apply(input);
    
    const shared2 = tf.layers.dense({
      units: 256,
      activation: 'relu',
      kernelInitializer: 'glorotUniform',
      name: 'shared_dense_2',
    }).apply(shared1);
    
    // Task-specific adaptation layers
    const adaptation = tf.layers.dense({
      units: 128,
      activation: 'relu',
      kernelInitializer: 'glorotUniform',
      name: 'adaptation_layer',
    }).apply(shared2);
    
    // Output layer
    const output = tf.layers.dense({
      units: this.config.embeddingDimension,
      activation: 'linear',
      name: 'output_layer',
    }).apply(adaptation);
    
    this.metaModel = tf.model({
      inputs: input,
      outputs: output,
    });
    
    // Compile with meta-learning rate
    this.metaModel.compile({
      optimizer: tf.train.adam(this.config.metaLearningRate),
      loss: 'meanSquaredError',
      metrics: ['mse'],
    });
    
    logger.info('✅ Meta-learning model created');
  }

  async loadTaskModels() {
    try {
      const keys = await this.redis.keys('task-model:*');
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const taskData = JSON.parse(data);
          this.taskMemory.set(taskData.taskId, taskData);
        }
      }
      
      logger.info(`📊 Loaded ${this.taskMemory.size} task models`);
      
    } catch (error) {
      logger.warn('⚠️ Could not load task models:', error.message);
    }
  }

  /**
   * Register a new task for meta-learning
   * @param {Object} task - Task definition
   * @param {string} task.taskId - Unique task identifier
   * @param {string} task.name - Task name
   * @param {string} task.type - Task type (classification, generation, etc.)
   * @param {Array} task.examples - Training examples
   * @returns {Promise<Object>} Registered task
   */
  async registerTask(task) {
    const { taskId, name, type, examples = [] } = task;
    
    logger.info(`📝 Registering task: ${name} (${taskId})`);
    
    // Create task embedding from examples
    const taskEmbedding = await this.createTaskEmbedding(examples);
    
    // Store task
    const taskData = {
      taskId,
      name,
      type,
      examples: examples.slice(0, this.config.taskMemorySize),
      embedding: taskEmbedding,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      adaptationCount: 0,
      performance: {
        initial: null,
        current: null,
        history: [],
      },
    };
    
    this.taskMemory.set(taskId, taskData);
    this.taskEmbeddings.set(taskId, taskEmbedding);
    
    // Persist task
    await this.persistTask(taskId, taskData);
    
    this.emit('task-registered', taskData);
    
    return taskData;
  }

  async createTaskEmbedding(examples) {
    if (examples.length === 0) {
      return new Array(this.config.embeddingDimension).fill(0);
    }
    
    // Generate embeddings for examples
    const embeddings = [];
    for (const example of examples.slice(0, 10)) {
      const embedding = await this.embeddingService.embedText(
        `${example.input} ${example.output}`
      );
      embeddings.push(embedding);
    }
    
    // Average embeddings
    const avgEmbedding = embeddings[0].map((_, i) => {
      const sum = embeddings.reduce((acc, e) => acc + e[i], 0);
      return sum / embeddings.length;
    });
    
    return avgEmbedding;
  }

  /**
   * Perform few-shot adaptation for a task
   * @param {string} taskId - Task identifier
   * @param {Array} supportSet - Support examples for adaptation
   * @returns {Promise<Object>} Adaptation result
   */
  async fewShotAdapt(taskId, supportSet) {
    if (!this.isInitialized) {
      throw new Error('MetaLearningOrchestrator not initialized');
    }
    
    logger.info(`🎯 Few-shot adaptation for task ${taskId} with ${supportSet.length} examples`);
    
    const task = this.taskMemory.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    try {
      const startTime = Date.now();
      
      // Create task-specific model
      const taskModel = await this.createTaskModel(taskId);
      
      // Prepare training data
      const { inputs, targets } = await this.prepareTrainingData(supportSet);
      
      // Perform inner loop adaptation (MAML)
      const adaptedWeights = await this.innerLoopAdaptation(
        taskModel,
        inputs,
        targets
      );
      
      // Store adapted model
      this.taskModels.set(taskId, {
        weights: adaptedWeights,
        adaptedAt: Date.now(),
        supportSetSize: supportSet.length,
      });
      
      // Update task statistics
      task.adaptationCount++;
      task.updatedAt = Date.now();
      await this.persistTask(taskId, task);
      
      const adaptationTime = Date.now() - startTime;
      
      const result = {
        taskId,
        adapted: true,
        adaptationTime,
        supportSetSize: supportSet.length,
        innerSteps: this.config.innerSteps,
      };
      
      this.emit('adaptation-complete', result);
      
      return result;
      
    } catch (error) {
      logger.error(`❌ Few-shot adaptation failed for task ${taskId}:`, error);
      throw error;
    }
  }

  async createTaskModel(taskId) {
    // Clone meta-model for task-specific adaptation
    const taskModel = tf.sequential();
    
    // Copy architecture
    this.metaModel.layers.forEach(layer => {
      const config = layer.getConfig();
      const newLayer = tf.layers.dense(config); // Simplified - would need proper layer cloning
      taskModel.add(newLayer);
    });
    
    // Copy weights from meta-model
    const metaWeights = this.metaModel.getWeights();
    taskModel.setWeights(metaWeights);
    
    taskModel.compile({
      optimizer: tf.train.adam(this.config.innerLearningRate),
      loss: 'meanSquaredError',
    });
    
    return taskModel;
  }

  async prepareTrainingData(examples) {
    const inputs = [];
    const targets = [];
    
    for (const example of examples) {
      // Embed input
      const inputEmbedding = await this.embeddingService.embedText(example.input);
      inputs.push(inputEmbedding);
      
      // Embed target
      const targetEmbedding = await this.embeddingService.embedText(example.output);
      targets.push(targetEmbedding);
    }
    
    return {
      inputs: tf.tensor2d(inputs),
      targets: tf.tensor2d(targets),
    };
  }

  async innerLoopAdaptation(model, inputs, targets) {
    // MAML inner loop: perform gradient steps on support set
    const initialWeights = model.getWeights();
    
    for (let step = 0; step < this.config.innerSteps; step++) {
      await model.fit(inputs, targets, {
        epochs: 1,
        verbose: 0,
      });
    }
    
    const adaptedWeights = model.getWeights();
    
    // Clean up tensors
    inputs.dispose();
    targets.dispose();
    
    return adaptedWeights;
  }

  /**
   * Meta-update: Update meta-model based on task adaptations
   * @param {Array} taskBatch - Batch of tasks for meta-update
   * @returns {Promise<Object>} Meta-update result
   */
  async metaUpdate(taskBatch) {
    logger.info(`🔄 Performing meta-update with ${taskBatch.length} tasks`);
    
    const metaGradients = [];
    
    for (const taskId of taskBatch) {
      const task = this.taskMemory.get(taskId);
      if (!task || task.examples.length < 5) continue;
      
      // Sample support and query sets
      const shuffled = [...task.examples].sort(() => Math.random() - 0.5);
      const supportSet = shuffled.slice(0, Math.floor(shuffled.length / 2));
      const querySet = shuffled.slice(Math.floor(shuffled.length / 2));
      
      // Adapt on support set
      const { inputs: supportInputs, targets: supportTargets } = 
        await this.prepareTrainingData(supportSet);
      
      // Evaluate on query set
      const { inputs: queryInputs, targets: queryTargets } = 
        await this.prepareTrainingData(querySet);
      
      // Compute meta-gradient
      const taskGradient = await this.computeMetaGradient(
        supportInputs,
        supportTargets,
        queryInputs,
        queryTargets
      );
      
      metaGradients.push(taskGradient);
      
      supportInputs.dispose();
      supportTargets.dispose();
      queryInputs.dispose();
      queryTargets.dispose();
    }
    
    // Average meta-gradients
    if (metaGradients.length > 0) {
      await this.applyMetaUpdate(metaGradients);
    }
    
    return {
      tasksProcessed: metaGradients.length,
      metaLearningRate: this.config.metaLearningRate,
    };
  }

  async computeMetaGradient(supportInputs, supportTargets, queryInputs, queryTargets) {
    // Compute gradient of query loss w.r.t. initial parameters
    // This is the core of MAML
    
    const f = () => {
      // Simulate inner loop adaptation
      const adaptedModel = tf.sequential();
      // ... (simplified for brevity)
      
      // Return query loss
      return tf.losses.meanSquaredError(queryTargets, adaptedModel.predict(queryInputs));
    };
    
    // Compute gradient
    const { value, grads } = tf.variableGrads(f);
    
    return grads;
  }

  async applyMetaUpdate(gradients) {
    // Average gradients across tasks
    const averagedGradients = {};
    
    const keys = Object.keys(gradients[0]);
    for (const key of keys) {
      averagedGradients[key] = tf.tidy(() => {
        const grads = gradients.map(g => g[key]);
        return tf.stack(grads).mean(0);
      });
    }
    
    // Apply gradient update to meta-model
    const optimizer = tf.train.adam(this.config.metaLearningRate);
    optimizer.applyGradients(averagedGradients);
    
    // Clean up
    Object.values(averagedGradients).forEach(g => g.dispose());
  }

  /**
   * Rapid domain adaptation
   * @param {string} targetDomain - Target domain name
   * @param {Array} domainExamples - Examples from target domain
   * @returns {Promise<Object>} Adaptation result
   */
  async rapidDomainAdaptation(targetDomain, domainExamples) {
    logger.info(`⚡ Rapid domain adaptation to: ${targetDomain}`);
    
    // Register as new task if not exists
    let taskId = `domain:${targetDomain}`;
    let task = this.taskMemory.get(taskId);
    
    if (!task) {
      task = await this.registerTask({
        taskId,
        name: `Domain: ${targetDomain}`,
        type: 'domain-adaptation',
        examples: domainExamples,
      });
    }
    
    // Perform few-shot adaptation
    const adaptation = await this.fewShotAdapt(taskId, domainExamples);
    
    return {
      domain: targetDomain,
      ...adaptation,
    };
  }

  /**
   * Infer on query with adapted model
   * @param {string} taskId - Task identifier
   * @param {string} query - Query input
   * @returns {Promise<Object>} Inference result
   */
  async infer(taskId, query) {
    const adaptedModel = this.taskModels.get(taskId);
    if (!adaptedModel) {
      throw new Error(`No adapted model found for task ${taskId}`);
    }
    
    // Embed query
    const queryEmbedding = await this.embeddingService.embedText(query);
    const inputTensor = tf.tensor2d([queryEmbedding]);
    
    // Create model with adapted weights
    const model = tf.sequential();
    // Reconstruct model architecture...
    
    // Predict
    const output = model.predict(inputTensor);
    const outputData = await output.data();
    
    // Clean up
    inputTensor.dispose();
    output.dispose();
    
    return {
      taskId,
      query,
      output: Array.from(outputData),
    };
  }

  /**
   * Find similar tasks based on embedding similarity
   * @param {string} taskId - Reference task
   * @param {number} k - Number of similar tasks to return
   * @returns {Promise<Array>} Similar tasks
   */
  async findSimilarTasks(taskId, k = 5) {
    const referenceTask = this.taskMemory.get(taskId);
    if (!referenceTask) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    const referenceEmbedding = referenceTask.embedding;
    const similarities = [];
    
    for (const [otherId, otherTask] of this.taskMemory) {
      if (otherId === taskId) continue;
      
      const similarity = this.cosineSimilarity(
        referenceEmbedding,
        otherTask.embedding
      );
      
      similarities.push({
        taskId: otherId,
        name: otherTask.name,
        similarity,
        type: otherTask.type,
      });
    }
    
    // Sort by similarity
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities.slice(0, k);
  }

  cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  async persistTask(taskId, taskData) {
    try {
      await this.redis.setex(
        `task-model:${taskId}`,
        86400 * 30, // 30 days
        JSON.stringify(taskData)
      );
    } catch (error) {
      logger.error(`❌ Failed to persist task ${taskId}:`, error);
    }
  }

  getStats() {
    return {
      registeredTasks: this.taskMemory.size,
      adaptedModels: this.taskModels.size,
      taskTypes: [...new Set([...this.taskMemory.values()].map(t => t.type))],
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Meta-Learning Orchestrator...');
    
    // Dispose models
    if (this.metaModel) {
      this.metaModel.dispose();
    }
    
    for (const [taskId, modelData] of this.taskModels) {
      if (modelData.model) {
        modelData.model.dispose();
      }
    }
    
    // Close Redis
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Meta-Learning Orchestrator shutdown complete');
  }
}

module.exports = MetaLearningOrchestrator;
