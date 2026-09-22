const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

class WebSocketManager extends EventEmitter {
  constructor(wss) {
    super();
    this.wss = wss;
    this.clients = new Map();
    this.userSockets = new Map();
  }

  initialize() {
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
    logger.info('✅ WebSocket manager initialized');
  }

  handleConnection(ws, req) {
    const clientId = uuidv4();
    const clientInfo = {
      id: clientId,
      ws,
      userId: null,
      deviceType: null,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    };

    this.clients.set(clientId, clientInfo);
    logger.info(`🔌 WebSocket client connected: ${clientId}`);

    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Connected to DRS AI Human Interaction Service',
    }));

    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    ws.on('error', (error) => {
      logger.error(`❌ WebSocket error for client ${clientId}:`, error);
    });

    this.setupHeartbeat(clientId);
  }

  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data);
      const client = this.clients.get(clientId);
      if (!client) return;

      logger.debug(`📨 WebSocket message from ${clientId}:`, message.type);

      switch (message.type) {
        case 'authenticate':
          this.handleAuthenticate(clientId, message);
          break;
        case 'ping':
          this.handlePing(clientId);
          break;
        case 'voice_stream':
          this.emit('voice:stream', { clientId, data: message.data });
          break;
        case 'camera_frame':
          this.emit('camera:frame', { clientId, data: message.data });
          break;
        case 'gesture_frame':
          this.emit('gesture:frame', { clientId, data: message.data });
          break;
        case 'subscribe':
          this.handleSubscribe(clientId, message);
          break;
        default:
          logger.warn(`⚠️ Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('❌ Failed to parse WebSocket message:', error);
    }
  }

  handleAuthenticate(clientId, message) {
    const { userId, deviceType } = message;
    const client = this.clients.get(clientId);
    if (!client) return;

    client.userId = userId;
    client.deviceType = deviceType;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(clientId);

    client.ws.send(JSON.stringify({ type: 'authenticated', userId }));
    logger.info(`✅ Client ${clientId} authenticated as user ${userId} (${deviceType})`);
  }

  handlePing(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = Date.now();
      client.ws.send(JSON.stringify({ type: 'pong' }));
    }
  }

  handleSubscribe(clientId, message) {
    const { channel } = message;
    const client = this.clients.get(clientId);
    if (!client) return;

    if (!client.channels) client.channels = new Set();
    client.channels.add(channel);

    client.ws.send(JSON.stringify({ type: 'subscribed', channel }));
    logger.info(`📡 Client ${clientId} subscribed to ${channel}`);
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      if (client.userId) {
        const userSockets = this.userSockets.get(client.userId);
        if (userSockets) {
          userSockets.delete(clientId);
          if (userSockets.size === 0) this.userSockets.delete(client.userId);
        }
      }
      this.clients.delete(clientId);
      logger.info(`🔌 WebSocket client disconnected: ${clientId}`);
    }
  }

  setupHeartbeat(clientId) {
    const interval = setInterval(() => {
      const client = this.clients.get(clientId);
      if (!client) { clearInterval(interval); return; }
      const timeSinceLastPing = Date.now() - client.lastPing;
      if (timeSinceLastPing > 60000) {
        logger.warn(`⏱️ Client ${clientId} timed out`);
        client.ws.terminate();
        clearInterval(interval);
        return;
      }
      if (client.ws.readyState === 1) {
        client.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  broadcast(message, excludeClientId = null) {
    const data = JSON.stringify(message);
    for (const [clientId, client] of this.clients) {
      if (clientId !== excludeClientId && client.ws.readyState === 1) {
        client.ws.send(data);
      }
    }
  }

  sendToUser(userId, message) {
    const clientIds = this.userSockets.get(userId);
    if (!clientIds) return;
    const data = JSON.stringify(message);
    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === 1) {
        client.ws.send(data);
      }
    }
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
    }
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      authenticatedUsers: this.userSockets.size,
    };
  }
}

module.exports = WebSocketManager;
