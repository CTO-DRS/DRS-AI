/**
 * Battery Monitor
 * Monitors battery status for Termux/Android
 */

import { createLogger } from '../utils/logger';
import { BatteryInfo, PowerProfile } from '../models/types';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

const logger = createLogger('BatteryMonitor');

export class BatteryMonitor extends EventEmitter {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_INTERVAL = 30000; // 30 seconds
  private powerProfile: PowerProfile = 'balanced';

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Battery Monitor...');
    
    // Check if running on Android/Termux
    const isAndroid = await this.isAndroidEnvironment();
    
    if (isAndroid) {
      logger.info('Android/Termux environment detected');
      this.start();
    } else {
      logger.info('Non-Android environment, battery monitoring limited');
    }
    
    logger.info('✅ Battery Monitor initialized');
  }

  async isAndroidEnvironment(): Promise<boolean> {
    return new Promise((resolve) => {
      const termuxCheck = spawn('which', ['termux-battery-status']);
      
      termuxCheck.on('close', (code) => {
        resolve(code === 0);
      });
      
      termuxCheck.on('error', () => {
        resolve(false);
      });
    });
  }

  start(interval: number = this.DEFAULT_INTERVAL): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.monitoringInterval = setInterval(() => this.collectBatteryInfo(), interval);
    logger.info(`Battery monitoring started (${interval}ms interval)`);
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    logger.info('Battery monitoring stopped');
  }

  private async collectBatteryInfo(): Promise<void> {
    try {
      const info = await this.getBatteryInfo();
      
      // Emit battery info
      this.emit('battery', info);

      // Check for low battery
      if (info.level < 20 && !info.isCharging) {
        this.emit('battery:low', info);
        this.setPowerProfile('powersave');
      }

      // Check for critical battery
      if (info.level < 10 && !info.isCharging) {
        this.emit('battery:critical', info);
      }

      // Restore balanced profile when charging
      if (info.isCharging && this.powerProfile === 'powersave') {
        this.setPowerProfile('balanced');
      }
    } catch (error) {
      logger.error('Failed to collect battery info:', error);
    }
  }

  async getBatteryInfo(): Promise<BatteryInfo> {
    // Try Termux battery status first
    try {
      const termuxInfo = await this.getTermuxBatteryInfo();
      if (termuxInfo) return termuxInfo;
    } catch (error) {
      logger.debug('Termux battery info not available');
    }

    // Fallback to system information
    return this.getFallbackBatteryInfo();
  }

  private async getTermuxBatteryInfo(): Promise<BatteryInfo | null> {
    return new Promise((resolve, reject) => {
      const termuxBattery = spawn('termux-battery-status');
      
      let output = '';
      
      termuxBattery.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      termuxBattery.on('close', (code) => {
        if (code === 0 && output) {
          try {
            const data = JSON.parse(output);
            resolve({
              level: data.percentage,
              isCharging: data.status === 'CHARGING',
              temperature: data.temperature,
              voltage: data.voltage,
              health: data.health,
              technology: data.technology,
              timestamp: Date.now()
            });
          } catch (e) {
            reject(e);
          }
        } else {
          resolve(null);
        }
      });
      
      termuxBattery.on('error', reject);
    });
  }

  private async getFallbackBatteryInfo(): Promise<BatteryInfo> {
    // Return simulated battery info for non-Android environments
    return {
      level: 100,
      isCharging: true,
      temperature: 35,
      timestamp: Date.now()
    };
  }

  /**
   * Set power profile based on battery status
   */
  setPowerProfile(profile: PowerProfile): void {
    if (this.powerProfile === profile) return;

    this.powerProfile = profile;
    logger.info(`Power profile changed to: ${profile}`);

    this.emit('profile:change', profile);

    // Apply profile settings
    this.applyPowerProfile(profile);
  }

  private applyPowerProfile(profile: PowerProfile): void {
    switch (profile) {
      case 'powersave':
        // Reduce CPU frequency, limit background tasks
        logger.info('Applying power save settings');
        break;
      case 'balanced':
        // Normal operation
        logger.info('Applying balanced settings');
        break;
      case 'performance':
        // Maximum performance (when charging)
        logger.info('Applying performance settings');
        break;
    }
  }

  getPowerProfile(): PowerProfile {
    return this.powerProfile;
  }

  /**
   * Get recommended thread count based on power profile
   */
  getRecommendedThreads(): number {
    const cpuCount = require('os').cpus().length;

    switch (this.powerProfile) {
      case 'powersave':
        return Math.max(1, Math.floor(cpuCount / 4));
      case 'balanced':
        return Math.max(1, Math.floor(cpuCount / 2));
      case 'performance':
        return cpuCount;
      default:
        return Math.max(1, Math.floor(cpuCount / 2));
    }
  }

  /**
   * Get recommended batch size for processing
   */
  getRecommendedBatchSize(): number {
    switch (this.powerProfile) {
      case 'powersave':
        return 1;
      case 'balanced':
        return 4;
      case 'performance':
        return 8;
      default:
        return 4;
    }
  }

  isMonitoring(): boolean {
    return this.isRunning;
  }
}
