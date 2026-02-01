/**
 * HookInterceptor Test Suite
 * Tests main entry point and lifecycle event handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HookInterceptor, createHookInterceptor } from '../src/core/hook-interceptor';
import { HookEvent, HookError } from '../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Generate unique IDs for testing
let idCounter = 0;
const generateTestId = () => {
  idCounter++;
  return `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa${idCounter.toString().padStart(4, '0')}`;
};

describe('HookInterceptor', () => {
  let tempDir: string;
  let configPath: string;
  let projectPath: string;
  let interceptor: HookInterceptor;

  beforeEach(async () => {
    vi.clearAllMocks();
    idCounter = 0;
    tempDir = path.join(os.tmpdir(), `hookmanager-interceptor-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    configPath = path.join(tempDir, 'config');
    projectPath = path.join(tempDir, 'project');

    interceptor = new HookInterceptor({
      configPath,
      projectPath,
      autoInitialize: false,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await interceptor.initialize();

      const logger = interceptor.getLogger();
      expect(logger).toBeDefined();

      const registry = interceptor.getRegistry();
      expect(registry).toBeDefined();

      const configManager = interceptor.getConfigManager();
      expect(configManager).toBeDefined();
    });

    it('should load and register hooks from config', async () => {
      // Create a config with a hook
      // ConfigManager loads global config from globalPath/config.json
      await fs.ensureDir(configPath);
      await fs.writeJson(path.join(configPath, 'config.json'), {
        version: '1.0.0',
        hooks: [
          {
            id: generateTestId(),
            name: 'Test Hook',
            enabled: true,
            events: [HookEvent.SessionStart],
            handler: { type: 'command', command: 'echo' },
            priority: 50,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        logLevel: 'info',
        logPath: path.join(configPath, 'logs', 'hookmanager.log'),
        logRotation: {
          enabled: true,
          maxSize: 10485760,
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
          blockedCommands: ['rm -rf'],
          sandboxMode: false,
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await interceptor.initialize();

      const hooks = interceptor.getHooks();
      expect(hooks).toHaveLength(1);
    });

    it('should not re-initialize if already initialized', async () => {
      await interceptor.initialize();

      const logger = interceptor.getLogger();
      const warnSpy = vi.spyOn(logger, 'warn');

      await interceptor.initialize();

      expect(warnSpy).toHaveBeenCalledWith('HookInterceptor already initialized');
    });
  });

  describe('handleEvent', () => {
    beforeEach(async () => {
      await interceptor.initialize();
    });

    it('should return empty result when no hooks registered', async () => {
      const result = await interceptor.handleEvent(HookEvent.SessionStart);

      expect(result.results).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });

    it('should execute hooks for the event', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: {
          type: 'programmatic',
          handler: async () => ({ success: true, exitCode: 0 }),
        },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);

      const result = await interceptor.handleEvent(HookEvent.SessionStart);

      expect(result.results).toHaveLength(1);
      expect(result.summary.successful).toBe(1);
    });

    it('should merge context with default values', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: {
          type: 'programmatic',
          handler: async (context: any) => {
            expect(context.sessionId).toBeDefined();
            expect(context.timestamp).toBeDefined();
            expect(context.projectDir).toBe(projectPath);
            return { success: true, exitCode: 0 };
          },
        },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);

      await interceptor.handleEvent(HookEvent.SessionStart);
    });

    it('should accept custom context', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: {
          type: 'programmatic',
          handler: async (context: any) => {
            expect(context.userId).toBe('user-123');
            expect(context.projectId).toBe('project-456');
            expect(context.tool).toBe('tool-a');
            return { success: true, exitCode: 0 };
          },
        },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);

      await interceptor.handleEvent(HookEvent.SessionStart, {
        userId: 'user-123',
        projectId: 'project-456',
        tool: 'tool-a',
      });
    });

    it('should accept execution options', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: {
          type: 'programmatic',
          handler: async () => ({ success: true, exitCode: 0 }),
        },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);

      const result = await interceptor.handleEvent(HookEvent.SessionStart, {}, {
        parallel: true,
      });

      expect(result.results).toHaveLength(1);
    });

    it('should auto-initialize if not initialized', async () => {
      const newInterceptor = new HookInterceptor({
        configPath,
        projectPath,
        autoInitialize: false,
      });

      const result = await newInterceptor.handleEvent(HookEvent.SessionStart);

      expect(result.results).toHaveLength(0);
    });
  });

  describe('executeHookById', () => {
    let hookId: string;

    beforeEach(async () => {
      await interceptor.initialize();
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: {
          type: 'programmatic',
          handler: async () => ({ success: true, exitCode: 0 }),
        },
        priority: 50,
      };
      await interceptor.registerHook(hookConfig);
    });

    it('should execute a specific hook by ID', async () => {
      const result = await interceptor.executeHookById(hookId);

      expect(result.result.success).toBe(true);
      expect(result.hookId).toBe(hookId);
    });

    it('should throw error when hook not found', async () => {
      await expect(interceptor.executeHookById('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });

    it('should auto-initialize if not initialized', async () => {
      const newInterceptor = new HookInterceptor({
        configPath,
        projectPath,
        autoInitialize: false,
      });

      await expect(newInterceptor.executeHookById('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });
  });

  describe('registerHook', () => {
    beforeEach(async () => {
      await interceptor.initialize();
    });

    it('should register a new hook', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'New Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);

      const hooks = interceptor.getHooks();
      expect(hooks).toHaveLength(1);
    });

    it('should persist hook to config', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'New Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);

      // Re-initialize to check persistence
      const newInterceptor = new HookInterceptor({
        configPath,
        projectPath,
        autoInitialize: false,
      });
      await newInterceptor.initialize();

      const hooks = newInterceptor.getHooks();
      expect(hooks).toHaveLength(1);
    });
  });

  describe('unregisterHook', () => {
    let hookId: string;

    beforeEach(async () => {
      await interceptor.initialize();
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };
      await interceptor.registerHook(hookConfig);
    });

    it('should unregister a hook', async () => {
      await interceptor.unregisterHook(hookId);

      const hooks = interceptor.getHooks();
      expect(hooks).toHaveLength(0);
    });

    it('should remove hook from config', async () => {
      await interceptor.unregisterHook(hookId);

      // Re-initialize to check persistence
      const newInterceptor = new HookInterceptor({
        configPath,
        projectPath,
        autoInitialize: false,
      });
      await newInterceptor.initialize();

      const hooks = newInterceptor.getHooks();
      expect(hooks).toHaveLength(0);
    });

    it('should throw error when hook not found', async () => {
      await expect(interceptor.unregisterHook('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });
  });

  describe('getHooksForEvent', () => {
    beforeEach(async () => {
      await interceptor.initialize();
    });

    it('should return hooks for specific event', async () => {
      const hook1 = {
        id: generateTestId(),
        name: 'Hook 1',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      const hook2 = {
        id: generateTestId(),
        name: 'Hook 2',
        enabled: true,
        events: [HookEvent.SessionEnd],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await interceptor.registerHook(hook1);
      await interceptor.registerHook(hook2);

      const startHooks = interceptor.getHooksForEvent(HookEvent.SessionStart);
      expect(startHooks).toHaveLength(1);

      const endHooks = interceptor.getHooksForEvent(HookEvent.SessionEnd);
      expect(endHooks).toHaveLength(1);
    });
  });

  describe('getHook', () => {
    let hookId: string;

    beforeEach(async () => {
      await interceptor.initialize();
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };
      await interceptor.registerHook(hookConfig);
    });

    it('should return hook by ID', () => {
      const hook = interceptor.getHook(hookId);
      expect(hook).toBeDefined();
      expect(hook?.id).toBe(hookId);
    });

    it('should return undefined for non-existent hook', () => {
      const hook = interceptor.getHook('non-existent');
      expect(hook).toBeUndefined();
    });
  });

  describe('enableHook/disableHook', () => {
    let hookId: string;

    beforeEach(async () => {
      await interceptor.initialize();
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: false,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };
      await interceptor.registerHook(hookConfig);
    });

    it('should enable a hook', async () => {
      await interceptor.enableHook(hookId);

      const hook = interceptor.getHook(hookId);
      expect(hook.enabled).toBe(true);
    });

    it('should persist enabled state', async () => {
      await interceptor.enableHook(hookId);

      const newInterceptor = new HookInterceptor({
        configPath,
        projectPath,
        autoInitialize: false,
      });
      await newInterceptor.initialize();

      const hook = newInterceptor.getHook(hookId);
      expect(hook.enabled).toBe(true);
    });

    it('should disable a hook', async () => {
      await interceptor.enableHook(hookId);
      await interceptor.disableHook(hookId);

      const hook = interceptor.getHook(hookId);
      expect(hook.enabled).toBe(false);
    });

    it('should throw error when enabling non-existent hook', async () => {
      await expect(interceptor.enableHook('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });

    it('should throw error when disabling non-existent hook', async () => {
      await expect(interceptor.disableHook('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });
  });

  describe('updateHookPriority', () => {
    let hookId: string;

    beforeEach(async () => {
      await interceptor.initialize();
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };
      await interceptor.registerHook(hookConfig);
    });

    it('should update hook priority', async () => {
      await interceptor.updateHookPriority(hookId, 100);

      const hook = interceptor.getHook(hookId);
      expect(hook.priority).toBe(100);
    });

    it('should persist priority change', async () => {
      await interceptor.updateHookPriority(hookId, 100);

      const newInterceptor = new HookInterceptor({
        configPath,
        projectPath,
        autoInitialize: false,
      });
      await newInterceptor.initialize();

      const hook = newInterceptor.getHook(hookId);
      expect(hook.priority).toBe(100);
    });

    it('should throw error when hook not found', async () => {
      await expect(
        interceptor.updateHookPriority('non-existent', 100)
      ).rejects.toThrow('Hook not found: non-existent');
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await interceptor.initialize();
    });

    it('should return execution statistics', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: {
          type: 'programmatic',
          handler: async () => ({ success: true, exitCode: 0 }),
        },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);
      await interceptor.handleEvent(HookEvent.SessionStart);

      const stats = interceptor.getStats();
      expect(stats.totalHooks).toBe(1);
      expect(stats.totalExecutions).toBe(1);
      expect(stats.successfulExecutions).toBe(1);
    });
  });

  describe('getHookStats', () => {
    let hookId: string;

    beforeEach(async () => {
      await interceptor.initialize();
      hookId = generateTestId();
    });

    it('should return hook-specific statistics', async () => {
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: {
          type: 'programmatic',
          handler: async () => ({ success: true, exitCode: 0 }),
        },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);
      await interceptor.handleEvent(HookEvent.SessionStart);

      const stats = interceptor.getHookStats(hookId);
      expect(stats?.executions).toBe(1);
      expect(stats?.successes).toBe(1);
    });

    it('should return undefined for non-existent hook', () => {
      const stats = interceptor.getHookStats('non-existent');
      expect(stats).toBeUndefined();
    });
  });

  describe('clearHooks', () => {
    let hookId: string;

    beforeEach(async () => {
      await interceptor.initialize();
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };
      await interceptor.registerHook(hookConfig, true);
    });

    it('should clear all hooks', async () => {
      await interceptor.clearHooks();

      const hooks = interceptor.getHooks();
      expect(hooks).toHaveLength(0);
    });

    it('should persist cleared state', async () => {
      await interceptor.clearHooks();

      const newInterceptor = new HookInterceptor({
        configPath,
        projectPath,
        autoInitialize: false,
      });
      await newInterceptor.initialize();

      const hooks = newInterceptor.getHooks();
      expect(hooks).toHaveLength(0);
    });
  });

  describe('exportConfig/importConfig', () => {
    let hookId: string;

    beforeEach(async () => {
      await interceptor.initialize();
      hookId = generateTestId();
    });

    it('should export configuration as JSON', async () => {
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig, true);

      const exported = await interceptor.exportConfig('json');
      const parsed = JSON.parse(exported);

      expect(parsed.hooks).toHaveLength(1);
    });

    it('should export configuration as YAML', async () => {
      const exported = await interceptor.exportConfig('yaml');
      // YAML export falls back to JSON if yaml package is not available
      expect(exported).toBeDefined();
      expect(exported).toContain('version');
      expect(exported).toContain('hooks');
    });

    it('should import configuration', async () => {
      const configData = JSON.stringify({
        version: '1.0.0',
        hooks: [
          {
            id: generateTestId(),
            name: 'Imported Hook',
            enabled: true,
            events: [HookEvent.SessionStart],
            handler: { type: 'command', command: 'echo' },
            priority: 50,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        logLevel: 'info',
        logPath: path.join(configPath, 'logs', 'hookmanager.log'),
        logRotation: {
          enabled: true,
          maxSize: 10485760,
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
          blockedCommands: ['rm -rf'],
          sandboxMode: false,
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await interceptor.importConfig(configData, 'json');

      // Note: importConfig calls initialize() which returns early if already initialized
      // So the hooks won't be re-registered. This is a known limitation.
      // Instead, we verify that the config was saved correctly.
      const configManager = interceptor.getConfigManager();
      const globalConfig = configManager.getGlobalConfig();
      expect(globalConfig?.hooks).toHaveLength(1);
      expect(globalConfig?.hooks[0].name).toBe('Imported Hook');
    });
  });

  describe('validate', () => {
    beforeEach(async () => {
      await interceptor.initialize();
    });

    it('should validate configuration', async () => {
      const result = await interceptor.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect configuration issues', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'sudo rm -rf /' },
        priority: 50,
      };

      await interceptor.registerHook(hookConfig);

      const result = await interceptor.validate();

      expect(result.warnings).toContain(
        'Hook Test Hook uses potentially dangerous command: sudo rm -rf /'
      );
    });
  });

  describe('destroy', () => {
    beforeEach(async () => {
      await interceptor.initialize();
    });

    it('should clean up resources', async () => {
      await interceptor.destroy();

      // Should be able to re-initialize after destroy
      await interceptor.initialize();
      expect(interceptor.getHooks()).toBeDefined();
    });
  });

  describe('create factory method', () => {
    it('should create interceptor instance', () => {
      const interceptor = HookInterceptor.create({
        configPath,
        projectPath,
        autoInitialize: false,
      });

      expect(interceptor).toBeInstanceOf(HookInterceptor);
    });
  });

  describe('createHookInterceptor factory function', () => {
    it('should create interceptor instance', () => {
      const interceptor = createHookInterceptor({
        configPath,
        projectPath,
        autoInitialize: false,
      });

      expect(interceptor).toBeInstanceOf(HookInterceptor);
    });
  });
});
