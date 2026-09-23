import { NodeVM } from 'vm2';
import { PythonShell } from 'python-shell';
import path from 'path';
import fs from 'fs-extra';
import { PluginManifest, PluginContext, PluginExecutionResult, PluginInstance } from '../types';
import logger from '../utils/logger';

export class PluginSandbox {
  private pluginsDir: string;

  constructor(pluginsDir: string = process.env.PLUGINS_DIR || './plugins') {
    this.pluginsDir = pluginsDir;
  }

  async loadJavaScriptPlugin(manifest: PluginManifest, pluginPath: string): Promise<PluginInstance> {
    const entryPath = path.join(pluginPath, manifest.entry);
    
    if (!await fs.pathExists(entryPath)) {
      throw new Error(`Entry file not found: ${entryPath}`);
    }

    const code = await fs.readFile(entryPath, 'utf-8');

    // Create sandboxed VM
    const vm = new NodeVM({
      console: 'inherit',
      sandbox: {},
      require: {
        external: ['axios', 'lodash', 'moment'],
        builtin: ['path', 'url', 'querystring', 'crypto'],
        root: pluginPath,
        mock: {
          fs: this.createFsMock(manifest.permissions),
          child_process: {},
          http: {},
          https: {}
        }
      },
      timeout: 30000,
      wrapper: 'commonjs'
    });

    try {
      const pluginModule = vm.run(code, entryPath);
      
      return {
        execute: async (input: any, context: PluginContext) => {
          try {
            if (typeof pluginModule.execute === 'function') {
              return await pluginModule.execute(input, context);
            } else if (typeof pluginModule.default?.execute === 'function') {
              return await pluginModule.default.execute(input, context);
            } else {
              throw new Error('Plugin does not export an execute function');
            }
          } catch (error: any) {
            context.logger.error('Plugin execution error:', error);
            throw error;
          }
        },
        destroy: async () => {
          if (typeof pluginModule.destroy === 'function') {
            await pluginModule.destroy();
          }
        }
      };
    } catch (error: any) {
      logger.error('Failed to load JavaScript plugin:', error);
      throw error;
    }
  }

  async loadPythonPlugin(manifest: PluginManifest, pluginPath: string): Promise<PluginInstance> {
    const entryPath = path.join(pluginPath, manifest.entry);
    
    if (!await fs.pathExists(entryPath)) {
      throw new Error(`Entry file not found: ${entryPath}`);
    }

    return {
      execute: async (input: any, context: PluginContext) => {
        try {
          const options = {
            mode: 'json' as const,
            pythonPath: 'python3',
            pythonOptions: ['-u'],
            scriptPath: pluginPath,
            args: [JSON.stringify(input), JSON.stringify({
              pluginId: context.pluginId,
              userId: context.userId
            })]
          };

          const results = await PythonShell.run(manifest.entry, options);
          return results[0];
        } catch (error: any) {
          context.logger.error('Python plugin execution error:', error);
          throw error;
        }
      }
    };
  }

  async executePlugin(
    pluginId: string,
    manifest: PluginManifest,
    input: any,
    context: PluginContext
  ): Promise<PluginExecutionResult> {
    const startTime = Date.now();
    const pluginPath = path.join(this.pluginsDir, pluginId);

    try {
      let instance: PluginInstance;

      if (manifest.language === 'python') {
        instance = await this.loadPythonPlugin(manifest, pluginPath);
      } else {
        instance = await this.loadJavaScriptPlugin(manifest, pluginPath);
      }

      const output = await instance.execute(input, context);

      return {
        success: true,
        output,
        executionTime: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  private createFsMock(permissions: string[]) {
    const canRead = permissions.includes('filesystem:read');
    const canWrite = permissions.includes('filesystem:write');

    return {
      readFile: canRead ? fs.readFile : () => { throw new Error('Permission denied'); },
      writeFile: canWrite ? fs.writeFile : () => { throw new Error('Permission denied'); },
      readFileSync: canRead ? fs.readFileSync : () => { throw new Error('Permission denied'); },
      writeFileSync: canWrite ? fs.writeFileSync : () => { throw new Error('Permission denied'); },
      existsSync: fs.existsSync,
      stat: canRead ? fs.stat : () => { throw new Error('Permission denied'); },
      readdir: canRead ? fs.readdir : () => { throw new Error('Permission denied'); }
    };
  }

  validateManifest(manifest: any): manifest is PluginManifest {
    const required = ['id', 'name', 'version', 'description', 'author', 'entry', 'language', 'permissions'];
    
    for (const field of required) {
      if (!manifest[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!['javascript', 'typescript', 'python'].includes(manifest.language)) {
      throw new Error('Invalid language. Must be javascript, typescript, or python');
    }

    return true;
  }
}

export default PluginSandbox;
