/**
 * HookInterceptor - Main entry point for all Claude Code lifecycle events
 * Coordinates all modules and executes hooks based on lifecycle events
 */

import {
  HookEvent,
  HookContext,
  HookResult,
  HookHandler,
  ExecuteOptions,
  ExecutionResult,
  BatchExecutionResult,
  HookError,
  ExecutionError,
  LogLevel,
  LogEntry,
} from '../types';

import { HookRegistry } from './hook-registry';
import { ConfigManager } from './config-manager';
import { HookExecutor } from './hook-executor';
import { Logger } from '../logging/logger';

export interface HookInterceptorOptions {
  configPath?: string;
  projectPath?: string;
  logLevel?: LogLevel;
  logPath?: string;
  autoInitialize?: boolean;
}

export class HookInterceptor {
  private registry: HookRegistry;
  private configManager: ConfigManager;
  private executor: HookExecutor | null = null;
  private logger: Logger;
  private initialized = false;
  private options: Required<HookInterceptorOptions>;

  constructor(options: HookInterceptorOptions = {}) {
    this.options = {
      configPath: options.configPath || '~/.claude/hooks/hookmanager',
      projectPath: options.projectPath || process.cwd(),
      logLevel: options.logLevel || LogLevel.INFO,
      logPath: options.logPath || '~/.claude/logs/hookmanager.log',
      autoInitialize: options.autoInitialize !== false,
    };

    this.logger = new Logger({
      level: this.options.logLevel,
      path: this.options.logPath,
      format: 'json',
    });

    this.configManager = new ConfigManager({
      globalPath: this.options.configPath,
      projectPath: this.options.projectPath,
      logger: this.logger,
    });

    this.registry = new HookRegistry({
      logger: this.logger,
    });

    if (this.options.autoInitialize) {
      this.initialize().catch((err) => {
        this.logger.error('Failed to auto-initialize HookInterceptor', { error: err.message });
      });
    }
  }

  /**
   * Initialize the interceptor
   * Loads configuration and registers hooks
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('HookInterceptor already initialized');
      return;
    }

    try {
      this.logger.info('Initializing HookInterceptor...');

      // Load configuration
      await this.configManager.load();
      this.logger.debug('Configuration loaded');

      // Register hooks from config (both global and project hooks)
      const config = this.configManager.getMergedConfig();
      let totalRegistered = 0;

      // Register global hooks
      if (config.hooks && config.hooks.length > 0) {
        for (const hook of config.hooks) {
          // Mark as global hook
          hook.metadata = hook.metadata || {};
          hook.metadata._scope = 'global';
          await this.registry.register(hook);
          totalRegistered++;
        }
      }

      // Register project hooks
      if (config.projectHooks && config.projectHooks.length > 0) {
        for (const hook of config.projectHooks) {
          // Mark as project hook
          hook.metadata = hook.metadata || {};
          hook.metadata._scope = 'project';
          await this.registry.register(hook);
          totalRegistered++;
        }
      }

      if (totalRegistered > 0) {
        this.logger.info(`Registered ${totalRegistered} hooks`);
      }

      // Initialize logger
      await this.logger.initialize();
      this.logger.debug('Logger initialized');

      // Initialize executor with AI config from merged config
      const aiConfig = config.ai;
      this.executor = new HookExecutor({
        logger: this.logger,
        registry: this.registry,
        aiConfig,
      });
      this.logger.debug('HookExecutor initialized', {
        hasAIConfig: !!aiConfig,
        provider: aiConfig?.provider,
      });

      this.initialized = true;
      this.logger.info('HookInterceptor initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize HookInterceptor', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Handle a Claude Code lifecycle event
   * This is the main entry point for all hook executions
   */
  async handleEvent(
    event: HookEvent,
    context: Partial<HookContext> = {},
    options: ExecuteOptions = {}
  ): Promise<BatchExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.executor) {
      throw new Error('HookExecutor not initialized');
    }

    const startTime = Date.now();
    const fullContext: HookContext = {
      event,
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId || `session-${Date.now()}`,
      userId: context.userId,
      projectId: context.projectId,
      tool: context.tool,
      command: context.command,
      input: context.input,
      output: context.output,
      metadata: context.metadata,
      environment: context.environment || process.env,
      projectDir: context.projectDir || this.options.projectPath,
      pluginRoot: context.pluginRoot,
      envFile: context.envFile,
    };

    this.logger.debug(`Handling event: ${event}`, { context: fullContext });

    try {
      // Get hooks for this event
      const hooks = this.registry.getHooksForEvent(event);
      if (hooks.length === 0) {
        this.logger.debug(`No hooks registered for event: ${event}`);
        return {
          results: [],
          summary: {
            total: 0,
            successful: 0,
            failed: 0,
            blocked: 0,
            averageDuration: 0,
            errors: [],
          },
        };
      }

      // Execute hooks
      const results = await this.executor.executeHooks(
        hooks,
        fullContext,
        options
      );

      const duration = Date.now() - startTime;

      // Log execution summary
      this.logger.info(`Event ${event} processed in ${duration}ms`, {
        hookCount: hooks.length,
        resultCount: results.results.length,
        successful: results.summary.successful,
        failed: results.summary.failed,
        blocked: results.summary.blocked,
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to handle event: ${event}`, {
        error: (error as Error).message,
        duration,
      });
      throw error;
    }
  }

  /**
   * Execute a specific hook by ID
   */
  async executeHookById(
    hookId: string,
    context: Partial<HookContext> = {},
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const hook = this.registry.getHook(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`, hookId);
    }

    const fullContext: HookContext = {
      event: hook.events[0], // Use first event
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId || `session-${Date.now()}`,
      userId: context.userId,
      projectId: context.projectId,
      tool: context.tool,
      command: context.command,
      input: context.input,
      output: context.output,
      metadata: context.metadata,
      environment: context.environment || process.env,
      projectDir: context.projectDir || this.options.projectPath,
      pluginRoot: context.pluginRoot,
      envFile: context.envFile,
    };

    return this.executor.executeHook(hook, fullContext, options);
  }

  /**
   * Register a new hook dynamically
   */
  async registerHook(hookConfig: any, isGlobal: boolean = false): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Set scope metadata
    if (!hookConfig.metadata) {
      hookConfig.metadata = {};
    }
    hookConfig.metadata._scope = isGlobal ? 'global' : 'project';

    await this.registry.register(hookConfig);
    await this.configManager.addHook(hookConfig, isGlobal);
    this.logger.info(`Registered new hook: ${hookConfig.name} (${isGlobal ? 'global' : 'project'})`);
  }

  /**
   * Unregister a hook
   */
  async unregisterHook(hookId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const hook = this.registry.getHook(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`, hookId);
    }

    await this.registry.unregister(hookId);

    // Determine if this is a global or project hook
    const isGlobal = hook.metadata?._scope === 'global';
    await this.configManager.removeHook(hookId, isGlobal);
    this.logger.info(`Unregistered hook: ${hookId}`);
  }

  /**
   * Get all registered hooks
   */
  getHooks(): any[] {
    return this.registry.getAllHooks();
  }

  /**
   * Get global hooks only
   */
  getGlobalHooks(): any[] {
    return this.registry.getAllHooks().filter(
      (hook) => hook.metadata?._scope === 'global'
    );
  }

  /**
   * Get project hooks only
   */
  getProjectHooks(): any[] {
    return this.registry.getAllHooks().filter(
      (hook) => hook.metadata?._scope === 'project'
    );
  }

  /**
   * Get hooks for a specific event
   */
  getHooksForEvent(event: HookEvent): any[] {
    return this.registry.getHooksForEvent(event);
  }

  /**
   * Get hook by ID
   */
  getHook(hookId: string): any | undefined {
    return this.registry.getHook(hookId);
  }

  /**
   * Enable a hook
   */
  async enableHook(hookId: string): Promise<void> {
    const hook = this.registry.getHook(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`, hookId);
    }

    hook.enabled = true;

    // Determine if this is a global or project hook
    const isGlobal = hook.metadata?._scope === 'global';
    await this.configManager.updateHook(hookId, { enabled: true }, isGlobal);
    this.logger.info(`Enabled hook: ${hookId}`);
  }

  /**
   * Disable a hook
   */
  async disableHook(hookId: string): Promise<void> {
    const hook = this.registry.getHook(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`, hookId);
    }

    hook.enabled = false;

    // Determine if this is a global or project hook
    const isGlobal = hook.metadata?._scope === 'global';
    await this.configManager.updateHook(hookId, { enabled: false }, isGlobal);
    this.logger.info(`Disabled hook: ${hookId}`);
  }

  /**
   * Update hook priority
   */
  async updateHookPriority(hookId: string, priority: number): Promise<void> {
    const hook = this.registry.getHook(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`, hookId);
    }

    hook.priority = priority;

    // Determine if this is a global or project hook
    const isGlobal = hook.metadata?._scope === 'global';
    await this.configManager.updateHook(hookId, { priority }, isGlobal);
    this.logger.info(`Updated priority for hook: ${hookId}`, { priority });
  }

  /**
   * Get execution statistics
   */
  getStats(): any {
    return this.registry.getStats();
  }

  /**
   * Get hook statistics for a specific hook
   */
  getHookStats(hookId: string): any | undefined {
    return this.registry.getHookStats(hookId);
  }

  /**
   * Clear all hooks
   */
  async clearHooks(): Promise<void> {
    await this.registry.clear();
    await this.configManager.clearHooks();
    this.logger.info('All hooks cleared');
  }

  /**
   * Export configuration
   */
  async exportConfig(format: 'json' | 'yaml' = 'json'): Promise<string> {
    return this.configManager.export(format);
  }

  /**
   * Import configuration
   */
  async importConfig(data: string, format: 'json' | 'yaml' = 'json'): Promise<void> {
    await this.configManager.import(data, format);
    await this.initialize(); // Re-initialize with new config
  }

  /**
   * Validate configuration
   */
  async validate(): Promise<any> {
    return this.configManager.validate();
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get config manager instance
   */
  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  /**
   * Get registry instance
   */
  getRegistry(): HookRegistry {
    return this.registry;
  }

  /**
   * Destroy the interceptor
   * Cleans up resources
   */
  async destroy(): Promise<void> {
    this.logger.info('Shutting down HookInterceptor...');

    // Save current state
    await this.configManager.save();

    // Destroy logger
    await this.logger.destroy();

    this.initialized = false;
    this.logger.info('HookInterceptor shutdown complete');
  }

  /**
   * Factory method to create a HookInterceptor instance
   */
  static create(options: HookInterceptorOptions = {}): HookInterceptor {
    return new HookInterceptor(options);
  }
}

// Export factory function for convenience
export function createHookInterceptor(options: HookInterceptorOptions = {}): HookInterceptor {
  return HookInterceptor.create(options);
}
