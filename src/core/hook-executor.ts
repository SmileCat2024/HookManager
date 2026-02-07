/**
 * HookExecutor - Executes hooks with proper error handling and logging
 */

import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import {
  HookContext,
  HookResult,
  ExecuteOptions,
  ExecutionResult,
  BatchExecutionResult,
  HookError,
  ExecutionError,
  HookHandler,
  LogLevel,
  HookEvent,
  AIConfig,
  AnthropicConfig,
  OpenAIConfig,
} from '../types';

import { HookRegistry } from './hook-registry';
import { Logger } from '../logging/logger';
import { ProviderManager } from './ai-provider/provider-manager';
import { AIProviderType } from './ai-provider/types';

export interface HookExecutorOptions {
  logger: Logger;
  registry: HookRegistry;
  aiConfig?: AIConfig;
}

export class HookExecutor {
  private logger: Logger;
  private registry: HookRegistry;
  private providerManager: ProviderManager | null = null;

  constructor(options: HookExecutorOptions) {
    this.logger = options.logger;
    this.registry = options.registry;
    this.providerManager = this.initializeProviderManager(options.aiConfig);
  }

  /**
   * Initialize ProviderManager from AI configuration
   */
  private initializeProviderManager(aiConfig?: AIConfig): ProviderManager | null {
    if (!aiConfig) {
      // Try to get API key from environment
      const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
      if (!apiKey) {
        this.logger.debug('No AI configuration provided, prompt handlers will require manual setup');
        return null;
      }

      aiConfig = {
        provider: 'anthropic',
        anthropic: { apiKey },
      };
    }

    try {
      const manager = new ProviderManager({
        defaultProvider: aiConfig.provider === 'openai' ? AIProviderType.OPENAI : AIProviderType.ANTHROPIC,
      });

      // Register Anthropic provider if configured
      if (aiConfig.provider === 'anthropic' && aiConfig.anthropic) {
        manager.registerProvider({
          type: AIProviderType.ANTHROPIC,
          apiKey: aiConfig.anthropic.apiKey || process.env.ANTHROPIC_API_KEY || '',
          baseURL: aiConfig.anthropic.baseURL,
        });
        this.logger.debug('Anthropic provider registered');
      }

      // Register OpenAI provider if configured
      if (aiConfig.provider === 'openai' && aiConfig.openai) {
        manager.registerProvider({
          type: AIProviderType.OPENAI,
          apiKey: aiConfig.openai.apiKey || process.env.OPENAI_API_KEY || '',
          baseURL: aiConfig.openai.baseURL,
        });
        this.logger.debug('OpenAI provider registered');
      }

      this.logger.info('ProviderManager initialized successfully');
      return manager;
    } catch (error) {
      this.logger.warn('Failed to initialize ProviderManager', { error: (error as Error).message });
      return null;
    }
  }

  /**
   * Execute multiple hooks for an event
   */
  async executeHooks(
    hooks: any[],
    context: HookContext,
    options: ExecuteOptions = {}
  ): Promise<BatchExecutionResult> {
    const startTime = Date.now();
    const results: ExecutionResult[] = [];

    this.logger.debug(`Executing ${hooks.length} hooks for event: ${context.event}`, {
      parallel: options.parallel,
    });

    if (options.parallel) {
      // Execute in parallel
      const promises = hooks.map((hook) =>
        this.executeHook(hook, context, options).catch((error) => ({
          hookId: hook.id,
          hookName: hook.name,
          event: context.event,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: 0,
          result: {
            success: false,
            exitCode: 1,
            error: error,
          },
          error,
          blocked: false,
        }))
      );

      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);
    } else {
      // Execute sequentially
      for (const hook of hooks) {
        try {
          const result = await this.executeHook(hook, context, options);
          results.push(result);

          // Check if hook blocked execution
          if (result.blocked) {
            this.logger.warn(`Hook ${hook.name} blocked execution`, {
              hookId: hook.id,
              event: context.event,
            });
            break;
          }
        } catch (error) {
          this.logger.error(`Hook ${hook.name} failed`, {
            hookId: hook.id,
            error: (error as Error).message,
          });

          results.push({
            hookId: hook.id,
            hookName: hook.name,
            event: context.event,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: 0,
            result: {
              success: false,
              exitCode: 1,
              error: error as Error,
            },
            error: error as Error,
            blocked: false,
          });

          if (!options.continueOnError) {
            break;
          }
        }
      }
    }

    const duration = Date.now() - startTime;

    // Calculate summary
    const summary = this.calculateSummary(results);

    this.logger.info(`Execution complete for ${context.event}`, {
      duration,
      hookCount: hooks.length,
      resultCount: results.length,
      successful: summary.successful,
      failed: summary.failed,
      blocked: summary.blocked,
    });

    return {
      results,
      summary,
    };
  }

  /**
   * Execute a single hook
   */
  async executeHook(
    hook: any,
    context: HookContext,
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const hookId = hook.id;
    const hookName = hook.name;

    this.logger.debug(`Executing hook: ${hookName}`, {
      hookId,
      event: context.event,
    });

    // Check if hook is enabled
    if (!hook.enabled) {
      this.logger.debug(`Hook ${hookName} is disabled, skipping`);
      return {
        hookId,
        hookName,
        event: context.event,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        result: {
          success: true,
          exitCode: 0,
          stdout: 'Hook disabled',
        },
        blocked: false,
      };
    }

    // Check matcher (coarse-grained filtering - executed first)
    if (hook.matcher && !this.checkMatcher(hook.matcher, context)) {
      this.logger.debug(`Hook ${hookName} matcher did not match, skipping`);
      return {
        hookId,
        hookName,
        event: context.event,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        result: {
          success: true,
          exitCode: 0,
          stdout: 'Matcher did not match',
        },
        blocked: false,
      };
    }

    // Check filter (fine-grained filtering - executed after matcher)
    if (hook.filter && !this.checkFilter(hook.filter, context)) {
      this.logger.debug(`Hook ${hookName} filter did not match, skipping`);
      return {
        hookId,
        hookName,
        event: context.event,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        result: {
          success: true,
          exitCode: 0,
          stdout: 'Filter did not match',
        },
        blocked: false,
      };
    }

    // Execute handler
    const timeout = options.timeout || hook.timeout || 30000;
    const maxRetries = options.retry !== undefined ? options.retry : hook.retry || 0;

    let lastError: Error | undefined;
    let result: HookResult | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.info(`Retrying hook ${hookName} (attempt ${attempt + 1}/${maxRetries + 1})`);
        }

        result = await this.executeHandler(hook.handler, context, timeout);
        break;
      } catch (error) {
        lastError = error as Error;
        this.logger.error(`Hook ${hookName} execution failed (attempt ${attempt + 1})`, {
          error: (error as Error).message,
          hookId,
        });

        if (attempt === maxRetries) {
          break;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!result) {
      // All retries failed
      const error = lastError || new Error('Hook execution failed');
      this.registry.recordError(hookId, error);

      const executionError = new ExecutionError(
        `Hook ${hookName} failed after ${maxRetries + 1} attempts`,
        hookId,
        1,
        undefined,
        error.message
      );

      this.registry.updateStats(hookId, duration, false);

      throw executionError;
    }

    // Check if hook should block execution
    const shouldBlock = this.shouldBlock(result, hook);
    if (shouldBlock) {
      this.logger.warn(`Hook ${hookName} is blocking execution`, {
        hookId,
        exitCode: result.exitCode,
      });
    }

    // Update statistics
    this.registry.updateStats(hookId, duration, result.success, shouldBlock);

    // Log execution
    this.logExecution(hookName, hookId, context.event, result, duration);

    return {
      hookId,
      hookName,
      event: context.event,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      duration,
      result,
      blocked: shouldBlock,
    };
  }

  /**
   * Execute a handler
   */
  private async executeHandler(
    handler: HookHandler,
    context: HookContext,
    timeout: number
  ): Promise<HookResult> {
    switch (handler.type) {
      case 'command':
        return this.executeCommand(handler, context, timeout);

      case 'script':
        return this.executeScript(handler, context, timeout);

      case 'module':
        return this.executeModule(handler, context, timeout);

      case 'programmatic':
        return this.executeProgrammatic(handler, context, timeout);

      case 'prompt':
        return this.executePrompt(handler, context, timeout);

      default:
        throw new Error(`Unknown handler type: ${(handler as any).type}`);
    }
  }

  /**
   * Execute a command handler
   */
  private async executeCommand(
    handler: any,
    context: HookContext,
    timeout: number
  ): Promise<HookResult> {
    return new Promise((resolve, reject) => {
      const command = handler.command;
      const args = handler.args || [];
      const shell = handler.shell || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
      const cwd = handler.cwd || context.projectDir || process.cwd();
      const env = { ...process.env, ...handler.env, ...this.getContextEnv(context) };

      this.logger.debug(`Executing command: ${command} ${args.join(' ')}`, {
        cwd,
        timeout,
      });

      const child = spawn(command, args, {
        cwd,
        env,
        shell: true,
        timeout,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const result: HookResult = {
          success: code === 0,
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        };

        // Parse JSON output if available
        if (result.stdout && result.stdout.startsWith('{')) {
          try {
            result.output = JSON.parse(result.stdout);
          } catch {
            // Not JSON, keep as string
          }
        }

        resolve(result);
      });

      child.on('error', (error) => {
        reject(new Error(`Command execution error: ${error.message}`));
      });

      child.on('timeout', () => {
        child.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      });
    });
  }

  /**
   * Execute a script handler
   */
  private async executeScript(
    handler: any,
    context: HookContext,
    timeout: number
  ): Promise<HookResult> {
    const scriptPath = handler.path;

    // Resolve relative paths
    const resolvedPath = path.isAbsolute(scriptPath)
      ? scriptPath
      : path.resolve(context.projectDir || process.cwd(), scriptPath);

    this.logger.debug(`Executing script: ${resolvedPath}`, {
      timeout,
    });

    // Use command handler to execute the script
    return this.executeCommand(
      {
        type: 'command',
        command: resolvedPath,
        args: handler.args || [],
        shell: handler.shell,
        cwd: handler.cwd,
        env: handler.env,
      },
      context,
      timeout
    );
  }

  /**
   * Execute a module handler
   */
  private async executeModule(
    handler: any,
    context: HookContext,
    timeout: number
  ): Promise<HookResult> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Module execution timed out after ${timeout}ms`));
      }, timeout);

      try {
        // Dynamic import
        const module = await import(handler.module);
        const func = handler.function ? module[handler.function] : module.default;

        if (!func) {
          throw new Error(`Function not found in module: ${handler.module}`);
        }

        // Execute function
        const result = await func(context, ...handler.args || []);

        clearTimeout(timeoutId);

        // Normalize result
        if (typeof result === 'boolean') {
          resolve({
            success: result,
            exitCode: result ? 0 : 1,
          });
        } else if (typeof result === 'number') {
          resolve({
            success: result === 0,
            exitCode: result,
          });
        } else if (typeof result === 'object' && result !== null) {
          resolve({
            success: result.success !== false,
            exitCode: result.exitCode || (result.success ? 0 : 1),
            stdout: result.stdout,
            stderr: result.stderr,
            output: result.output,
          });
        } else {
          resolve({
            success: true,
            exitCode: 0,
            stdout: String(result),
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Execute a programmatic handler
   */
  private async executeProgrammatic(
    handler: any,
    context: HookContext,
    timeout: number
  ): Promise<HookResult> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Programmatic handler timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = await handler.handler(context);

        clearTimeout(timeoutId);

        // Normalize result
        if (typeof result === 'boolean') {
          resolve({
            success: result,
            exitCode: result ? 0 : 1,
          });
        } else if (typeof result === 'number') {
          resolve({
            success: result === 0,
            exitCode: result,
          });
        } else if (typeof result === 'object' && result !== null) {
          resolve({
            success: result.success !== false,
            exitCode: result.exitCode || (result.success ? 0 : 1),
            stdout: result.stdout,
            stderr: result.stderr,
            output: result.output,
            permissionDecision: result.permissionDecision,
            updatedInput: result.updatedInput,
            additionalContext: result.additionalContext,
          });
        } else {
          resolve({
            success: true,
            exitCode: 0,
            stdout: String(result),
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Execute a prompt handler - uses ProviderManager to make intelligent decisions
   * Only supports decision-making events: PreToolUse, PostToolUse, PostToolUseFailure,
   * PermissionRequest, UserPromptSubmit, SubagentStop
   */
  private async executePrompt(
    handler: any,
    context: HookContext,
    timeout: number
  ): Promise<HookResult> {
    const decisionEvents = [
      HookEvent.PreToolUse,
      HookEvent.PostToolUse,
      HookEvent.PostToolUseFailure,
      HookEvent.PermissionRequest,
      HookEvent.UserPromptSubmit,
      HookEvent.SubagentStop,
    ];

    // Check if event supports prompt-based decisions
    if (!decisionEvents.includes(context.event)) {
      this.logger.warn(`Event ${context.event} does not support prompt handler, skipping`, {
        hookId: context.event,
      });
      return {
        success: true,
        exitCode: 0,
        stdout: `Event ${context.event} does not support prompt decisions`,
      };
    }

    // Check if ProviderManager is available
    if (!this.providerManager) {
      this.logger.warn(`ProviderManager not initialized, cannot execute prompt handler`, {
        event: context.event,
      });
      // On failure, default to ok: true to allow operation to continue
      return {
        success: true,
        exitCode: 0,
        stdout: JSON.stringify({
          decision: 'continue',
          reason: 'ProviderManager not initialized',
        }),
        output: {
          decision: 'continue',
          reason: 'ProviderManager not initialized',
        },
      };
    }

    const model = handler.model || 'haiku';
    const userPrompt = handler.prompt;
    const systemPrompt = handler.systemPrompt || 'You are a decision assistant. Evaluate the given context and respond with a JSON decision.';

    try {
      // Build hook prompt context
      const hookContext = {
        event: context.event,
        timestamp: context.timestamp,
        sessionId: context.sessionId,
        userId: context.userId,
        projectId: context.projectId,
        tool: context.tool,
        command: context.command,
        input: context.input,
        output: context.output,
        metadata: context.metadata,
        environment: context.environment,
        projectDir: context.projectDir,
        pluginRoot: context.pluginRoot,
        envFile: context.envFile,
      };

      this.logger.debug(`Executing prompt handler with ProviderManager`, {
        model,
        event: context.event,
      });

      // Execute via ProviderManager
      const startTime = Date.now();

      const result = await this.providerManager.executeHookPrompt(
        hookContext,
        userPrompt,
        model,
        systemPrompt
      );

      const duration = Date.now() - startTime;

      this.logger.debug(`ProviderManager response received`, { duration });

      const ok = result.ok ?? true;
      const reason = result.reason || '';

      // Map decision to event-specific output format
      // Based on: https://code.claude.com/docs/en/hooks
      let hookResult: HookResult;

      if (context.event === HookEvent.PreToolUse || context.event === HookEvent.PermissionRequest) {
        // These events use hookSpecificOutput.permissionDecision format
        hookResult = {
          success: true,
          exitCode: 0,
          stdout: JSON.stringify({
            hookSpecificOutput: {
              permissionDecision: ok ? 'allow' : 'deny',
              permissionDecisionReason: reason,
            },
          }),
          output: {
            hookSpecificOutput: {
              permissionDecision: ok ? 'allow' : 'deny',
              permissionDecisionReason: reason,
            },
          },
        };
      } else {
        // Other decision events use decision format
        hookResult = {
          success: true,
          exitCode: ok ? 0 : 2, // Exit code 2 signals blocking
          stdout: JSON.stringify({
            decision: ok ? 'continue' : 'block',
            reason: reason,
          }),
          output: {
            decision: ok ? 'continue' : 'block',
            reason: reason,
          },
        };
      }

      this.logger.info(`Prompt handler executed`, {
        event: context.event,
        decision: ok ? 'allow' : 'deny',
        reason: reason.substring(0, 100),
      });

      return hookResult;
    } catch (error) {
      const errorMessage = (error as Error).message;

      this.logger.error(`Prompt handler execution failed`, {
        error: errorMessage,
        event: context.event,
      });

      // On failure, default to ok: true to allow operation to continue
      return {
        success: true,
        exitCode: 0,
        stdout: JSON.stringify({
          decision: 'continue',
          reason: `Prompt handler failed: ${errorMessage.substring(0, 100)}`,
        }),
        output: {
          decision: 'continue',
          reason: `Prompt handler failed: ${errorMessage.substring(0, 100)}`,
        },
      };
    }
  }

  /**
   * Check if matcher matches
   * For tool events: matches against context.tool
   * For non-tool events: matches against event-specific metadata fields
   */
  private checkMatcher(matcher: string, context: HookContext): boolean {
    // Wildcard patterns always match
    if (matcher === '*' || matcher === '' || matcher === '.*') {
      return true;
    }

    // Tool events: match against tool name
    if (context.tool) {
      try {
        const regex = new RegExp(`^${matcher}$`);
        return regex.test(context.tool);
      } catch (error) {
        // Fallback to exact string match if regex fails
        return context.tool === matcher;
      }
    }

    // Non-tool events: match against event-specific metadata fields
    const targetValue = this.getMatcherTargetForEvent(context.event, context.metadata);
    if (targetValue) {
      try {
        const regex = new RegExp(`^${matcher}$`);
        return regex.test(targetValue);
      } catch {
        return targetValue === matcher;
      }
    }

    return false;
  }

  /**
   * Get the matcher target value for non-tool events
   * Each event type may have a specific metadata field that can be matched
   */
  private getMatcherTargetForEvent(
    event: HookEvent,
    metadata: Record<string, any> | undefined
  ): string | null {
    if (!metadata) {
      return null;
    }

    switch (event) {
      case HookEvent.SessionStart:
        // Match against: startup, resume, clear, compact
        return metadata.source || null;

      case HookEvent.SessionEnd:
        // Match against: clear, logout, prompt_input_exit, bypass_permissions_disabled, other
        return metadata.reason || null;

      case HookEvent.SubagentStart:
      case HookEvent.SubagentStop:
        // Match against agent_type: Bash, Explore, Plan, Code, or custom name
        return metadata.agent_type || null;

      case HookEvent.Notification:
        // Match against type: permission_prompt, idle_prompt, auth_success, elicitation_dialog
        return metadata.type || null;

      case HookEvent.PreCompact:
        // Match against trigger: manual, auto
        return metadata.trigger || null;

      default:
        // Events that don't support matcher matching
        return null;
    }
  }

  /**
   * Check if filter matches
   */
  private checkFilter(filter: any, context: HookContext): boolean {
    // Check tools
    if (filter.tools && context.tool) {
      if (!filter.tools.includes(context.tool)) {
        return false;
      }
    }

    // Check commands - IMPORTANT: if filter.commands is set, we must have a matching command
    if (filter.commands) {
      // Skip filter check if command is not provided or is empty string
      if (!context.command || context.command === '') {
        return false;
      }

      const commandStr = String(context.command);
      const matched = filter.commands.some((cmd: string) => commandStr.includes(cmd));

      if (!matched) {
        return false;
      }
    }

    // Check patterns
    if (filter.patterns && context.input) {
      const inputStr = JSON.stringify(context.input);
      if (!filter.patterns.some((pattern: string) => inputStr.includes(pattern))) {
        return false;
      }
    }

    // Check users
    if (filter.users && context.userId) {
      if (!filter.users.includes(context.userId)) {
        return false;
      }
    }

    // Check projects
    if (filter.projects && context.projectId) {
      if (!filter.projects.includes(context.projectId)) {
        return false;
      }
    }

    // Check environments
    if (filter.environments) {
      const env = context.environment || process.env;
      const envName = env.NODE_ENV || env.ENV || 'development';
      if (!filter.environments.includes(envName)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if result should block execution
   */
  private shouldBlock(result: HookResult, hook: any): boolean {
    const exitCodeBlocking = hook.exitCodeBlocking || [2];
    return exitCodeBlocking.includes(result.exitCode);
  }

  /**
   * Log execution
   */
  private logExecution(
    hookName: string,
    hookId: string,
    event: HookEvent,
    result: HookResult,
    duration: number
  ): void {
    const timestamp = new Date().toISOString();
    const logLevel = result.success ? LogLevel.INFO : LogLevel.ERROR;

    const logEntry = {
      timestamp,
      level: logLevel,
      hookId,
      hookName,
      event,
      message: `Hook ${hookName} executed ${result.success ? 'successfully' : 'with error'}`,
      data: {
        exitCode: result.exitCode,
        duration,
        stdout: result.stdout,
        stderr: result.stderr,
        blocked: result.exitCode === 2,
      },
    };

    this.logger.log(logEntry);
  }

  /**
   * Calculate summary from results
   */
  private calculateSummary(results: ExecutionResult[]): BatchExecutionResult['summary'] {
    const total = results.length;
    const successful = results.filter((r) => r.result.success).length;
    const failed = results.filter((r) => !r.result.success).length;
    const blocked = results.filter((r) => r.blocked).length;

    const durations = results.map((r) => r.duration);
    const averageDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const errors = results
      .filter((r) => !r.result.success)
      .map((r) => ({
        hookId: r.hookId,
        error: r.result.error?.message || 'Unknown error',
      }));

    return {
      total,
      successful,
      failed,
      blocked,
      averageDuration,
      errors,
    };
  }

  /**
   * Get context environment variables
   */
  private getContextEnv(context: HookContext): Record<string, string> {
    const env: Record<string, string> = {};

    if (context.event) env.CLAUDE_EVENT = context.event;
    if (context.sessionId) env.CLAUDE_SESSION_ID = context.sessionId;
    if (context.userId) env.CLAUDE_USER_ID = context.userId;
    if (context.projectId) env.CLAUDE_PROJECT_ID = context.projectId;
    if (context.tool) env.CLAUDE_TOOL = context.tool;
    if (context.command) env.CLAUDE_COMMAND = context.command;
    if (context.projectDir) env.CLAUDE_PROJECT_DIR = context.projectDir;
    if (context.pluginRoot) env.CLAUDE_PLUGIN_ROOT = context.pluginRoot;
    if (context.envFile) env.CLAUDE_ENV_FILE = context.envFile;

    if (context.input) {
      try {
        env.CLAUDE_INPUT = JSON.stringify(context.input);
      } catch {
        env.CLAUDE_INPUT = String(context.input);
      }
    }

    if (context.metadata) {
      try {
        env.CLAUDE_METADATA = JSON.stringify(context.metadata);
      } catch {
        env.CLAUDE_METADATA = String(context.metadata);
      }
    }

    return env;
  }
}
