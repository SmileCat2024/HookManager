/**
 * HookManager - Universal hook manager for Claude Code
 *
 * A CLI tool to manage Claude Code hooks via a universal hook that intercepts
 * all lifecycle events and delegates to user-configured hooks.
 */

export * from './core';
export * from './types';
export * from './logging';

// CLI is exported separately for direct use
export { HookInterceptor, createHookInterceptor } from './core/hook-interceptor';

// Version
export const VERSION = '1.0.0';

// Default configuration paths
export const DEFAULT_GLOBAL_CONFIG_PATH = '~/.claude/hooks/config.json';
export const DEFAULT_PROJECT_CONFIG_PATH = '.claude/hooks/config.json';

// Default log paths
export const DEFAULT_LOG_PATH = '~/.claude/logs/hookmanager.log';

// Supported lifecycle events
export { HookEvent } from './types';
