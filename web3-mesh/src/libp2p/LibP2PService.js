/**
 * libp2p Service
 *
 * Peer-to-peer networking for AI agents:
 * - Direct peer communication
 * - Pub/sub messaging
 * - DHT for peer discovery
 * - Protocol negotiation
 *
 * NOTE: This implementation uses an in-memory mock so the service can run
 * offline without the heavy `libp2p` dependency stack (which had several
 * abandoned packages). For production P2P networking, swap this for the
 * real libp2p 3.x API — the surface area used by callers is preserved.
 *
 * @class LibP2PService
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { EventEmitter } = require('events');
const crypto = require('crypto');

class LibP2PService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      listenAddresses: options.listenAddresses || ['/ip4/0.0.0.0/tcp/0'],
      bootstrapPeers: options.bootstrapPeers || [],
      ...options,
    };

    this.node = null;
    this.redis = null;
    this.isInitialized = false;

    this.peers = new Map();
    this.subscriptions = new Set();
    this.protocolHandlers = new Map();
  }

  async initialize() {
    try {
      logger.info('🔗 Initializing libp2p Service (in-memory mock)...');

      this.redis = await getRedisClient();

      // Create a pseudo-libp2p node with peerId
      const peerIdBytes = crypto.randomBytes(32);
      this.node = {
        peerId: {
          toString: () => 'Qm' + peerIdBytes.toString('hex').slice(0, 44),
          publicKey: peerIdBytes,
        },
        multiaddrs: this.config.listenAddresses,
        connections: new Map(),
        getPeers: () => Array.from(this.peers.keys()),
        dial: async (peerId) => {
          logger.info(`📞 Mock dial: ${peerId}`);
          return { peerId, protocols: [] };
        },
        hangUp: async (peerId) => {
          logger.info(`📞 Mock hangUp: ${peerId}`);
          this.peers.delete(peerId);
        },
        pubsub: {
          subscribe: (topic) => {
            this.subscriptions.add(topic);
            logger.info(`📥 Subscribed to: ${topic}`);
          },
          unsubscribe: (topic) => {
            this.subscriptions.delete(topic);
            logger.info(`📤 Unsubscribed from: ${topic}`);
          },
          publish: async (topic, message) => {
            logger.info(`📢 Published ${message.length}b to ${topic}`);
            // Emit locally so subscribers in-process can receive
            this.emit(`pubsub:${topic}`, message);
            return { recipients: 0 };
          },
          getSubscribers: async () => [],
          getTopics: () => Array.from(this.subscriptions),
        },
        contentRouting: {
          provide: async (cid) => logger.info(`📤 Providing: ${cid}`),
          findProviders: async () => [],
        },
        peerRouting: {
          findPeer: async (peerId) => ({ id: peerId, multiaddrs: [] }),
        },
        dht: {
          put: async (key, value) => {
            if (this.redis && this.redis.setex) {
              await this.redis.setex(`libp2p:dht:${key.toString()}`, 3600, value.toString());
            }
            logger.info(`🗄️  DHT put: ${key.toString().slice(0, 16)}...`);
          },
          get: async (key) => {
            if (this.redis && this.redis.get) {
              const v = await this.redis.get(`libp2p:dht:${key.toString()}`);
              return v ? Buffer.from(v) : null;
            }
            return null;
          },
        },
        start: async () => logger.info('✅ libp2p node started'),
        stop: async () => logger.info('🛑 libp2p node stopped'),
        handle: (protocol, handler) => {
          this.protocolHandlers.set(protocol, handler);
          logger.info(`🤝 Handling protocol: ${protocol}`);
        },
        register: (protocol, handler) => this.handle(protocol, handler),
      };

      await this.node.start();

      logger.info(`✅ libp2p Service initialized — peerId: ${this.node.peerId.toString().slice(0, 20)}...`);

      this.isInitialized = true;
    } catch (error) {
      logger.error('❌ Failed to initialize libp2p:', error);
      throw error;
    }
  }

  async dialPeer(peerId) {
    if (!this.isInitialized) throw new Error('libp2p not initialized');
    return this.node.dial(peerId);
  }

  async publish(topic, message) {
    if (!this.isInitialized) throw new Error('libp2p not initialized');
    return this.node.pubsub.publish(topic, Buffer.from(message));
  }

  subscribe(topic, handler) {
    if (!this.isInitialized) throw new Error('libp2p not initialized');
    this.node.pubsub.subscribe(topic);
    this.on(`pubsub:${topic}`, handler);
  }

  async putDHT(key, value) {
    if (!this.isInitialized) throw new Error('libp2p not initialized');
    return this.node.dht.put(Buffer.from(key), Buffer.from(value));
  }

  async getDHT(key) {
    if (!this.isInitialized) throw new Error('libp2p not initialized');
    return this.node.dht.get(Buffer.from(key));
  }

  getPeerId() {
    return this.node?.peerId?.toString() || null;
  }

  getConnectedPeers() {
    return Array.from(this.peers.keys());
  }

  getNodeInfo() {
    return {
      peerId: this.getPeerId(),
      multiaddrs: this.config.listenAddresses,
      protocols: Array.from(this.protocolHandlers.keys()),
      peers: this.getConnectedPeers(),
      subscriptions: Array.from(this.subscriptions),
      isStarted: this.isInitialized,
    };
  }

  async shutdown() {
    if (this.node) await this.node.stop();
    this.isInitialized = false;
    logger.info('✅ libp2p Service shutdown complete');
  }
}

module.exports = LibP2PService;
