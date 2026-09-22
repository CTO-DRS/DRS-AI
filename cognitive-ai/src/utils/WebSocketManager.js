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
      connectedAt: Date.now(),
      lastPing: Date.now(),
    };

    this.clients.set(clientId, clientInfo);
    logger.info(`🔌 WebSocket client connected: ${clientId}`);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      message: 'Connected to DRS AI Cognitive AI Service',
    }));

    // Handle messages
    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    // Handle close
    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`❌ WebSocket error for client ${clientId}:`, error);
    });

    // Setup ping/pong
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

        case 'persona-update':
          this.emit('persona-update', message.data);
          break;

        case 'visual-analysis':
          this.emit('visual-analysis', message.data);
          break;

        case 'ping':
          this.handlePing(clientId);
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
    const { userId, token } = message;
    const client = this.clients.get(clientId);

    if (!client) return;

    // TODO: Validate token
    client.userId = userId;

    // Map user to socket
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(clientId);

    client.ws.send(JSON.stringify({
      type: 'authenticated',
      userId,
    }));

    logger.info(`✅ Client ${clientId} authenticated as user ${userId}`);
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

    // Add to channel
    if (!client.channels) {
      client.channels = new Set();
    }
    client.channels.add(channel);

    client.ws.send(JSON.stringify({
      type: 'subscribed',
      channel,
    }));

    logger.info(`📡 Client ${clientId} subscribed to ${channel}`);
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);

    if (client) {
      // Remove from user sockets
      if (client.userId) {
        const userSockets = this.userSockets.get(client.userId);
        if (userSockets) {
          userSockets.delete(clientId);
          if (userSockets.size === 0) {
            this.userSockets.delete(client.userId);
          }
        }
      }

      this.clients.delete(clientId);
      logger.info(`🔌 WebSocket client disconnected: ${clientId}`);
    }
  }

  setupHeartbeat(clientId) {
    const interval = setInterval(() => {
      const client = this.clients.get(clientId);

      if (!client) {
        clearInterval(interval);
        return;
      }

      // Check if client is still alive
      const timeSinceLastPing = Date.now() - client.lastPing;
      if (timeSinceLastPing > 60000) {
        // No ping for 60 seconds, disconnect
        logger.warn(`⏱️ Client ${clientId} timed out`);
        client.ws.terminate();
        clearInterval(interval);
        return;
      }

      // Send ping
      if (client.ws.readyState === 1) { // WebSocket.OPEN
        client.ws.send(JSON.stringify({ type: 'ping' }));
      }

    }, 30000); // Check every 30 seconds
  }

  // Broadcast to all connected clients
  broadcast(message, excludeClientId = null) {
    const data = JSON.stringify(message);

    for (const [clientId, client] of this.clients) {
      if (clientId !== excludeClientId && client.ws.readyState === 1) {
        client.ws.send(data);
      }
    }
  }

  // Send to specific user
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

  // Send to specific client
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);

    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
    }
  }

  // Get connected clients count
  getClientCount() {
    return this.clients.size;
  }

  // Get connected users count
  getUserCount() {
    return this.userSockets.size;
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      authenticatedUsers: this.userSockets.size,
    };
  }
}

module.exports = WebSocketManager;
