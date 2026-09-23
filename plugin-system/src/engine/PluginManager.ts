import path from 'path';
import fs from 'fs-extra';
import tar from 'tar';
import { v4 as uuidv4 } from 'uuid';
import { Plugin, PluginManifest, PluginContext, PluginExecutionResult } from '../types';
import PluginSandbox from './PluginSandbox';
import redis from '../utils/redis';
import logger from '../utils/logger';

const PLUGIN_PREFIX = 'plugin:';
const PLUGINS_DIR = process.env.PLUGINS_DIR || './plugins';

export class PluginManager {
  private sandbox: PluginSandbox;
  private loadedPlugins: Map<string, Plugin> = new Map();

  constructor() {
    this.sandbox = new PluginSandbox(PLUGINS_DIR);
    this.initializePluginsDirectory();
  }

  private async initializePluginsDirectory(): Promise<void> {
    await fs.ensureDir(PLUGINS_DIR);
  }

  async installPlugin(pluginArchive: Buffer): Promise<Plugin> {
    const tempDir = path.join(PLUGINS_DIR, `temp-${uuidv4()}`);
    
    try {
      // Extract archive
      await fs.ensureDir(tempDir);
      
      // Write buffer to temp file
      const tempTarPath = path.join(tempDir, 'plugin.tar.gz');
      await fs.writeFile(tempTarPath, pluginArchive);
      
      // Extract
      await tar.extract({
        file: tempTarPath,
        cwd: tempDir
      });

      // Find manifest
      const manifestPath = path.join(tempDir, 'manifest.json');
      if (!await fs.pathExists(manifestPath)) {
        throw new Error('manifest.json not found in plugin archive');
      }

      const manifest: PluginManifest = await fs.readJson(manifestPath);
      this.sandbox.validateManifest(manifest);

      // Check if plugin already exists
      const existingPlugin = await this.getPlugin(manifest.id);
      if (existingPlugin) {
        throw new Error(`Plugin ${manifest.id} is already installed`);
      }

      // Move to plugins directory
      const pluginDir = path.join(PLUGINS_DIR, manifest.id);
      await fs.move(tempDir, pluginDir, { overwrite: true });

      // Create plugin record
      const plugin: Plugin = {
        id: manifest.id,
        manifest,
        enabled: false,
        installedAt: new Date(),
        updatedAt: new Date(),
        config: {}
      };

      await this.savePlugin(plugin);

      logger.info(`Plugin installed: ${manifest.name} (${manifest.id})`);
      return plugin;
    } catch (error: any) {
      // Cleanup temp directory
      await fs.remove(tempDir);
      throw error;
    }
  }

  async uninstallPlugin(pluginId: string): Promise<void> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    // Disable first
    if (plugin.enabled) {
      await this.disablePlugin(pluginId);
    }

    // Remove from storage
    await redis.del(`${PLUGIN_PREFIX}${pluginId}`);

    // Remove files
    const pluginDir = path.join(PLUGINS_DIR, pluginId);
    await fs.remove(pluginDir);

    this.loadedPlugins.delete(pluginId);

    logger.info(`Plugin uninstalled: ${pluginId}`);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    if (plugin.enabled) {
      return;
    }

    // Load plugin instance
    const pluginDir = path.join(PLUGINS_DIR, pluginId);
    
    if (plugin.manifest.language === 'python') {
      plugin.instance = await this.sandbox.loadPythonPlugin(plugin.manifest, pluginDir);
    } else {
      plugin.instance = await this.sandbox.loadJavaScriptPlugin(plugin.manifest, pluginDir);
    }

    plugin.enabled = true;
    plugin.updatedAt = new Date();
    await this.savePlugin(plugin);
    this.loadedPlugins.set(pluginId, plugin);

    logger.info(`Plugin enabled: ${plugin.manifest.name} (${pluginId})`);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    if (!plugin.enabled) {
      return;
    }

    // Destroy instance
    if (plugin.instance?.destroy) {
      await plugin.instance.destroy();
    }

    plugin.enabled = false;
    plugin.instance = undefined;
    plugin.updatedAt = new Date();
    await this.savePlugin(plugin);
    this.loadedPlugins.delete(pluginId);

    logger.info(`Plugin disabled: ${plugin.manifest.name} (${pluginId})`);
  }

  async executePlugin(
    pluginId: string,
    input: any,
    userId?: string
  ): Promise<PluginExecutionResult> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    if (!plugin.enabled) {
      throw new Error('Plugin is not enabled');
    }

    const context: PluginContext = {
      pluginId,
      userId,
      permissions: plugin.manifest.permissions,
      services: {
        memory: {},
        agents: {},
        models: {},
        notifications: {}
      },
      logger: {
        info: (msg, meta) => logger.info(`[${pluginId}] ${msg}`, meta),
        error: (msg, meta) => logger.error(`[${pluginId}] ${msg}`, meta),
        warn: (msg, meta) => logger.warn(`[${pluginId}] ${msg}`, meta),
        debug: (msg, meta) => logger.debug(`[${pluginId}] ${msg}`, meta)
      }
    };

    return this.sandbox.executePlugin(pluginId, plugin.manifest, input, context);
  }

  async getPlugin(pluginId: string): Promise<Plugin | null> {
    // Check memory cache
    const loadedPlugin = this.loadedPlugins.get(pluginId);
    if (loadedPlugin) {
      return loadedPlugin;
    }

    // Check Redis
    const data = await redis.get(`${PLUGIN_PREFIX}${pluginId}`);
    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  async getAllPlugins(): Promise<Plugin[]> {
    const keys = await redis.keys(`${PLUGIN_PREFIX}*`);
    const plugins: Plugin[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        plugins.push(JSON.parse(data));
      }
    }

    return plugins;
  }

  async updatePluginConfig(pluginId: string, config: Record<string, any>): Promise<Plugin> {
    const plugin = await this.getPlugin(pluginId);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    plugin.config = { ...plugin.config, ...config };
    plugin.updatedAt = new Date();
    await this.savePlugin(plugin);

    return plugin;
  }

  private async savePlugin(plugin: Plugin): Promise<void> {
    await redis.setex(
      `${PLUGIN_PREFIX}${plugin.id}`,
      86400 * 30,
      JSON.stringify(plugin)
    );
  }

  async loadEnabledPlugins(): Promise<void> {
    const plugins = await this.getAllPlugins();
    
    for (const plugin of plugins) {
      if (plugin.enabled) {
        try {
          await this.enablePlugin(plugin.id);
        } catch (error: any) {
          logger.error(`Failed to load plugin ${plugin.id}:`, error);
        }
      }
    }
  }
}

export default new PluginManager();
