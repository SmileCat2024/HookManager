/**
 * ConfigManager - Manages JSON configuration for global and project-level hooks
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';

import {
  GlobalConfig,
  ProjectConfig,
  MergedConfig,
  HookConfig,
  ConfigError,
  LogLevel,
} from '../types';

import { Logger } from '../logging/logger';

// Zod schemas for validation
const HookConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  enabled: z.boolean(),
  events: z.array(z.string()).min(1),
  matcher: z.string().optional(),
  handler: z.object({
    type: z.enum(['command', 'script', 'module', 'programmatic']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    shell: z.string().optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    path: z.string().optional(),
    module: z.string().optional(),
    function: z.string().optional(),
    handler: z.function().optional(),
    timeout: z.number().optional(),
    retry: z.number().optional(),
  }),
  filter: z.object({
    tools: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    patterns: z.array(z.string()).optional(),
    users: z.array(z.string()).optional(),
    projects: z.array(z.string()).optional(),
    environments: z.array(z.string()).optional(),
  }).optional(),
  priority: z.number().min(0).max(1000),
  metadata: z.record(z.any()).optional(),
  timeout: z.number().optional(),
  retry: z.number().optional(),
  continueOnError: z.boolean().optional(),
  exitCodeBlocking: z.array(z.number()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const GlobalConfigSchema = z.object({
  version: z.string(),
  hooks: z.array(HookConfigSchema),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'silent']),
  logPath: z.string(),
  logRotation: z.object({
    enabled: z.boolean(),
    maxSize: z.number(),
    maxFiles: z.number(),
    retentionDays: z.number(),
  }),
  execution: z.object({
    defaultTimeout: z.number(),
    defaultRetry: z.number(),
    parallel: z.boolean(),
    maxParallel: z.number(),
  }),
  security: z.object({
    validateCommands: z.boolean(),
    allowedCommands: z.array(z.string()).optional(),
    blockedCommands: z.array(z.string()).optional(),
    sandboxMode: z.boolean(),
  }),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastSync: z.string().datetime().optional(),
  }),
});

const ProjectConfigSchema = z.object({
  version: z.string(),
  hooks: z.array(HookConfigSchema),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
  logPath: z.string().optional(),
  execution: z.object({
    defaultTimeout: z.number().optional(),
    defaultRetry: z.number().optional(),
    parallel: z.boolean().optional(),
    maxParallel: z.number().optional(),
  }).optional(),
  excludeGlobalHooks: z.array(z.string()).optional(),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastSync: z.string().datetime().optional(),
  }),
});

export interface ConfigManagerOptions {
  globalPath: string;
  projectPath: string;
  logger: Logger;
  isGlobal?: boolean;
}

export class ConfigManager {
  private globalPath: string;
  private projectPath: string;
  private logger: Logger;
  private globalConfig: GlobalConfig | null = null;
  private projectConfig: ProjectConfig | null = null;
  private mergedConfig: MergedConfig | null = null;

  constructor(options: ConfigManagerOptions) {
    this.globalPath = this.resolvePath(options.globalPath);
    this.projectPath = this.resolvePath(options.projectPath);
    this.logger = options.logger;
  }

  /**
   * Resolve path (expand ~ to home directory)
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('~')) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
  }

  /**
   * Load configuration from disk
   */
  async load(): Promise<void> {
    try {
      this.logger.debug('Loading configuration...');

      // Load global config
      this.globalConfig = await this.loadGlobalConfig();
      this.logger.debug(`Loaded global config from ${this.globalPath}`);

      // Load project config
      this.projectConfig = await this.loadProjectConfig();
      if (this.projectConfig) {
        this.logger.debug(`Loaded project config from ${this.projectPath}`);
      }

      // Merge configurations
      this.mergedConfig = this.mergeConfigs();
      this.logger.debug('Configuration merged successfully');
    } catch (error) {
      this.logger.error('Failed to load configuration', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Load global configuration
   */
  private async loadGlobalConfig(): Promise<GlobalConfig> {
    const configPath = path.join(this.globalPath, 'config.json');

    if (await fs.pathExists(configPath)) {
      const data = await fs.readJson(configPath);
      const validated = GlobalConfigSchema.parse(data);
      return validated as GlobalConfig;
    }

    // Create default global config
    const defaultConfig: GlobalConfig = {
      version: '1.0.0',
      hooks: [],
      logLevel: 'info' as const,
      logPath: path.join(this.globalPath, 'logs', 'hookmanager.log'),
      logRotation: {
        enabled: true,
        maxSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
        retentionDays: 30,
      },
      execution: {
        defaultTimeout: 30000,
        defaultRetry: 0,
        parallel: false,
        maxParallel: 5,
      },
      security: {
        validateCommands: true,
        allowedCommands: undefined,
        blockedCommands: ['rm -rf', 'del /f', 'sudo'],
        sandboxMode: false,
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    // Ensure directory exists
    await fs.ensureDir(this.globalPath);
    await fs.writeJson(configPath, defaultConfig, { spaces: 2 });

    return defaultConfig;
  }

  /**
   * Load project configuration
   */
  private async loadProjectConfig(): Promise<ProjectConfig | null> {
    const projectHooksDir = path.join(this.projectPath, '.claude', 'hooks', 'hookmanager');
    const configPath = path.join(projectHooksDir, 'config.json');

    // Ensure the project hooks directory exists
    await fs.ensureDir(projectHooksDir);

    if (await fs.pathExists(configPath)) {
      const data = await fs.readJson(configPath);
      const validated = ProjectConfigSchema.parse(data);
      return validated as ProjectConfig;
    }

    return null;
  }

  /**
   * Merge global and project configurations
   */
  private mergeConfigs(): MergedConfig {
    if (!this.globalConfig) {
      throw new ConfigError('Global config not loaded');
    }

    const merged: MergedConfig = {
      ...this.globalConfig,
      projectHooks: [],
      excludedHooks: [],
    };

    if (this.projectConfig) {
      // Merge project hooks
      if (this.projectConfig.hooks && this.projectConfig.hooks.length > 0) {
        merged.projectHooks = this.projectConfig.hooks;
      }

      // Exclude hooks if specified
      if (this.projectConfig.excludeGlobalHooks) {
        merged.excludedHooks = this.projectConfig.excludeGlobalHooks;
      }

      // Override execution settings if specified
      if (this.projectConfig.execution) {
        merged.execution = {
          ...merged.execution,
          ...this.projectConfig.execution,
        };
      }

      // Override log level if specified
      if (this.projectConfig.logLevel) {
        merged.logLevel = this.projectConfig.logLevel;
      }

      // Override log path if specified
      if (this.projectConfig.logPath) {
        merged.logPath = this.projectConfig.logPath;
      }
    }

    // Filter out excluded hooks
    if (merged.excludedHooks && merged.excludedHooks.length > 0) {
      merged.hooks = merged.hooks.filter(
        (hook) => !merged.excludedHooks!.includes(hook.id)
      );
    }

    return merged;
  }

  /**
   * Save configuration to disk
   */
  async save(): Promise<void> {
    try {
      this.logger.debug('Saving configuration...');

      // Save global config
      if (this.globalConfig) {
        const globalConfigPath = path.join(this.globalPath, 'config.json');
        await fs.ensureDir(this.globalPath);
        await fs.writeJson(globalConfigPath, this.globalConfig, { spaces: 2 });
        this.logger.debug(`Saved global config to ${globalConfigPath}`);
      }

      // Save project config
      if (this.projectConfig) {
        const projectConfigPath = path.join(this.projectPath, '.claude', 'hooks', 'hookmanager', 'config.json');
        await fs.ensureDir(path.dirname(projectConfigPath));
        await fs.writeJson(projectConfigPath, this.projectConfig, { spaces: 2 });
        this.logger.debug(`Saved project config to ${projectConfigPath}`);
      }

      // Update merged config
      this.mergedConfig = this.mergeConfigs();
    } catch (error) {
      this.logger.error('Failed to save configuration', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Add a new hook to configuration
   */
  async addHook(hookConfig: any, isGlobal: boolean = false): Promise<void> {
    // Validate hook config
    const validated = HookConfigSchema.parse({
      ...hookConfig,
      id: hookConfig.id || this.generateId(),
      createdAt: hookConfig.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }) as HookConfig;

    if (isGlobal) {
      // Add to global config
      if (!this.globalConfig) {
        throw new ConfigError('Global config not loaded');
      }
      this.globalConfig.hooks.push(validated);
      this.globalConfig.metadata.updatedAt = new Date().toISOString();
    } else {
      // Add to project config
      if (!this.projectConfig) {
        // Initialize project config if it doesn't exist
        this.projectConfig = {
          version: '1.0.0',
          hooks: [],
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      }
      this.projectConfig.hooks.push(validated);
      this.projectConfig.metadata.updatedAt = new Date().toISOString();
    }

    // Update merged config
    this.mergedConfig = this.mergeConfigs();

    await this.save();
    this.logger.info(`Added hook: ${validated.name} (${validated.id}) to ${isGlobal ? 'global' : 'project'} config`);
  }

  /**
   * Remove a hook from configuration
   */
  async removeHook(hookId: string, isGlobal: boolean = false): Promise<void> {
    let hookName: string | undefined;
    let removed = false;

    if (isGlobal) {
      // Remove from global config
      if (!this.globalConfig) {
        throw new ConfigError('Global config not loaded');
      }

      const index = this.globalConfig.hooks.findIndex((hook) => hook.id === hookId);
      if (index === -1) {
        throw new ConfigError(`Hook not found in global config: ${hookId}`);
      }

      hookName = this.globalConfig.hooks[index].name;
      this.globalConfig.hooks.splice(index, 1);
      this.globalConfig.metadata.updatedAt = new Date().toISOString();
      removed = true;
    } else {
      // Remove from project config
      if (!this.projectConfig) {
        throw new ConfigError('Project config not loaded');
      }

      const index = this.projectConfig.hooks.findIndex((hook) => hook.id === hookId);
      if (index === -1) {
        throw new ConfigError(`Hook not found in project config: ${hookId}`);
      }

      hookName = this.projectConfig.hooks[index].name;
      this.projectConfig.hooks.splice(index, 1);
      this.projectConfig.metadata.updatedAt = new Date().toISOString();
      removed = true;
    }

    if (removed) {
      // Update merged config
      this.mergedConfig = this.mergeConfigs();
      await this.save();
      this.logger.info(`Removed hook: ${hookName} (${hookId}) from ${isGlobal ? 'global' : 'project'} config`);
    }
  }

  /**
   * Update a hook in configuration
   */
  async updateHook(hookId: string, updates: Partial<any>, isGlobal: boolean = false): Promise<void> {
    let hook: HookConfig | undefined;

    if (isGlobal) {
      // Update in global config
      if (!this.globalConfig) {
        throw new ConfigError('Global config not loaded');
      }

      hook = this.globalConfig.hooks.find((h) => h.id === hookId);
      if (!hook) {
        throw new ConfigError(`Hook not found in global config: ${hookId}`);
      }

      // Update hook
      Object.assign(hook, updates);
      hook.updatedAt = new Date().toISOString();

      // Validate updated hook
      HookConfigSchema.parse(hook);

      this.globalConfig.metadata.updatedAt = new Date().toISOString();
    } else {
      // Update in project config
      if (!this.projectConfig) {
        throw new ConfigError('Project config not loaded');
      }

      hook = this.projectConfig.hooks.find((h) => h.id === hookId);
      if (!hook) {
        throw new ConfigError(`Hook not found in project config: ${hookId}`);
      }

      // Update hook
      Object.assign(hook, updates);
      hook.updatedAt = new Date().toISOString();

      // Validate updated hook
      HookConfigSchema.parse(hook);

      this.projectConfig.metadata.updatedAt = new Date().toISOString();
    }

    // Update merged config
    this.mergedConfig = this.mergeConfigs();

    await this.save();
    this.logger.info(`Updated hook: ${hook.name} (${hookId}) in ${isGlobal ? 'global' : 'project'} config`);
  }

  /**
   * Clear all hooks from configuration
   */
  async clearHooks(): Promise<void> {
    if (!this.globalConfig) {
      throw new ConfigError('Global config not loaded');
    }

    this.globalConfig.hooks = [];
    this.globalConfig.metadata.updatedAt = new Date().toISOString();

    // Update merged config
    this.mergedConfig = this.mergeConfigs();

    await this.save();
    this.logger.info('All hooks cleared from configuration');
  }

  /**
   * Get merged configuration
   */
  getMergedConfig(): MergedConfig {
    if (!this.mergedConfig) {
      throw new ConfigError('Merged config not available. Call load() first.');
    }
    return this.mergedConfig;
  }

  /**
   * Get global configuration
   */
  getGlobalConfig(): GlobalConfig | null {
    return this.globalConfig;
  }

  /**
   * Get project configuration
   */
  getProjectConfig(): ProjectConfig | null {
    return this.projectConfig;
  }

  /**
   * Export configuration
   */
  async export(format: 'json' | 'yaml' = 'json'): Promise<string> {
    const config = this.getMergedConfig();

    if (format === 'json') {
      return JSON.stringify(config, null, 2);
    }

    // YAML export (simple implementation)
    // Note: yaml package is optional dependency
    try {
      const yaml = require('yaml');
      return yaml.stringify(config);
    } catch {
      // Fallback to JSON if yaml is not available
      return JSON.stringify(config, null, 2);
    }
  }

  /**
   * Import configuration
   */
  async import(data: string, format: 'json' | 'yaml' = 'json'): Promise<void> {
    try {
      let parsed: any;

      if (format === 'json') {
        parsed = JSON.parse(data);
      } else {
        // Note: yaml package is optional dependency
        try {
          const yaml = require('yaml');
          parsed = yaml.parse(data);
        } catch {
          throw new ConfigError('YAML format requires yaml package to be installed');
        }
      }

      // Validate based on format
      if (parsed.hooks && parsed.execution) {
        // Looks like global config
        const validated = GlobalConfigSchema.parse(parsed);
        this.globalConfig = validated as unknown as GlobalConfig;
      } else if (parsed.hooks) {
        // Looks like project config
        const validated = ProjectConfigSchema.parse(parsed);
        this.projectConfig = validated as unknown as ProjectConfig;
      } else {
        throw new ConfigError('Invalid configuration format');
      }

      // Merge and save
      this.mergedConfig = this.mergeConfigs();
      await this.save();

      this.logger.info('Configuration imported successfully');
    } catch (error) {
      throw new ConfigError(`Failed to import configuration: ${(error as Error).message}`);
    }
  }

  /**
   * Validate configuration
   */
  async validate(): Promise<any> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Validate global config
      if (this.globalConfig) {
        GlobalConfigSchema.parse(this.globalConfig);
      }

      // Validate project config
      if (this.projectConfig) {
        ProjectConfigSchema.parse(this.projectConfig);
      }

      // Check for common issues
      const config = this.getMergedConfig();
      const allHooks = [...config.hooks, ...(config.projectHooks || [])];

      // Check for duplicate hook names
      const names = new Set<string>();
      for (const hook of allHooks) {
        if (names.has(hook.name)) {
          errors.push(`Duplicate hook name: ${hook.name}`);
        }
        names.add(hook.name);
      }

      // Check for hooks with no events
      for (const hook of allHooks) {
        if (!hook.events || hook.events.length === 0) {
          errors.push(`Hook ${hook.name} has no events`);
        }
      }

      // Check for hooks with invalid priority
      for (const hook of allHooks) {
        if (hook.priority < 0 || hook.priority > 1000) {
          warnings.push(`Hook ${hook.name} has invalid priority: ${hook.priority}`);
        }
      }

      // Check for security issues
      if (config.security.validateCommands) {
        for (const hook of allHooks) {
          if (hook.handler.type === 'command') {
            const command = hook.handler.command || '';
            if (command.includes('sudo') || command.includes('rm -rf')) {
              warnings.push(`Hook ${hook.name} uses potentially dangerous command: ${command}`);
            }
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        suggestions,
      };
    } catch (error) {
      errors.push((error as Error).message);
      return {
        valid: false,
        errors,
        warnings,
        suggestions,
      };
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return 'hook-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get configuration directory paths
   */
  getPaths(): { global: string; project: string } {
    return {
      global: this.globalPath,
      project: this.projectPath,
    };
  }
}
