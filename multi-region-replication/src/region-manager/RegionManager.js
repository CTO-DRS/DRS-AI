/**
 * Region Manager
 *
 * Tracks all DRS AI regions participating in the global active-active cluster.
 *
 * A region is identified by a code (e.g. 'ksa-central', 'eu-west-1') and has:
 *   - Address (gateway URL)
 *   - Latency from local region (measured continuously)
 *   - Health status
 *   - Capacity (available CPU/memory)
 *   - Geographic coordinates (for proximity-based routing)
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const LATENCY_CHECK_INTERVAL = Number(process.env.REGION_LATENCY_INTERVAL || 30000); // 30s

class RegionManager {
  constructor() {
    this.isInitialized = false;
    this.regions = new Map();
    this.localRegion = process.env.DRS_REGION || 'default';
    this.timer = null;
  }

  async initialize() {
    logger.info(`🌍 Initializing Region Manager (local=${this.localRegion})...`);
    await redis.init();
    await this.loadFromRedis();
    // Ensure local region is always present
    if (!this.regions.has(this.localRegion)) {
      await this.register({
        code: this.localRegion,
        name: this.localRegion,
        gatewayUrl: process.env.LOCAL_GATEWAY_URL || 'http://gateway:3000',
        role: 'active',
      });
    }
    this.timer = setInterval(() => this.measureLatencies().catch((e) => logger.error('measure', e)), LATENCY_CHECK_INTERVAL);
    this.isInitialized = true;
    logger.info(`✅ Region Manager initialized — ${this.regions.size} region(s)`);
  }

  async loadFromRedis() {
    const all = await redis.hgetall('drs:mr:regions');
    for (const [code, raw] of Object.entries(all || {})) {
      try { this.regions.set(code, JSON.parse(raw)); } catch {}
    }
  }

  async register({ code, name, gatewayUrl, role = 'active', lat, lon }) {
    if (!code || !gatewayUrl) throw new Error('code and gatewayUrl are required');
    const existing = this.regions.get(code);
    const region = {
      code,
      name: name || code,
      gatewayUrl,
      role,
      lat: Number(lat) || null,
      lon: Number(lon) || null,
      registeredAt: existing?.registeredAt || new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      latency: existing?.latency || null,
      health: existing?.health || 'unknown',
      capacity: existing?.capacity || { cpu: 0, memoryMb: 0 },
    };
    this.regions.set(code, region);
    await redis.hset('drs:mr:regions', code, JSON.stringify(region));
    logger.info(`➕ Region registered: ${code} (${gatewayUrl})`);
    return region;
  }

  async heartbeat(code, payload = {}) {
    const region = this.regions.get(code);
    if (!region) throw new Error(`Unknown region: ${code}`);
    region.lastHeartbeat = new Date().toISOString();
    if (payload.capacity) region.capacity = { ...region.capacity, ...payload.capacity };
    if (payload.health) region.health = payload.health;
    await redis.hset('drs:mr:regions', code, JSON.stringify(region));
    return region;
  }

  async deregister(code) {
    const region = this.regions.get(code);
    if (!region) return null;
    this.regions.delete(code);
    await redis.hdel('drs:mr:regions', code);
    return region;
  }

  async measureLatencies() {
    for (const region of this.regions.values()) {
      if (region.code === this.localRegion) {
        region.latency = 0;
        region.health = 'healthy';
        continue;
      }
      const start = Date.now();
      try {
        await axios.get(`${region.gatewayUrl}/health`, { timeout: 5000 });
        region.latency = Date.now() - start;
        region.health = 'healthy';
      } catch (err) {
        region.latency = null;
        region.health = err.code === 'ECONNABORTED' ? 'slow' : 'unreachable';
      }
      await redis.hset('drs:mr:regions', region.code, JSON.stringify(region));
    }
    logger.info(`📊 Latency measurement: ${this.regions.size} regions checked`);
  }

  list() { return Array.from(this.regions.values()); }
  get(code) { return this.regions.get(code); }
  getLocal() { return this.regions.get(this.localRegion); }

  /**
   * Find the best region for a user request based on:
   *   - Geographic proximity (haversine distance)
   *   - Current latency
   *   - Health status
   */
  findBestRegion({ lat, lon } = {}) {
    const healthy = this.list().filter((r) => r.health === 'healthy');
    if (healthy.length === 0) return null;

    // If user provided coordinates, factor in distance
    if (lat != null && lon != null) {
      return healthy.sort((a, b) => {
        const dA = a.lat != null ? this.haversine(lat, lon, a.lat, a.lon) : 1e9;
        const dB = b.lat != null ? this.haversine(lat, lon, b.lat, b.lon) : 1e9;
        return dA - dB;
      })[0];
    }

    // Otherwise pick lowest latency
    return healthy.sort((a, b) => (a.latency || 1e9) - (b.latency || 1e9))[0];
  }

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.isInitialized = false;
    logger.info('🛑 Region Manager stopped');
  }
}

module.exports = RegionManager;
