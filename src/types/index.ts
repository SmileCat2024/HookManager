/**
 * HookManager Type Definitions
 * Complete type system for Claude Code hook management
 */

// ============================================================================
// Lifecycle Events (27 events based on Claude Code documentation)
// ============================================================================

export enum HookEvent {
  // Session Events
  SessionStart = 'SessionStart',
  SessionEnd = 'SessionEnd',
  SessionResume = 'SessionResume',

  // Prompt Events
  UserPromptSubmit = 'UserPromptSubmit',
  UserPromptEdit = 'UserPromptEdit',

  // Tool Events
  PreToolUse = 'PreToolUse',
  PostToolUse = 'PostToolUse',
  PostToolUseFailure = 'PostToolUseFailure',
  ToolPermissionRequest = 'ToolPermissionRequest',

  // Agent Events
  SubagentStart = 'SubagentStart',
  SubagentStop = 'SubagentStop',
  SubagentSpawn = 'SubagentSpawn',

  // Response Events
  ResponseStart = 'ResponseStart',
  ResponseEnd = 'ResponseEnd',
  ResponseChunk = 'ResponseChunk',

  // Context Events
  ContextCompact = 'ContextCompact',
  ContextExpand = 'ContextExpand',
  ContextTruncate = 'ContextTruncate',

  // Permission Events
  PermissionRequest = 'PermissionRequest',
  PermissionGranted = 'PermissionGranted',
  PermissionDenied = 'PermissionDenied',

  // Notification Events
  Notification = 'Notification',
  Alert = 'Alert',
  Warning = 'Warning',

  // Error Events
  Error = 'Error',
  Exception = 'Exception',

  // Custom Events
  Custom = 'Custom',
}

// ============================================================================
// Hook Configuration Types
// ============================================================================

export interface HookFilter {
  tools?: string[];
  commands?: string[];
  patterns?: string[];
  users?: string[];
  projects?: string[];
  environments?: string[];
}

export interface HookHandlerCommand {
  type: 'command';
  command: string;
  args?: string[];
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  retry?: number;
}

export interface HookHandlerScript {
  type: 'script';
  path: string;
  args?: string[];
  timeout?: number;
}

export interface HookHandlerModule {
  type: 'module';
  module: string;
  function?: string;
  args?: any[];
  timeout?: number;
}

export interface HookHandlerProgrammatic {
  type: 'programmatic';
  handler: (context: HookContext) => Promise<HookResult>;
}

export type HookHandler =
  | HookHandlerCommand
  | HookHandlerScript
  | HookHandlerModule
  | HookHandlerProgrammatic;

export interface HookConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  events: HookEvent[];
  matcher?: string;
  handler: HookHandler;
  filter?: HookFilter;
  priority: number;
  metadata?: Record<string, any>;
  timeout?: number;
  retry?: number;
  continueOnError?: boolean;
  exitCodeBlocking?: number[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Context and Result Types
// ============================================================================

export interface HookContext {
  event: HookEvent;
  timestamp: string;
  sessionId: string;
  userId?: string;
  projectId?: string;
  tool?: string;
  command?: string;
  input?: any;
  output?: any;
  metadata?: Record<string, any>;
  environment?: Record<string, string>;
  projectDir?: string;
  pluginRoot?: string;
  envFile?: string;
}

export interface HookResult {
  success: boolean;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  output?: any;
  error?: Error;
  metadata?: Record<string, any>;
  blocked?: boolean;
  updatedInput?: any;
  additionalContext?: any;
  permissionDecision?: 'allow' | 'deny' | 'ask';
}

export interface HookExecution {
  hookId: string;
  hookName: string;
  event: HookEvent;
  startTime: string;
  endTime?: string;
  duration?: number;
  result: HookResult;
  error?: Error;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface GlobalConfig {
  version: string;
  hooks: HookConfig[];
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  logPath: string;
  logRotation: {
    enabled: boolean;
    maxSize: number; // bytes
    maxFiles: number;
    retentionDays: number;
  };
  execution: {
    defaultTimeout: number;
    defaultRetry: number;
    parallel: boolean;
    maxParallel: number;
  };
  security: {
    validateCommands: boolean;
    allowedCommands?: string[];
    blockedCommands?: string[];
    sandboxMode: boolean;
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
    lastSync?: string;
  };
}

export interface ProjectConfig {
  version: string;
  hooks: HookConfig[];
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  logPath?: string;
  execution?: {
    defaultTimeout?: number;
    defaultRetry?: number;
    parallel?: boolean;
    maxParallel?: number;
  };
  excludeGlobalHooks?: string[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    lastSync?: string;
  };
}

export interface MergedConfig extends GlobalConfig {
  projectHooks?: HookConfig[];
  excludedHooks?: string[];
}

// ============================================================================
// Execution Options
// ============================================================================

export interface ExecuteOptions {
  timeout?: number;
  retry?: number;
  continueOnError?: boolean;
  exitCodeBlocking?: number[];
  parallel?: boolean;
  validate?: boolean;
  dryRun?: boolean;
}

// ============================================================================
// Logging Types
// ============================================================================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SILENT = 'silent',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  hookId?: string;
  hookName?: string;
  event?: HookEvent;
  message: string;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface LogFilter {
  level?: LogLevel[];
  hookId?: string;
  hookName?: string;
  event?: HookEvent[];
  startTime?: string;
  endTime?: string;
  search?: string;
}

export interface LogStats {
  total: number;
  byLevel: Record<LogLevel, number>;
  byHook: Record<string, number>;
  byEvent: Record<HookEvent, number>;
  timeRange: { start: string; end: string };
}

// ============================================================================
// CLI Types
// ============================================================================

export interface CLIOptions {
  json?: boolean;
  verbose?: boolean;
  silent?: boolean;
  config?: string;
  project?: string;
}

export interface CLICommandOptions {
  [key: string]: any;
}

// ============================================================================
// Error Types
// ============================================================================

export class HookError extends Error {
  constructor(
    message: string,
    public hookId?: string,
    public hookName?: string,
    public event?: HookEvent,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'HookError';
  }
}

export class ConfigError extends Error {
  constructor(
    message: string,
    public configPath?: string,
    public validationErrors?: any[]
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class ExecutionError extends Error {
  constructor(
    message: string,
    public hookId: string,
    public exitCode: number,
    public stdout?: string,
    public stderr?: string
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export type MaybePromise<T> = T | Promise<T>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExecutionSummary {
  total: number;
  successful: number;
  failed: number;
  blocked: number;
  averageDuration: number;
  errors: Array<{ hookId: string; error: string }>;
}

export interface HookStats {
  hookId: string;
  hookName: string;
  executions: number;
  successes: number;
  failures: number;
  blocked: number;
  averageDuration: number;
  lastExecution?: string;
  lastError?: string;
  errorHistory?: Array<{ timestamp: string; error: string }>;
}

// ============================================================================
// Execution Result Types
// ============================================================================

export interface ExecutionResult {
  hookId: string;
  hookName: string;
  event: HookEvent;
  startTime: string;
  endTime: string;
  duration: number;
  result: HookResult;
  blocked?: boolean;
  error?: Error;
}

export interface BatchExecutionResult {
  results: ExecutionResult[];
  summary: ExecutionSummary;
}

// ============================================================================
// Hook Registry Interface
// ============================================================================

export interface HookRegistry {
  register(hookConfig: any): Promise<void>;
  unregister(hookId: string): Promise<void>;
  getHook(hookId: string): any | undefined;
  getAllHooks(): any[];
  getHooksForEvent(event: HookEvent): any[];
  getStats(): any;
  getHookStats(hookId: string): HookStats | undefined;
  clear(): Promise<void>;
  size: number;
  has(hookId: string): boolean;
  getEventsWithHooks(): HookEvent[];
}

// ============================================================================
// Export all types
// ============================================================================
