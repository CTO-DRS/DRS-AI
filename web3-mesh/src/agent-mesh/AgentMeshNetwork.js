/**
 * Agent Mesh Network
 * 
 * Distributed AI agent coordination:
 * - Agent discovery and registration
 * - Task distribution and load balancing
 * - Consensus mechanisms
 * - Federated learning coordination
 * 
 * @class AgentMeshNetwork
 * @version 1.0.0
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { EventEmitter } = require('events');

class AgentMeshNetwork extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.ipfsService = options.ipfsService;
    this.libp2pService = options.libp2pService;
    this.contractService = options.contractService;
    
    this.redis = null;
    this.isInitialized = false;
    
    // Local agent registry
    this.localAgents = new Map();
    this.remoteAgents = new Map();
    
    // Task queue
    this.taskQueue = [];
    this.runningTasks = new Map();
    
    // Consensus state
    this.consensusRounds = new Map();
    
    // Topics
    this.topics = {
      agentDiscovery: 'drs:agent:discovery',
      taskBroadcast: 'drs:task:broadcast',
      taskResult: 'drs:task:result',
      consensus: 'drs:consensus',
      federated: 'drs:federated',
    };
  }

  async initialize() {
    try {
      logger.info('🌐 Initializing Agent Mesh Network...');
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Subscribe to pubsub topics
      await this.subscribeToTopics();
      
      // Start discovery process
      this.startDiscovery();
      
      // Start task processor
      this.startTaskProcessor();
      
      this.isInitialized = true;
      logger.info('✅ Agent Mesh Network initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Agent Mesh Network:', error);
      throw error;
    }
  }

  async subscribeToTopics() {
    if (!this.libp2pService) return;
    
    // Subscribe to agent discovery
    await this.libp2pService.subscribe(this.topics.agentDiscovery, (message) => {
      this.handleAgentDiscovery(message);
    });
    
    // Subscribe to task broadcasts
    await this.libp2pService.subscribe(this.topics.taskBroadcast, (message) => {
      this.handleTaskBroadcast(message);
    });
    
    // Subscribe to task results
    await this.libp2pService.subscribe(this.topics.taskResult, (message) => {
      this.handleTaskResult(message);
    });
    
    // Subscribe to consensus messages
    await this.libp2pService.subscribe(this.topics.consensus, (message) => {
      this.handleConsensusMessage(message);
    });
    
    logger.info('📡 Subscribed to mesh topics');
  }

  startDiscovery() {
    // Broadcast presence periodically
    setInterval(() => {
      this.broadcastPresence();
    }, 30000);
    
    // Initial broadcast
    this.broadcastPresence();
    
    logger.info('🔍 Agent discovery started');
  }

  async broadcastPresence() {
    if (!this.libp2pService) return;
    
    const presence = {
      type: 'presence',
      nodeId: this.libp2pService.node?.peerId.toString(),
      agents: Array.from(this.localAgents.values()).map(agent => ({
        id: agent.id,
        name: agent.name,
        capabilities: agent.capabilities,
        load: agent.load,
      })),
      timestamp: Date.now(),
    };
    
    await this.libp2pService.publish(
      this.topics.agentDiscovery,
      JSON.stringify(presence)
    );
  }

  handleAgentDiscovery(message) {
    try {
      const data = JSON.parse(message.data.toString());
      
      if (data.type === 'presence') {
        // Update remote agents
        for (const agent of data.agents) {
          this.remoteAgents.set(agent.id, {
            ...agent,
            nodeId: data.nodeId,
            lastSeen: Date.now(),
          });
        }
        
        logger.debug(`👁️ Discovered ${data.agents.length} agents from ${data.nodeId}`);
      }
      
    } catch (error) {
      logger.warn('⚠️ Failed to parse agent discovery message:', error.message);
    }
  }

  /**
   * Register a local agent
   * @param {Object} agent - Agent configuration
   * @returns {Promise<Object>} Registered agent
   */
  async registerAgent(agent) {
    const agentId = uuidv4();
    
    const agentConfig = {
      id: agentId,
      name: agent.name,
      type: agent.type || 'general',
      capabilities: agent.capabilities || [],
      endpoint: agent.endpoint,
      load: 0,
      maxLoad: agent.maxLoad || 10,
      registeredAt: Date.now(),
      status: 'active',
    };
    
    this.localAgents.set(agentId, agentConfig);
    
    // Register on blockchain if available
    if (this.contractService) {
      try {
        const metadataURI = await this.uploadAgentMetadata(agentConfig);
        await this.contractService.registerAgent({
          name: agent.name,
          metadataURI,
          capabilities: agent.capabilities,
        });
      } catch (error) {
        logger.warn('⚠️ Blockchain registration failed:', error.message);
      }
    }
    
    // Broadcast presence
    await this.broadcastPresence();
    
    logger.info(`🤖 Agent registered: ${agent.name} (${agentId})`);
    
    return agentConfig;
  }

  async uploadAgentMetadata(agent) {
    const metadata = {
      ...agent,
      nodeInfo: this.libp2pService?.getNodeInfo(),
    };
    
    if (this.ipfsService) {
      const result = await this.ipfsService.upload(
        Buffer.from(JSON.stringify(metadata)),
        { metadata: { type: 'agent-metadata' } }
      );
      return result.cid;
    }
    
    return null;
  }

  /**
   * Submit a task to the mesh
   * @param {Object} task - Task definition
   * @returns {Promise<Object>} Task submission result
   */
  async submitTask(task) {
    const taskId = uuidv4();
    
    const taskConfig = {
      id: taskId,
      type: task.type,
      description: task.description,
      input: task.input,
      requirements: task.requirements || {},
      priority: task.priority || 'normal',
      timeout: task.timeout || 30000,
      createdAt: Date.now(),
      status: 'pending',
    };
    
    // Add to queue
    this.taskQueue.push(taskConfig);
    
    // Broadcast task
    if (this.libp2pService) {
      await this.libp2pService.publish(
        this.topics.taskBroadcast,
        JSON.stringify({
          type: 'new-task',
          task: taskConfig,
        })
      );
    }
    
    logger.info(`📋 Task submitted: ${taskId}`);
    
    return {
      taskId,
      status: 'pending',
      estimatedTime: this.estimateTaskTime(task),
    };
  }

  estimateTaskTime(task) {
    // Simple estimation based on task type
    const estimates = {
      inference: 5000,
      embedding: 2000,
      analysis: 10000,
      generation: 15000,
    };
    
    return estimates[task.type] || 5000;
  }

  handleTaskBroadcast(message) {
    try {
      const data = JSON.parse(message.data.toString());
      
      if (data.type === 'new-task') {
        // Check if we can handle this task
        const capableAgents = this.findCapableAgents(data.task.requirements);
        
        if (capableAgents.length > 0) {
          // Claim the task
          this.claimTask(data.task, capableAgents[0]);
        }
      }
      
    } catch (error) {
      logger.warn('⚠️ Failed to parse task broadcast:', error.message);
    }
  }

  findCapableAgents(requirements) {
    const capable = [];
    
    for (const [agentId, agent] of this.localAgents) {
      if (agent.status !== 'active') continue;
      if (agent.load >= agent.maxLoad) continue;
      
      // Check capabilities
      const hasCapabilities = requirements.capabilities?.every(cap =>
        agent.capabilities.includes(cap)
      ) ?? true;
      
      if (hasCapabilities) {
        capable.push(agent);
      }
    }
    
    // Sort by load (least loaded first)
    capable.sort((a, b) => a.load - b.load);
    
    return capable;
  }

  async claimTask(task, agent) {
    logger.info(`🎯 Claiming task ${task.id} for agent ${agent.name}`);
    
    // Update agent load
    agent.load++;
    
    // Execute task
    this.executeTask(task, agent).finally(() => {
      agent.load--;
    });
  }

  async executeTask(task, agent) {
    try {
      this.runningTasks.set(task.id, {
        ...task,
        agentId: agent.id,
        startedAt: Date.now(),
      });
      
      // Call agent endpoint
      const axios = require('axios');
      const response = await axios.post(
        `${agent.endpoint}/execute`,
        {
          taskId: task.id,
          type: task.type,
          input: task.input,
        },
        { timeout: task.timeout }
      );
      
      const result = {
        taskId: task.id,
        agentId: agent.id,
        output: response.data,
        completedAt: Date.now(),
      };
      
      // Publish result
      if (this.libp2pService) {
        await this.libp2pService.publish(
          this.topics.taskResult,
          JSON.stringify({
            type: 'task-complete',
            result,
          })
        );
      }
      
      this.emit('task:complete', result);
      
    } catch (error) {
      logger.error(`❌ Task execution failed:`, error);
      
      this.emit('task:error', {
        taskId: task.id,
        error: error.message,
      });
      
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  handleTaskResult(message) {
    try {
      const data = JSON.parse(message.data.toString());
      
      if (data.type === 'task-complete') {
        this.emit('task:complete', data.result);
      }
      
    } catch (error) {
      logger.warn('⚠️ Failed to parse task result:', error.message);
    }
  }

  startTaskProcessor() {
    // Process queued tasks
    setInterval(() => {
      this.processTaskQueue();
    }, 1000);
    
    logger.info('⚙️ Task processor started');
  }

  processTaskQueue() {
    if (this.taskQueue.length === 0) return;
    
    const task = this.taskQueue.shift();
    const capableAgents = this.findCapableAgents(task.requirements);
    
    if (capableAgents.length > 0) {
      this.claimTask(task, capableAgents[0]);
    } else {
      // Re-queue if no agents available
      this.taskQueue.push(task);
    }
  }

  /**
   * Initiate federated learning round
   * @param {Object} config - Federated learning configuration
   * @returns {Promise<Object>} Round information
   */
  async initiateFederatedRound(config) {
    const roundId = uuidv4();
    
    logger.info(`🔄 Initiating federated learning round: ${roundId}`);
    
    const round = {
      id: roundId,
      modelId: config.modelId,
      participants: [],
      globalModel: config.globalModel,
      startedAt: Date.now(),
      status: 'collecting',
    };
    
    this.consensusRounds.set(roundId, round);
    
    // Broadcast to mesh
    if (this.libp2pService) {
      await this.libp2pService.publish(
        this.topics.federated,
        JSON.stringify({
          type: 'federated-round',
          round,
        })
      );
    }
    
    return round;
  }

  /**
   * Submit local model update for federated learning
   * @param {string} roundId - Round ID
   * @param {Object} update - Model update
   * @returns {Promise<Object>} Submission result
   */
  async submitModelUpdate(roundId, update) {
    const round = this.consensusRounds.get(roundId);
    if (!round) {
      throw new Error(`Round ${roundId} not found`);
    }
    
    // Upload to IPFS
    let updateCID = null;
    if (this.ipfsService) {
      const result = await this.ipfsService.upload(
        Buffer.from(JSON.stringify(update)),
        { metadata: { type: 'model-update', roundId } }
      );
      updateCID = result.cid;
    }
    
    round.participants.push({
      nodeId: this.libp2pService?.node?.peerId.toString(),
      updateCID,
      timestamp: Date.now(),
    });
    
    // Check if we have enough participants
    if (round.participants.length >= config.minParticipants) {
      this.aggregateModels(round);
    }
    
    return {
      roundId,
      updateCID,
      status: 'submitted',
    };
  }

  async aggregateModels(round) {
    logger.info(`🔄 Aggregating models for round ${round.id}`);
    
    // Download all updates
    const updates = [];
    for (const participant of round.participants) {
      if (participant.updateCID && this.ipfsService) {
        const data = await this.ipfsService.download(participant.updateCID);
        updates.push(JSON.parse(data.toString()));
      }
    }
    
    // Aggregate (simplified - would use proper federated averaging)
    const aggregated = this.federatedAverage(updates);
    
    round.aggregatedModel = aggregated;
    round.status = 'completed';
    round.completedAt = Date.now();
    
    this.emit('federated:complete', round);
  }

  federatedAverage(updates) {
    // Simplified federated averaging
    // In production, use proper secure aggregation
    
    if (updates.length === 0) return null;
    
    const weights = updates.map(u => u.weights);
    const averaged = {};
    
    const keys = Object.keys(weights[0]);
    for (const key of keys) {
      averaged[key] = weights.reduce((sum, w) => sum + w[key], 0) / weights.length;
    }
    
    return { weights: averaged };
  }

  handleConsensusMessage(message) {
    // Handle consensus protocol messages
    try {
      const data = JSON.parse(message.data.toString());
      this.emit('consensus:message', data);
    } catch (error) {
      logger.warn('⚠️ Failed to parse consensus message:', error.message);
    }
  }

  getStats() {
    return {
      localAgents: this.localAgents.size,
      remoteAgents: this.remoteAgents.size,
      pendingTasks: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      consensusRounds: this.consensusRounds.size,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Agent Mesh Network...');
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Agent Mesh Network shutdown complete');
  }
}

module.exports = AgentMeshNetwork;
