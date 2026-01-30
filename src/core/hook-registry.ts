/**
 * HookRegistry - Manages hook registration and execution ordering
 */

import {
  HookConfig,
  HookEvent,
  HookRegistry as HookRegistryInterface,
  HookStats,
  HookError,
  LogLevel,
} from '../types';

import { Logger } from '../logging/logger';

export interface HookRegistryOptions {
  logger: Logger;
}

export class HookRegistry implements HookRegistryInterface {
  private hooks: Map<string, any>;
  private eventIndex: Map<HookEvent, string[]>;
  private priorityIndex: Map<HookEvent, string[]>;
  private stats: Map<string, HookStats>;
  private logger: Logger;

  constructor(options: HookRegistryOptions) {
    this.hooks = new Map();
    this.eventIndex = new Map();
    this.priorityIndex = new Map();
    this.stats = new Map();
    this.logger = options.logger;
  }

  /**
   * Register a new hook
   */
  async register(hookConfig: any): Promise<void> {
    try {
      // Validate hook config
      if (!hookConfig.id) {
        throw new HookError('Hook ID is required');
      }

      if (!hookConfig.name) {
        throw new HookError('Hook name is required');
      }

      if (!hookConfig.events || hookConfig.events.length === 0) {
        throw new HookError('Hook must have at least one event');
      }

      if (!hookConfig.handler) {
        throw new HookError('Hook handler is required');
      }

      // Create hook registration
      const hook: any = {
        id: hookConfig.id,
        name: hookConfig.name,
        description: hookConfig.description || '',
        enabled: hookConfig.enabled !== false,
        events: hookConfig.events,
        handler: hookConfig.handler,
        filter: hookConfig.filter,
        priority: hookConfig.priority || 50,
        metadata: hookConfig.metadata || {},
        timeout: hookConfig.timeout,
        retry: hookConfig.retry || 0,
        continueOnError: hookConfig.continueOnError !== false,
        exitCodeBlocking: hookConfig.exitCodeBlocking || [2],
        createdAt: hookConfig.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        lastExecution: undefined,
        lastError: undefined,
      };

      // Add to hooks map
      this.hooks.set(hook.id, hook);

      // Index by events
      for (const event of hook.events) {
        if (!this.eventIndex.has(event)) {
          this.eventIndex.set(event, []);
        }
        this.eventIndex.get(event)!.push(hook.id);
      }

      // Update priority index
      this.updatePriorityIndex();

      // Initialize stats
      this.stats.set(hook.id, {
        hookId: hook.id,
        hookName: hook.name,
        executions: 0,
        successes: 0,
        failures: 0,
        blocked: 0,
        averageDuration: 0,
        lastExecution: undefined,
        lastError: undefined,
        errorHistory: [],
      });

      this.logger.debug(`Registered hook: ${hook.name} (${hook.id})`);
    } catch (error) {
      this.logger.error('Failed to register hook', {
        error: (error as Error).message,
        hookName: hookConfig.name,
      });
      throw error;
    }
  }

  /**
   * Unregister a hook
   */
  async unregister(hookId: string): Promise<void> {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`);
    }

    // Remove from hooks map
    this.hooks.delete(hookId);

    // Remove from event index
    for (const event of hook.events) {
      const eventHooks = this.eventIndex.get(event);
      if (eventHooks) {
        const index = eventHooks.indexOf(hookId);
        if (index > -1) {
          eventHooks.splice(index, 1);
        }
        if (eventHooks.length === 0) {
          this.eventIndex.delete(event);
        }
      }
    }

    // Remove from priority index
    this.updatePriorityIndex();

    // Remove stats
    this.stats.delete(hookId);

    this.logger.debug(`Unregistered hook: ${hook.name} (${hookId})`);
  }

  /**
   * Get a hook by ID
   */
  getHook(hookId: string): any | undefined {
    return this.hooks.get(hookId);
  }

  /**
   * Get all hooks
   */
  getAllHooks(): any[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Get hooks for a specific event
   */
  getHooksForEvent(event: HookEvent): any[] {
    const hookIds = this.eventIndex.get(event) || [];
    const hooks = hookIds
      .map((id) => this.hooks.get(id))
      .filter((hook) => hook && hook.enabled);

    // Sort by priority (lower = earlier execution)
    return hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get hooks for multiple events
   */
  getHooksForEvents(events: HookEvent[]): any[] {
    const hookSet = new Set<string>();
    for (const event of events) {
      const hookIds = this.eventIndex.get(event) || [];
      hookIds.forEach((id) => hookSet.add(id));
    }

    const hooks = Array.from(hookSet)
      .map((id) => this.hooks.get(id))
      .filter((hook) => hook && hook.enabled);

    // Sort by priority
    return hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Update hook execution statistics
   */
  updateStats(hookId: string, duration: number, success: boolean, blocked = false): void {
    const stats = this.stats.get(hookId);
    if (!stats) {
      return;
    }

    stats.executions++;
    if (success) {
      stats.successes++;
    } else {
      stats.failures++;
    }

    if (blocked) {
      stats.blocked++;
    }

    // Update average duration
    stats.averageDuration = (stats.averageDuration * (stats.executions - 1) + duration) / stats.executions;

    stats.lastExecution = new Date().toISOString();

    // Update hook
    const hook = this.hooks.get(hookId);
    if (hook) {
      hook.executionCount = stats.executions;
      hook.successCount = stats.successes;
      hook.failureCount = stats.failures;
      hook.lastExecution = stats.lastExecution;
    }
  }

  /**
   * Record hook error
   */
  recordError(hookId: string, error: Error): void {
    const stats = this.stats.get(hookId);
    if (!stats) {
      return;
    }

    stats.lastError = error.message;
    stats.errorHistory.push({
      timestamp: new Date().toISOString(),
      error: error.message,
    });

    // Keep only last 100 errors
    if (stats.errorHistory.length > 100) {
      stats.errorHistory = stats.errorHistory.slice(-100);
    }

    // Update hook
    const hook = this.hooks.get(hookId);
    if (hook) {
      hook.lastError = error.message;
    }
  }

  /**
   * Update priority index
   */
  private updatePriorityIndex(): void {
    this.priorityIndex.clear();

    for (const [event, hookIds] of this.eventIndex.entries()) {
      const hooks = hookIds
        .map((id) => this.hooks.get(id))
        .filter((hook) => hook && hook.enabled);

      // Sort by priority
      const sortedIds = hooks
        .sort((a, b) => a.priority - b.priority)
        .map((hook) => hook.id);

      this.priorityIndex.set(event, sortedIds);
    }
  }

  /**
   * Enable a hook
   */
  async enable(hookId: string): Promise<void> {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`);
    }

    hook.enabled = true;
    hook.updatedAt = new Date().toISOString();

    // Update priority index
    this.updatePriorityIndex();

    this.logger.debug(`Enabled hook: ${hook.name} (${hookId})`);
  }

  /**
   * Disable a hook
   */
  async disable(hookId: string): Promise<void> {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`);
    }

    hook.enabled = false;
    hook.updatedAt = new Date().toISOString();

    // Update priority index
    this.updatePriorityIndex();

    this.logger.debug(`Disabled hook: ${hook.name} (${hookId})`);
  }

  /**
   * Update hook priority
   */
  async updatePriority(hookId: string, priority: number): Promise<void> {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`);
    }

    if (priority < 0 || priority > 1000) {
      throw new HookError('Priority must be between 0 and 1000');
    }

    hook.priority = priority;
    hook.updatedAt = new Date().toISOString();

    // Update priority index
    this.updatePriorityIndex();

    this.logger.debug(`Updated priority for hook: ${hook.name} (${hookId})`, { priority });
  }

  /**
   * Update hook events
   */
  async updateEvents(hookId: string, events: HookEvent[]): Promise<void> {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      throw new HookError(`Hook not found: ${hookId}`);
    }

    if (!events || events.length === 0) {
      throw new HookError('Events cannot be empty');
    }

    // Remove from old event indices
    for (const event of hook.events) {
      const eventHooks = this.eventIndex.get(event);
      if (eventHooks) {
        const index = eventHooks.indexOf(hookId);
        if (index > -1) {
          eventHooks.splice(index, 1);
        }
        if (eventHooks.length === 0) {
          this.eventIndex.delete(event);
        }
      }
    }

    // Update events
    hook.events = events;
    hook.updatedAt = new Date().toISOString();

    // Add to new event indices
    for (const event of events) {
      if (!this.eventIndex.has(event)) {
        this.eventIndex.set(event, []);
      }
      this.eventIndex.get(event)!.push(hookId);
    }

    // Update priority index
    this.updatePriorityIndex();

    this.logger.debug(`Updated events for hook: ${hook.name} (${hookId})`, { events });
  }

  /**
   * Get statistics
   */
  getStats(): any {
    const statsArray = Array.from(this.stats.values());
    const total = statsArray.reduce((sum, stat) => sum + stat.executions, 0);
    const successful = statsArray.reduce((sum, stat) => sum + stat.successes, 0);
    const failed = statsArray.reduce((sum, stat) => sum + stat.failures, 0);
    const blocked = statsArray.reduce((sum, stat) => sum + stat.blocked, 0);

    return {
      totalHooks: this.hooks.size,
      enabledHooks: Array.from(this.hooks.values()).filter((h) => h.enabled).length,
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: failed,
      blockedExecutions: blocked,
      byHook: statsArray,
      byEvent: this.getStatsByEvent(),
    };
  }

  /**
   * Get hook-specific statistics
   */
  getHookStats(hookId: string): HookStats | undefined {
    return this.stats.get(hookId);
  }

  /**
   * Get statistics by event
   */
  private getStatsByEvent(): Record<string, number> {
    const result: Record<string, number> = {};

    for (const [event, hookIds] of this.eventIndex.entries()) {
      result[event] = hookIds.length;
    }

    return result;
  }

  /**
   * Clear all hooks
   */
  async clear(): Promise<void> {
    this.hooks.clear();
    this.eventIndex.clear();
    this.priorityIndex.clear();
    this.stats.clear();
    this.logger.debug('All hooks cleared from registry');
  }

  /**
   * Get hook count
   */
  get size(): number {
    return this.hooks.size;
  }

  /**
   * Check if a hook exists
   */
  has(hookId: string): boolean {
    return this.hooks.has(hookId);
  }

  /**
   * Get all events with registered hooks
   */
  getEventsWithHooks(): HookEvent[] {
    return Array.from(this.eventIndex.keys());
  }
}
