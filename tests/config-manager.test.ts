/**
 * ConfigManager Test Suite
 * Tests configuration loading, validation, and management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager } from '../src/core/config-manager';
import { ConfigError, HookEvent } from '../src/types';
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

// Generate unique IDs for testing
let idCounter = 0;
const generateTestId = () => {
  idCounter++;
  return `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa${idCounter.toString().padStart(4, '0')}`;
};

describe('ConfigManager', () => {
  let tempDir: string;
  let globalPath: string;
  let projectPath: string;
  let configManager: ConfigManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    idCounter = 0;
    tempDir = path.join(os.tmpdir(), `hookmanager-config-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    globalPath = path.join(tempDir, 'global');
    projectPath = path.join(tempDir, 'project');

    configManager = new ConfigManager({
      globalPath,
      projectPath,
      logger: mockLogger as any,
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  describe('load', () => {
    it('should create default global config if not exists', async () => {
      await configManager.load();

      const globalConfig = configManager.getGlobalConfig();
      expect(globalConfig).toBeDefined();
      expect(globalConfig?.version).toBe('1.0.0');
      expect(globalConfig?.hooks).toEqual([]);
      expect(globalConfig?.logLevel).toBe('info');
      expect(globalConfig?.execution.defaultTimeout).toBe(30000);
      expect(globalConfig?.security.validateCommands).toBe(true);
    });

    it('should load existing global config', async () => {
      const configPath = path.join(globalPath, 'config.json');
      await fs.ensureDir(globalPath);
      await fs.writeJson(configPath, {
        version: '2.0.0',
        hooks: [],
        logLevel: 'debug',
        logPath: path.join(globalPath, 'logs', 'hookmanager.log'),
        logRotation: {
          enabled: true,
          maxSize: 10485760,
          maxFiles: 10,
          retentionDays: 30,
        },
        execution: {
          defaultTimeout: 60000,
          defaultRetry: 3,
          parallel: true,
          maxParallel: 10,
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

      await configManager.load();

      const globalConfig = configManager.getGlobalConfig();
      expect(globalConfig?.version).toBe('2.0.0');
      expect(globalConfig?.logLevel).toBe('debug');
      expect(globalConfig?.execution.defaultTimeout).toBe(60000);
      expect(globalConfig?.execution.parallel).toBe(true);
    });

    it('should load project config if exists', async () => {
      const projectConfigPath = path.join(projectPath, '.claude', 'hooks', 'config.json');
      await fs.ensureDir(path.dirname(projectConfigPath));
      await fs.writeJson(projectConfigPath, {
        version: '1.0.0',
        hooks: [
          {
            id: generateTestId(),
            name: 'Project Hook',
            enabled: true,
            events: [HookEvent.SessionStart],
            handler: { type: 'command', command: 'echo' },
            priority: 50,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await configManager.load();

      const projectConfig = configManager.getProjectConfig();
      expect(projectConfig).toBeDefined();
      expect(projectConfig?.hooks).toHaveLength(1);
      expect(projectConfig?.hooks[0].name).toBe('Project Hook');
    });

    it('should merge global and project configs', async () => {
      // Create global config with a hook
      const globalConfigPath = path.join(globalPath, 'config.json');
      await fs.ensureDir(globalPath);
      await fs.writeJson(globalConfigPath, {
        version: '1.0.0',
        hooks: [
          {
            id: generateTestId(),
            name: 'Global Hook',
            enabled: true,
            events: [HookEvent.SessionStart],
            handler: { type: 'command', command: 'echo' },
            priority: 50,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        logLevel: 'info',
        logPath: path.join(globalPath, 'logs', 'hookmanager.log'),
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

      // Create project config with a hook
      const projectConfigPath = path.join(projectPath, '.claude', 'hooks', 'config.json');
      await fs.ensureDir(path.dirname(projectConfigPath));
      await fs.writeJson(projectConfigPath, {
        version: '1.0.0',
        hooks: [
          {
            id: generateTestId(),
            name: 'Project Hook',
            enabled: true,
            events: [HookEvent.SessionEnd],
            handler: { type: 'command', command: 'echo' },
            priority: 50,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await configManager.load();

      const mergedConfig = configManager.getMergedConfig();
      expect(mergedConfig.hooks).toHaveLength(1);
      expect(mergedConfig.projectHooks).toHaveLength(1);
    });

    it('should exclude hooks specified in project config', async () => {
      const hook1Id = generateTestId();
      const hook2Id = generateTestId();

      const globalConfigPath = path.join(globalPath, 'config.json');
      await fs.ensureDir(globalPath);
      await fs.writeJson(globalConfigPath, {
        version: '1.0.0',
        hooks: [
          {
            id: hook1Id,
            name: 'Global Hook 1',
            enabled: true,
            events: [HookEvent.SessionStart],
            handler: { type: 'command', command: 'echo' },
            priority: 50,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: hook2Id,
            name: 'Global Hook 2',
            enabled: true,
            events: [HookEvent.SessionStart],
            handler: { type: 'command', command: 'echo' },
            priority: 50,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        logLevel: 'info',
        logPath: path.join(globalPath, 'logs', 'hookmanager.log'),
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

      const projectConfigPath = path.join(projectPath, '.claude', 'hooks', 'config.json');
      await fs.ensureDir(path.dirname(projectConfigPath));
      await fs.writeJson(projectConfigPath, {
        version: '1.0.0',
        hooks: [],
        excludeGlobalHooks: [hook1Id],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await configManager.load();

      const mergedConfig = configManager.getMergedConfig();
      expect(mergedConfig.hooks).toHaveLength(1);
      expect(mergedConfig.hooks[0].id).toBe(hook2Id);
      expect(mergedConfig.excludedHooks).toEqual([hook1Id]);
    });

    it('should override execution settings from project config', async () => {
      const globalConfigPath = path.join(globalPath, 'config.json');
      await fs.ensureDir(globalPath);
      await fs.writeJson(globalConfigPath, {
        version: '1.0.0',
        hooks: [],
        logLevel: 'info',
        logPath: path.join(globalPath, 'logs', 'hookmanager.log'),
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

      const projectConfigPath = path.join(projectPath, '.claude', 'hooks', 'config.json');
      await fs.ensureDir(path.dirname(projectConfigPath));
      await fs.writeJson(projectConfigPath, {
        version: '1.0.0',
        hooks: [],
        execution: {
          defaultTimeout: 60000,
          parallel: true,
        },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await configManager.load();

      const mergedConfig = configManager.getMergedConfig();
      expect(mergedConfig.execution.defaultTimeout).toBe(60000);
      expect(mergedConfig.execution.parallel).toBe(true);
      expect(mergedConfig.execution.defaultRetry).toBe(0);
      expect(mergedConfig.execution.maxParallel).toBe(5);
    });
  });

  describe('save', () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it('should save global config', async () => {
      await configManager.save();

      const configPath = path.join(globalPath, 'config.json');
      expect(await fs.pathExists(configPath)).toBe(true);

      const savedConfig = await fs.readJson(configPath);
      expect(savedConfig.version).toBe('1.0.0');
      expect(savedConfig.hooks).toEqual([]);
    });

    it('should save project config if exists', async () => {
      // Add a project hook first
      const projectConfigPath = path.join(projectPath, '.claude', 'hooks', 'config.json');
      await fs.ensureDir(path.dirname(projectConfigPath));
      await fs.writeJson(projectConfigPath, {
        version: '1.0.0',
        hooks: [],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await configManager.load();
      await configManager.save();

      expect(await fs.pathExists(projectConfigPath)).toBe(true);
    });
  });

  describe('addHook', () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it('should add a hook to global config', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'New Hook',
        description: 'A new hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await configManager.addHook(hookConfig);

      const globalConfig = configManager.getGlobalConfig();
      expect(globalConfig?.hooks).toHaveLength(1);
      expect(globalConfig?.hooks[0].name).toBe('New Hook');
    });

    it('should generate ID if not provided', async () => {
      const hookConfig = {
        name: 'New Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await configManager.addHook(hookConfig);

      const globalConfig = configManager.getGlobalConfig();
      expect(globalConfig?.hooks[0].id).toBeDefined();
      expect(globalConfig?.hooks[0].id).toMatch(/^hook-/);
    });

    it('should validate hook config', async () => {
      const hookConfig = {
        name: 'Invalid Hook',
        // Missing required fields
      };

      await expect(configManager.addHook(hookConfig as any)).rejects.toThrow();
    });

    it('should update merged config', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'New Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await configManager.addHook(hookConfig);

      const mergedConfig = configManager.getMergedConfig();
      expect(mergedConfig.hooks).toHaveLength(1);
    });
  });

  describe('removeHook', () => {
    let hookId: string;

    beforeEach(async () => {
      await configManager.load();
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };
      await configManager.addHook(hookConfig);
    });

    it('should remove a hook from global config', async () => {
      await configManager.removeHook(hookId);

      const globalConfig = configManager.getGlobalConfig();
      expect(globalConfig?.hooks).toHaveLength(0);
    });

    it('should throw error when hook not found', async () => {
      await expect(configManager.removeHook('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });

    it('should update merged config', async () => {
      await configManager.removeHook(hookId);

      const mergedConfig = configManager.getMergedConfig();
      expect(mergedConfig.hooks).toHaveLength(0);
    });
  });

  describe('updateHook', () => {
    let hookId: string;

    beforeEach(async () => {
      await configManager.load();
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };
      await configManager.addHook(hookConfig);
    });

    it('should update hook properties', async () => {
      await configManager.updateHook(hookId, {
        name: 'Updated Hook',
        priority: 100,
      });

      const globalConfig = configManager.getGlobalConfig();
      const hook = globalConfig?.hooks.find((h) => h.id === hookId);
      expect(hook?.name).toBe('Updated Hook');
      expect(hook?.priority).toBe(100);
    });

    it('should throw error when hook not found', async () => {
      await expect(
        configManager.updateHook('non-existent', { name: 'Updated' })
      ).rejects.toThrow('Hook not found: non-existent');
    });

    it('should validate updated hook', async () => {
      await expect(
        configManager.updateHook(hookId, { priority: -1 })
      ).rejects.toThrow();
    });
  });

  describe('clearHooks', () => {
    beforeEach(async () => {
      await configManager.load();
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };
      await configManager.addHook(hookConfig);
    });

    it('should clear all hooks from global config', async () => {
      await configManager.clearHooks();

      const globalConfig = configManager.getGlobalConfig();
      expect(globalConfig?.hooks).toHaveLength(0);
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it('should export config as JSON', async () => {
      const exported = await configManager.export('json');
      const parsed = JSON.parse(exported);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.hooks).toEqual([]);
    });

    it('should export config as YAML', async () => {
      const exported = await configManager.export('yaml');
      // YAML export falls back to JSON if yaml package is not available
      expect(exported).toBeDefined();
      expect(exported).toContain('version');
      expect(exported).toContain('hooks');
    });
  });

  describe('import', () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it('should import global config from JSON', async () => {
      const configData = JSON.stringify({
        version: '2.0.0',
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
        logLevel: 'debug',
        logPath: path.join(globalPath, 'logs', 'hookmanager.log'),
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

      await configManager.import(configData, 'json');

      const globalConfig = configManager.getGlobalConfig();
      expect(globalConfig?.version).toBe('2.0.0');
      expect(globalConfig?.hooks).toHaveLength(1);
      expect(globalConfig?.hooks[0].name).toBe('Imported Hook');
    });

    it('should import project config from JSON', async () => {
      const configData = JSON.stringify({
        version: '1.0.0',
        hooks: [
          {
            id: generateTestId(),
            name: 'Project Hook',
            enabled: true,
            events: [HookEvent.SessionStart],
            handler: { type: 'command', command: 'echo' },
            priority: 50,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      await configManager.import(configData, 'json');

      const projectConfig = configManager.getProjectConfig();
      expect(projectConfig?.hooks).toHaveLength(1);
      expect(projectConfig?.hooks[0].name).toBe('Project Hook');
    });

    it('should throw error on invalid config', async () => {
      const invalidData = JSON.stringify({
        version: '1.0.0',
        // Missing required fields
      });

      await expect(configManager.import(invalidData, 'json')).rejects.toThrow();
    });
  });

  describe('validate', () => {
    beforeEach(async () => {
      await configManager.load();
    });

    it('should return valid for default config', async () => {
      const result = await configManager.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect duplicate hook names', async () => {
      const hook1 = {
        id: generateTestId(),
        name: 'Duplicate Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      const hook2 = {
        id: generateTestId(),
        name: 'Duplicate Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await configManager.addHook(hook1);
      await configManager.addHook(hook2);

      const result = await configManager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate hook name: Duplicate Hook');
    });

    it('should detect hooks with no events', async () => {
      // Note: This test validates the Zod schema's events.min(1) constraint
      // which ensures hooks must have at least one event
      const hookConfig = {
        id: generateTestId(),
        name: 'No Events Hook',
        enabled: true,
        events: [],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      // Manually add to bypass validation - use proper ISO datetime strings
      const globalConfig = configManager.getGlobalConfig();
      if (globalConfig) {
        globalConfig.hooks.push({
          ...hookConfig,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          exitCodeBlocking: [2],
          continueOnError: true,
        });
      }

      const result = await configManager.validate();

      // Zod validation will fail first because events array is empty (min(1) constraint)
      expect(result.valid).toBe(false);
      // The error will be from Zod validation, not our custom check
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect hooks with invalid priority', async () => {
      // Note: This test validates the Zod schema's priority.min(0) constraint
      const hookConfig = {
        id: generateTestId(),
        name: 'Invalid Priority Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: -1,
      };

      // Manually add to bypass validation
      const globalConfig = configManager.getGlobalConfig();
      if (globalConfig) {
        globalConfig.hooks.push({
          ...hookConfig,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          exitCodeBlocking: [2],
          continueOnError: true,
        });
      }

      const result = await configManager.validate();

      // Zod validation will fail first because priority is negative (min(0) constraint)
      expect(result.valid).toBe(false);
      // The error will be from Zod validation, not our custom check
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect potentially dangerous commands', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Dangerous Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'sudo rm -rf /' },
        priority: 50,
      };

      await configManager.addHook(hookConfig);

      const result = await configManager.validate();

      expect(result.warnings).toContain(
        'Hook Dangerous Hook uses potentially dangerous command: sudo rm -rf /'
      );
    });
  });

  describe('getPaths', () => {
    it('should return correct paths', () => {
      const paths = configManager.getPaths();

      expect(paths.global).toBe(globalPath);
      expect(paths.project).toBe(projectPath);
    });
  });
});
