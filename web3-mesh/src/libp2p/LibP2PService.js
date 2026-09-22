/**
 * libp2p Service
 * 
 * Peer-to-peer networking for AI agents:
 * - Direct peer communication
 * - Pub/sub messaging
 * - DHT for peer discovery
 * - Protocol negotiation
 * 
 * @class LibP2PService
 * @version 1.0.0
 */

const { createLibp2p } = require('libp2p');
const { tcp } = require('@libp2p/tcp');
const { webSockets } = require('@libp2p/websockets');
const { mplex } = require('@libp2p/mplex');
const { noise } = require('@libp2p/noise');
const { kadDHT } = require('@libp2p/kad-dht');
const { bootstrap } = require('@libp2p/bootstrap');
const { floodsub } = require('@libp2p/floodsub');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { EventEmitter } = require('events');

class LibP2PService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      listenAddresses: options.listenAddresses || [
        '/ip4/0.0.0.0/tcp/0',
        '/ip4/0.0.0.0/tcp/0/ws',
      ],
      bootstrapPeers: options.bootstrapPeers || [
        '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
        '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
      ],
      ...options,
    };
    
    this.node = null;
    this.redis = null;
    this.isInitialized = false;
    
    // Connected peers
    this.peers = new Map();
    this.subscriptions = new Set();
    
    // Message handlers
    this.protocolHandlers = new Map();
  }

  async initialize() {
    try {
      logger.info('🔗 Initializing libp2p Service...');
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Create libp2p node
      this.node = await createLibp2p({
        addresses: {
          listen: this.config.listenAddresses,
        },
        transports: [tcp(), webSockets()],
        streamMuxers: [mplex()],
        connectionEncryption: [noise()],
        peerDiscovery: [
          bootstrap({
            list: this.config.bootstrapPeers,
          }),
        ],
        dht: kadDHT(),
        pubsub: floodsub(),
      });
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Start the node
      await this.node.start();
      
      logger.info(`✅ libp2p node started: ${this.node.peerId.toString()}`);
      logger.info(`📡 Listening on: ${this.node.getMultiaddrs().map(ma => ma.toString()).join(', ')}`);
      
      this.isInitialized = true;
      
      // Store peer info in Redis
      await this.storePeerInfo();
      
    } catch (error) {
      logger.error('❌ Failed to initialize libp2p:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // Handle peer discovery
    this.node.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString();
      logger.info(`🔍 Discovered peer: ${peerId}`);
      this.emit('peer:discovery', peerId);
    });

    // Handle peer connections
    this.node.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.remotePeer.toString();
      logger.info(`✅ Connected to peer: ${peerId}`);
      this.peers.set(peerId, {
        connectedAt: Date.now(),
        multiaddr: evt.detail.remoteAddr?.toString(),
      });
      this.emit('peer:connect', peerId);
    });

    // Handle peer disconnections
    this.node.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.remotePeer.toString();
      logger.info(`❌ Disconnected from peer: ${peerId}`);
      this.peers.delete(peerId);
      this.emit('peer:disconnect', peerId);
    });

    // Handle pubsub messages
    this.node.services.pubsub.addEventListener('message', (evt) => {
      const { topic, data, from } = evt.detail;
      logger.debug(`📨 Received message on topic ${topic} from ${from}`);
      this.emit('message', { topic, data, from });
    });
  }

  async storePeerInfo() {
    try {
      const peerInfo = {
        peerId: this.node.peerId.toString(),
        multiaddrs: this.node.getMultiaddrs().map(ma => ma.toString()),
        protocols: this.node.getProtocols(),
        connectedAt: Date.now(),
      };
      
      await this.redis.setex(
        `libp2p:peer:${peerInfo.peerId}`,
        3600,
        JSON.stringify(peerInfo)
      );
      
    } catch (error) {
      logger.warn('⚠️ Could not store peer info:', error.message);
    }
  }

  /**
   * Subscribe to a pubsub topic
   * @param {string} topic - Topic name
   * @param {Function} handler - Message handler
   */
  async subscribe(topic, handler) {
    try {
      logger.info(`📡 Subscribing to topic: ${topic}`);
      
      await this.node.services.pubsub.subscribe(topic);
      this.subscriptions.add(topic);
      
      // Register handler
      this.on(`message:${topic}`, handler);
      
      logger.info(`✅ Subscribed to topic: ${topic}`);
      
    } catch (error) {
      logger.error(`❌ Failed to subscribe to ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a pubsub topic
   * @param {string} topic - Topic name
   */
  async unsubscribe(topic) {
    try {
      logger.info(`📡 Unsubscribing from topic: ${topic}`);
      
      await this.node.services.pubsub.unsubscribe(topic);
      this.subscriptions.delete(topic);
      
      logger.info(`✅ Unsubscribed from topic: ${topic}`);
      
    } catch (error) {
      logger.error(`❌ Failed to unsubscribe from ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Publish message to a topic
   * @param {string} topic - Topic name
   * @param {Buffer|string} data - Message data
   */
  async publish(topic, data) {
    try {
      const messageData = Buffer.isBuffer(data) ? data : Buffer.from(data);
      
      await this.node.services.pubsub.publish(topic, messageData);
      
      logger.debug(`📤 Published to ${topic}: ${messageData.length} bytes`);
      
    } catch (error) {
      logger.error(`❌ Failed to publish to ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Dial a peer
   * @param {string} multiaddr - Peer multiaddress
   * @returns {Promise<Object>} Connection result
   */
  async dial(multiaddr) {
    try {
      logger.info(`📞 Dialing: ${multiaddr}`);
      
      const connection = await this.node.dial(multiaddr);
      
      logger.info(`✅ Connected to: ${multiaddr}`);
      
      return {
        connected: true,
        remotePeer: connection.remotePeer.toString(),
        remoteAddr: connection.remoteAddr.toString(),
      };
      
    } catch (error) {
      logger.error(`❌ Failed to dial ${multiaddr}:`, error);
      throw error;
    }
  }

  /**
   * Hang up a peer connection
   * @param {string} peerId - Peer ID
   */
  async hangUp(peerId) {
    try {
      logger.info(`📴 Hanging up: ${peerId}`);
      
      await this.node.hangUp(peerId);
      
      logger.info(`✅ Hung up: ${peerId}`);
      
    } catch (error) {
      logger.error(`❌ Failed to hang up ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Find peers providing a CID
   * @param {string} cid - Content identifier
   * @returns {Promise<Array>} List of providers
   */
  async findProviders(cid) {
    try {
      logger.info(`🔍 Finding providers for: ${cid}`);
      
      const providers = [];
      for await (const provider of this.node.contentRouting.findProviders(cid)) {
        providers.push({
          id: provider.id.toString(),
          multiaddrs: provider.multiaddrs.map(ma => ma.toString()),
        });
      }
      
      logger.info(`✅ Found ${providers.length} providers`);
      
      return providers;
      
    } catch (error) {
      logger.error(`❌ Failed to find providers for ${cid}:`, error);
      throw error;
    }
  }

  /**
   * Provide a CID to the network
   * @param {string} cid - Content identifier
   */
  async provide(cid) {
    try {
      logger.info(`📢 Providing: ${cid}`);
      
      await this.node.contentRouting.provide(cid);
      
      logger.info(`✅ Now providing: ${cid}`);
      
    } catch (error) {
      logger.error(`❌ Failed to provide ${cid}:`, error);
      throw error;
    }
  }

  /**
   * Get connected peers
   * @returns {Array} List of connected peers
   */
  getConnectedPeers() {
    return Array.from(this.peers.entries()).map(([peerId, info]) => ({
      peerId,
      ...info,
    }));
  }

  /**
   * Get node info
   * @returns {Object} Node information
   */
  getNodeInfo() {
    return {
      peerId: this.node?.peerId.toString(),
      multiaddrs: this.node?.getMultiaddrs().map(ma => ma.toString()),
      protocols: this.node?.getProtocols(),
      connections: this.peers.size,
      subscriptions: Array.from(this.subscriptions),
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down libp2p Service...');
    
    if (this.node) {
      await this.node.stop();
    }
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ libp2p Service shutdown complete');
  }
}

module.exports = LibP2PService;
