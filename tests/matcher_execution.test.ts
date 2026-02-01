
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HookExecutor } from '../src/core/hook-executor';
import { HookRegistry } from '../src/core/hook-registry';
import { HookEvent, LogLevel } from '../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Mock Logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
};

describe('HookExecutor Matcher Logic', () => {
  let registry: HookRegistry;
  let executor: HookExecutor;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), `hookmanager-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    registry = new HookRegistry({ logger: mockLogger as any });
    executor = new HookExecutor({
      logger: mockLogger as any,
      registry,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  it('should execute hook when matcher matches tool name (exact)', async () => {
    const hook = {
      id: 'matcher-hook',
      name: 'Matcher Hook',
      enabled: true,
      events: [HookEvent.PreToolUse],
      handler: {
        type: 'programmatic',
        handler: async () => ({ success: true, exitCode: 0 }),
      },
      matcher: 'Write',
    };

    const context = {
      event: HookEvent.PreToolUse,
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      tool: 'Write',
    };

    const result = await executor.executeHook(hook, context);

    expect(result.result.success).toBe(true);
    expect(result.result.stdout).not.toBe('Matcher did not match');
  });

  it('should skip hook when matcher does not match tool name', async () => {
    const hook = {
      id: 'matcher-hook',
      name: 'Matcher Hook',
      enabled: true,
      events: [HookEvent.PreToolUse],
      handler: {
        type: 'programmatic',
        handler: async () => ({ success: true, exitCode: 0 }),
      },
      matcher: 'Write',
    };

    const context = {
      event: HookEvent.PreToolUse,
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      tool: 'Read',
    };

    const result = await executor.executeHook(hook, context);

    expect(result.result.success).toBe(true);
    expect(result.result.stdout).toBe('Matcher did not match');
  });

  it('should execute hook when matcher is wildcard *', async () => {
    const hook = {
      id: 'wildcard-hook',
      name: 'Wildcard Hook',
      enabled: true,
      events: [HookEvent.PreToolUse],
      handler: {
        type: 'programmatic',
        handler: async () => ({ success: true, exitCode: 0 }),
      },
      matcher: '*',
    };

    const context = {
      event: HookEvent.PreToolUse,
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      tool: 'AnyTool',
    };

    const result = await executor.executeHook(hook, context);

    expect(result.result.success).toBe(true);
    expect(result.result.stdout).not.toBe('Matcher did not match');
  });

  it('should execute hook when matcher matches regex', async () => {
    const hook = {
      id: 'regex-hook',
      name: 'Regex Hook',
      enabled: true,
      events: [HookEvent.PreToolUse],
      handler: {
        type: 'programmatic',
        handler: async () => ({ success: true, exitCode: 0 }),
      },
      matcher: 'Notebook.*',
    };

    const context = {
      event: HookEvent.PreToolUse,
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      tool: 'NotebookCell',
    };

    const result = await executor.executeHook(hook, context);

    expect(result.result.success).toBe(true);
    expect(result.result.stdout).not.toBe('Matcher did not match');
  });

  it('should skip hook when matcher does not match regex', async () => {
    const hook = {
      id: 'regex-hook',
      name: 'Regex Hook',
      enabled: true,
      events: [HookEvent.PreToolUse],
      handler: {
        type: 'programmatic',
        handler: async () => ({ success: true, exitCode: 0 }),
      },
      matcher: 'Notebook.*',
    };

    const context = {
      event: HookEvent.PreToolUse,
      timestamp: new Date().toISOString(),
      sessionId: 'test-session',
      tool: 'Write',
    };

    const result = await executor.executeHook(hook, context);

    expect(result.result.success).toBe(true);
    expect(result.result.stdout).toBe('Matcher did not match');
  });
});
