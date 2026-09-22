/**
 * Smart Glasses Service
 *
 * Integration with Ray-Ban Meta and compatible smart glasses:
 * - Camera stream processing
 * - Audio input/output
 * - Touch/tap gesture handling
 * - Display overlay management
 * - Battery & connectivity monitoring
 *
 * @class SmartGlassesService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class SmartGlassesService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.arService = options.arService;
    this.voiceService = options.voiceService;
    this.gestureService = options.gestureService;
    this.wsManager = options.wsManager;
    this.redis = null;
    this.isInitialized = false;
    this.connectedGlasses = new Map();
    this.displayOverlays = new Map();
  }

  async initialize() {
    try {
      logger.info('🥽 Initializing Smart Glasses Service...');
      this.redis = await getRedisClient();
      this.isInitialized = true;
      logger.info('✅ Smart Glasses Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Smart Glasses:', error);
      throw error;
    }
  }

  /**
   * Connect smart glasses
   * @param {Object} config - Glasses configuration
   * @returns {Promise<Object>} Connection result
   */
  async connect(config) {
    const connectionId = uuidv4();
    const glasses = {
      id: connectionId,
      userId: config.userId,
      model: config.model || 'rayban-meta', // rayban-meta, meta-orion, custom
      firmwareVersion: config.firmwareVersion || '1.0.0',
      connectionType: config.connectionType || 'bluetooth_le', // bluetooth_le, wifi
      status: 'connecting',
      batteryLevel: 100,
      features: {
        camera: true,
        microphone: true,
        speakers: true,
        touchSensor: true,
        display: config.model !== 'rayban-meta', // Ray-Ban Meta has no display
      },
      connectedAt: Date.now(),
    };

    // Simulate connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    glasses.status = 'connected';

    this.connectedGlasses.set(connectionId, glasses);

    // Start AR session if camera available
    if (glasses.features.camera && this.arService) {
      const arSession = await this.arService.startSession({
        userId: config.userId,
        deviceType: 'glasses',
      });
      glasses.arSessionId = arSession.sessionId;
    }

    // Start voice session if microphone available
    if (glasses.features.microphone && this.voiceService) {
      const voiceSession = this.voiceService.startSession({
        userId: config.userId,
        wakeWordEnabled: true,
      });
      glasses.voiceSessionId = voiceSession.sessionId;
    }

    logger.info(`🥽 Glasses connected: ${connectionId} (${glasses.model})`);

    this.emit('glasses:connected', { connectionId, model: glasses.model });

    return {
      connectionId,
      status: 'connected',
      model: glasses.model,
      features: glasses.features,
      sessions: {
        ar: glasses.arSessionId || null,
        voice: glasses.voiceSessionId || null,
      },
    };
  }

  /**
   * Handle tap/touch gesture from glasses
   * @param {string} connectionId - Glasses connection ID
   * @param {Object} gesture - Gesture data
   * @returns {Promise<Object>} Action result
   */
  async handleTapGesture(connectionId, gesture) {
    const glasses = this.connectedGlasses.get(connectionId);
    if (!glasses) throw new Error('Glasses not connected');

    const tapType = gesture.type; // single, double, triple, long
    const side = gesture.side; // left, right

    logger.info(`👆 Tap: ${tapType} on ${side} side`);

    const actions = {
      single_left: { action: 'play_pause', description: 'Play/Pause audio' },
      single_right: { action: 'activate_ai', description: 'Activate AI assistant' },
      double_left: { action: 'previous', description: 'Previous track/item' },
      double_right: { action: 'next', description: 'Next track/item' },
      triple_left: { action: 'volume_down', description: 'Decrease volume' },
      triple_right: { action: 'volume_up', description: 'Increase volume' },
      long_left: { action: 'dismiss', description: 'Dismiss current overlay' },
      long_right: { action: 'capture', description: 'Capture photo/video' },
    };

    const actionKey = `${tapType}_${side}`;
    const action = actions[actionKey] || { action: 'unknown', description: 'Unknown gesture' };

    // Broadcast to WebSocket
    if (this.wsManager) {
      this.wsManager.sendToUser(glasses.userId, {
        type: 'glasses:tap',
        data: { connectionId, gesture, action },
      });
    }

    return {
      connectionId,
      gesture: actionKey,
      action: action.action,
      description: action.description,
    };
  }

  /**
   * Send display overlay to glasses
   * @param {string} connectionId - Glasses connection ID
   * @param {Object} overlay - Overlay content
   * @returns {Promise<Object>} Overlay result
   */
  async sendOverlay(connectionId, overlay) {
    const glasses = this.connectedGlasses.get(connectionId);
    if (!glasses) throw new Error('Glasses not connected');
    if (!glasses.features.display) {
      return { status: 'no_display', message: 'These glasses do not support display overlays' };
    }

    const overlayId = uuidv4();
    const overlayData = {
      id: overlayId,
      type: overlay.type || 'text', // text, card, navigation, translation, alert
      content: overlay.content,
      position: overlay.position || 'center', // center, top, bottom, left, right
      duration: overlay.duration || 5000,
      priority: overlay.priority || 'normal', // low, normal, high, critical
      createdAt: Date.now(),
    };

    this.displayOverlays.set(overlayId, overlayData);

    // Send via WebSocket
    if (this.wsManager) {
      this.wsManager.sendToUser(glasses.userId, {
        type: 'glasses:overlay',
        data: { connectionId, overlay: overlayData },
      });
    }

    // Auto-dismiss after duration
    if (overlayData.duration > 0) {
      setTimeout(() => {
        this.dismissOverlay(connectionId, overlayId);
      }, overlayData.duration);
    }

    return { overlayId, status: 'displayed' };
  }

  /**
   * Dismiss an overlay
   * @param {string} connectionId - Glasses connection ID
   * @param {string} overlayId - Overlay ID
   */
  async dismissOverlay(connectionId, overlayId) {
    this.displayOverlays.delete(overlayId);
    return { overlayId, status: 'dismissed' };
  }

  /**
   * Process camera frame from glasses
   * @param {string} connectionId - Glasses connection ID
   * @param {Buffer} frameData - Camera frame
   * @param {Object} metadata - Frame metadata
   * @returns {Promise<Object>} Processing result
   */
  async processCameraFrame(connectionId, frameData, metadata) {
    const glasses = this.connectedGlasses.get(connectionId);
    if (!glasses) throw new Error('Glasses not connected');
    if (!glasses.features.camera) throw new Error('Camera not available');

    // Process through AR service
    if (this.arService && glasses.arSessionId) {
      const arResult = await this.arService.processFrame(
        glasses.arSessionId,
        frameData,
        {
          ...metadata,
          requestedOverlays: metadata.requestedOverlays || ['object_recognition', 'text_translation'],
        }
      );

      // Send overlays to glasses display
      if (glasses.features.display && arResult.overlays.length > 0) {
        for (const overlay of arResult.overlays) {
          await this.sendOverlay(connectionId, {
            type: overlay.type === 'object' ? 'card' : 'translation',
            content: overlay,
            position: 'bottom',
            duration: 3000,
          });
        }
      }

      return arResult;
    }

    return { status: 'processed', overlays: [] };
  }

  /**
   * Get glasses status
   * @param {string} connectionId - Glasses connection ID
   * @returns {Object} Status
   */
  getStatus(connectionId) {
    const glasses = this.connectedGlasses.get(connectionId);
    if (!glasses) return null;

    return {
      id: glasses.id,
      status: glasses.status,
      batteryLevel: glasses.batteryLevel,
      model: glasses.model,
      features: glasses.features,
      connectedAt: glasses.connectedAt,
      activeOverlays: Array.from(this.displayOverlays.values()).filter(
        o => o.createdAt > Date.now() - 30000
      ).length,
    };
  }

  /**
   * Disconnect glasses
   * @param {string} connectionId - Glasses connection ID
   */
  async disconnect(connectionId) {
    const glasses = this.connectedGlasses.get(connectionId);
    if (!glasses) return { status: 'not_found' };

    // End AR session
    if (glasses.arSessionId && this.arService) {
      await this.arService.endSession(glasses.arSessionId);
    }

    // End voice session
    if (glasses.voiceSessionId && this.voiceService) {
      this.voiceService.endSession(glasses.voiceSessionId);
    }

    glasses.status = 'disconnected';
    this.connectedGlasses.delete(connectionId);

    logger.info(`🥽 Glasses disconnected: ${connectionId}`);

    return { connectionId, status: 'disconnected' };
  }

  getStats() {
    return {
      connectedGlasses: this.connectedGlasses.size,
      activeOverlays: this.displayOverlays.size,
      supportedModels: ['rayban-meta', 'meta-orion', 'custom'],
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Smart Glasses Service...');
    for (const [id] of this.connectedGlasses) {
      await this.disconnect(id);
    }
    this.displayOverlays.clear();
    if (this.redis) await this.redis.quit();
    logger.info('✅ Smart Glasses Service shutdown complete');
  }
}

module.exports = SmartGlassesService;
