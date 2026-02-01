
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager } from '../src/core/config-manager';
import { HookEvent, LogLevel } from '../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../src/logging';

const mockLogger = new Logger({ level: LogLevel.SILENT as unknown as LogLevel, path: 'test.log', format: 'json' });

describe('Matcher Field Reproduction', () => {
  let configManager: ConfigManager;
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `hookmanager-repro-${Date.now()}`);
    await fs.ensureDir(tempDir);
    const configFile = path.join(tempDir, 'config.json');

    // Create a config file with a hook containing 'matcher'
    const initialConfig = {
      version: '1.0.0',
      hooks: [
        {
          id: 'test-hook',
          name: 'Test Hook',
          enabled: true,
          events: ['SessionStart'],
          handler: {
            type: 'command',
            command: 'echo "hello"'
          },
          matcher: 'some-pattern', // This field is not in HookConfig
          priority: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      logLevel: 'info',
      logPath: path.join(tempDir, 'logs', 'hookmanager.log'),
      logRotation: { enabled: false, maxSize: 1024, maxFiles: 1, retentionDays: 1 },
      execution: { defaultTimeout: 1000, defaultRetry: 0, parallel: false, maxParallel: 1 },
      security: { validateCommands: false, sandboxMode: false },
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    };

    await fs.writeJson(configFile, initialConfig);

    configManager = new ConfigManager({
      globalPath: tempDir,
      projectPath: tempDir,
      logger: mockLogger
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {});
  });

  it('should preserve the matcher field when loading config', async () => {
    await configManager.load();
    const config = configManager.getMergedConfig();
    const hook = config.hooks.find(h => h.id === 'test-hook');
    
    expect(hook).toBeDefined();
    expect(hook?.matcher).toBe('some-pattern');
  });
});
