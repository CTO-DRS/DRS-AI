/**
 * Agent Contract Service
 * 
 * Smart contracts for AI agent coordination:
 * - Agent registration and reputation
 * - Task assignment and payment
 * - Consensus mechanisms
 * - Token economics
 * 
 * @class AgentContractService
 * @version 1.0.0
 */

// ethers + Web3 are optional — service works in mock mode without them
let ethers = null;
let Web3 = null;
try { ethers = require('ethers'); } catch { /* mock mode */ }
try { Web3 = require('web3'); } catch { /* mock mode */ }
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { EventEmitter } = require('events');

// ABI for AI Agent Registry Contract (simplified)
const AGENT_REGISTRY_ABI = [
  "function registerAgent(string memory name, string memory metadataURI) public returns (uint256)",
  "function updateReputation(uint256 agentId, int256 delta) public",
  "function getAgent(uint256 agentId) public view returns (tuple(uint256 id, address owner, string name, string metadataURI, int256 reputation, bool active))",
  "function getAgentCount() public view returns (uint256)",
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)",
  "event ReputationUpdated(uint256 indexed agentId, int256 newReputation)",
];

// ABI for Task Manager Contract
const TASK_MANAGER_ABI = [
  "function createTask(string memory description, uint256 reward, uint256 deadline) public payable returns (uint256)",
  "function assignTask(uint256 taskId, uint256 agentId) public",
  "function completeTask(uint256 taskId, string memory resultURI) public",
  "function verifyTask(uint256 taskId, bool accepted) public",
  "function getTask(uint256 taskId) public view returns (tuple(uint256 id, address creator, string description, uint256 reward, uint256 deadline, uint256 assignedAgent, string resultURI, uint8 status))",
  "event TaskCreated(uint256 indexed taskId, address indexed creator, uint256 reward)",
  "event TaskAssigned(uint256 indexed taskId, uint256 indexed agentId)",
  "event TaskCompleted(uint256 indexed taskId, string resultURI)",
];

class AgentContractService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      ethereumRpc: options.ethereumRpc || process.env.ETHEREUM_RPC || 'http://localhost:8545',
      privateKey: options.privateKey || process.env.ETHEREUM_PRIVATE_KEY,
      agentRegistryAddress: options.agentRegistryAddress || process.env.AGENT_REGISTRY_ADDRESS,
      taskManagerAddress: options.taskManagerAddress || process.env.TASK_MANAGER_ADDRESS,
      ...options,
    };
    
    this.provider = null;
    this.wallet = null;
    this.agentRegistry = null;
    this.taskManager = null;
    this.redis = null;
    
    this.isInitialized = false;
    
    // Local agent registry cache
    this.registeredAgents = new Map();
    this.pendingTasks = new Map();
  }

  async initialize() {
    try {
      logger.info('📜 Initializing Agent Contract Service...');
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Initialize Ethereum connection (only if ethers is installed AND config is provided)
      if (ethers && this.config.ethereumRpc && this.config.privateKey) {
        await this.initializeEthereum();
      } else {
        logger.warn('⚠️ Ethereum configuration missing (or ethers not installed), running in mock mode');
        this.initializeMockMode();
      }
      
      this.isInitialized = true;
      logger.info('✅ Agent Contract Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Agent Contract Service:', error);
      // Don't throw - can work in mock mode
      this.initializeMockMode();
      this.isInitialized = true;
    }
  }

  async initializeEthereum() {
    // Create provider
    this.provider = new ethers.JsonRpcProvider(this.config.ethereumRpc);
    
    // Create wallet
    this.wallet = new ethers.Wallet(this.config.privateKey, this.provider);
    
    logger.info(`🔐 Wallet address: ${this.wallet.address}`);
    
    // Connect to contracts
    if (this.config.agentRegistryAddress) {
      this.agentRegistry = new ethers.Contract(
        this.config.agentRegistryAddress,
        AGENT_REGISTRY_ABI,
        this.wallet
      );
      logger.info(`✅ Connected to Agent Registry: ${this.config.agentRegistryAddress}`);
    }
    
    if (this.config.taskManagerAddress) {
      this.taskManager = new ethers.Contract(
        this.config.taskManagerAddress,
        TASK_MANAGER_ABI,
        this.wallet
      );
      logger.info(`✅ Connected to Task Manager: ${this.config.taskManagerAddress}`);
    }
    
    // Setup event listeners
    this.setupEventListeners();
  }

  initializeMockMode() {
    logger.info('🔧 Running in mock mode');
    
    this.provider = null;
    this.wallet = null;
    this.agentRegistry = null;
    this.taskManager = null;
  }

  setupEventListeners() {
    if (!this.agentRegistry) return;
    
    // Listen for agent registration events
    this.agentRegistry.on('AgentRegistered', (agentId, owner, name) => {
      logger.info(`🤖 Agent registered: ${name} (ID: ${agentId})`);
      this.emit('agent:registered', {
        agentId: agentId.toString(),
        owner,
        name,
      });
    });
    
    // Listen for reputation updates
    this.agentRegistry.on('ReputationUpdated', (agentId, newReputation) => {
      logger.info(`⭐ Reputation updated: Agent ${agentId} = ${newReputation}`);
      this.emit('agent:reputation', {
        agentId: agentId.toString(),
        reputation: newReputation.toString(),
      });
    });
    
    if (this.taskManager) {
      // Listen for task events
      this.taskManager.on('TaskCreated', (taskId, creator, reward) => {
        logger.info(`📋 Task created: ${taskId} (Reward: ${reward})`);
        this.emit('task:created', {
          taskId: taskId.toString(),
          creator,
          reward: reward.toString(),
        });
      });
      
      this.taskManager.on('TaskAssigned', (taskId, agentId) => {
        logger.info(`📋 Task assigned: ${taskId} -> Agent ${agentId}`);
        this.emit('task:assigned', {
          taskId: taskId.toString(),
          agentId: agentId.toString(),
        });
      });
    }
  }

  /**
   * Register an AI agent on the blockchain
   * @param {Object} agent - Agent information
   * @returns {Promise<Object>} Registration result
   */
  async registerAgent(agent) {
    const { name, metadataURI, capabilities = [] } = agent;
    
    try {
      logger.info(`🤖 Registering agent: ${name}`);
      
      if (this.agentRegistry) {
        // Real blockchain registration
        const tx = await this.agentRegistry.registerAgent(name, metadataURI);
        const receipt = await tx.wait();
        
        // Parse event to get agent ID
        const event = receipt.events.find(e => e.event === 'AgentRegistered');
        const agentId = event.args.agentId.toString();
        
        // Store in cache
        this.registeredAgents.set(agentId, {
          id: agentId,
          name,
          metadataURI,
          capabilities,
          reputation: 0,
          registeredAt: Date.now(),
        });
        
        return {
          agentId,
          name,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
        };
        
      } else {
        // Mock registration
        const agentId = uuidv4();
        
        this.registeredAgents.set(agentId, {
          id: agentId,
          name,
          metadataURI,
          capabilities,
          reputation: 0,
          registeredAt: Date.now(),
        });
        
        logger.info(`✅ Agent registered (mock): ${agentId}`);
        
        return {
          agentId,
          name,
          mock: true,
        };
      }
      
    } catch (error) {
      logger.error('❌ Agent registration failed:', error);
      throw error;
    }
  }

  /**
   * Get agent information
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Agent information
   */
  async getAgent(agentId) {
    // Check cache first
    if (this.registeredAgents.has(agentId)) {
      return this.registeredAgents.get(agentId);
    }
    
    try {
      if (this.agentRegistry) {
        const agent = await this.agentRegistry.getAgent(agentId);
        
        return {
          id: agent.id.toString(),
          owner: agent.owner,
          name: agent.name,
          metadataURI: agent.metadataURI,
          reputation: agent.reputation.toString(),
          active: agent.active,
        };
      }
      
      return null;
      
    } catch (error) {
      logger.error(`❌ Failed to get agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Update agent reputation
   * @param {string} agentId - Agent ID
   * @param {number} delta - Reputation change
   * @returns {Promise<Object>} Update result
   */
  async updateReputation(agentId, delta) {
    try {
      logger.info(`⭐ Updating reputation: Agent ${agentId} += ${delta}`);
      
      if (this.agentRegistry) {
        const tx = await this.agentRegistry.updateReputation(agentId, delta);
        const receipt = await tx.wait();
        
        return {
          agentId,
          delta,
          transactionHash: receipt.transactionHash,
        };
      } else {
        // Mock update
        const agent = this.registeredAgents.get(agentId);
        if (agent) {
          agent.reputation += delta;
        }
        
        return {
          agentId,
          delta,
          mock: true,
        };
      }
      
    } catch (error) {
      logger.error(`❌ Failed to update reputation for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Create a task
   * @param {Object} task - Task information
   * @returns {Promise<Object>} Task creation result
   */
  async createTask(task) {
    const { description, reward, deadline } = task;
    
    try {
      logger.info(`📋 Creating task: ${description.slice(0, 50)}...`);
      
      if (this.taskManager) {
        const tx = await this.taskManager.createTask(
          description,
          reward,
          deadline,
          { value: reward }
        );
        const receipt = await tx.wait();
        
        const event = receipt.events.find(e => e.event === 'TaskCreated');
        const taskId = event.args.taskId.toString();
        
        return {
          taskId,
          description,
          reward: reward.toString(),
          transactionHash: receipt.transactionHash,
        };
      } else {
        // Mock task creation
        const taskId = uuidv4();
        
        this.pendingTasks.set(taskId, {
          id: taskId,
          description,
          reward,
          deadline,
          status: 'open',
          createdAt: Date.now(),
        });
        
        return {
          taskId,
          description,
          reward,
          mock: true,
        };
      }
      
    } catch (error) {
      logger.error('❌ Task creation failed:', error);
      throw error;
    }
  }

  /**
   * Assign task to agent
   * @param {string} taskId - Task ID
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Assignment result
   */
  async assignTask(taskId, agentId) {
    try {
      logger.info(`📋 Assigning task ${taskId} to agent ${agentId}`);
      
      if (this.taskManager) {
        const tx = await this.taskManager.assignTask(taskId, agentId);
        const receipt = await tx.wait();
        
        return {
          taskId,
          agentId,
          transactionHash: receipt.transactionHash,
        };
      } else {
        // Mock assignment
        const task = this.pendingTasks.get(taskId);
        if (task) {
          task.assignedAgent = agentId;
          task.status = 'assigned';
        }
        
        return {
          taskId,
          agentId,
          mock: true,
        };
      }
      
    } catch (error) {
      logger.error(`❌ Task assignment failed:`, error);
      throw error;
    }
  }

  /**
   * Complete a task
   * @param {string} taskId - Task ID
   * @param {string} resultURI - Result metadata URI
   * @returns {Promise<Object>} Completion result
   */
  async completeTask(taskId, resultURI) {
    try {
      logger.info(`✅ Completing task ${taskId}`);
      
      if (this.taskManager) {
        const tx = await this.taskManager.completeTask(taskId, resultURI);
        const receipt = await tx.wait();
        
        return {
          taskId,
          resultURI,
          transactionHash: receipt.transactionHash,
        };
      } else {
        // Mock completion
        const task = this.pendingTasks.get(taskId);
        if (task) {
          task.resultURI = resultURI;
          task.status = 'completed';
          task.completedAt = Date.now();
        }
        
        return {
          taskId,
          resultURI,
          mock: true,
        };
      }
      
    } catch (error) {
      logger.error(`❌ Task completion failed:`, error);
      throw error;
    }
  }

  getStats() {
    return {
      registeredAgents: this.registeredAgents.size,
      pendingTasks: this.pendingTasks.size,
      connected: this.provider !== null,
      walletAddress: this.wallet?.address,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Agent Contract Service...');
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Agent Contract Service shutdown complete');
  }
}

module.exports = AgentContractService;
