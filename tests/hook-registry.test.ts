/**
 * HookRegistry Test Suite
 * Tests hook registration, execution ordering, and statistics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HookRegistry } from '../src/core/hook-registry';
import { HookEvent, HookError, LogLevel } from '../src/types';

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

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    registry = new HookRegistry({ logger: mockLogger as any });
  });

  afterEach(async () => {
    await registry.clear();
  });

  describe('register', () => {
    it('should register a valid hook', async () => {
      const hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        description: 'A test hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await registry.register(hookConfig);

      expect(registry.has(hookId)).toBe(true);
      expect(registry.size).toBe(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Registered hook: Test Hook (${hookId})`
      );
    });

    it('should throw error when hook ID is missing', async () => {
      const hookConfig = {
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };

      await expect(registry.register(hookConfig as any)).rejects.toThrow(
        'Hook ID is required'
      );
    });

    it('should throw error when hook name is missing', async () => {
      const hookConfig = {
        id: generateTestId(),
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };

      await expect(registry.register(hookConfig as any)).rejects.toThrow(
        'Hook name is required'
      );
    });

    it('should throw error when no events are specified', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [],
        handler: { type: 'command', command: 'echo' },
      };

      await expect(registry.register(hookConfig as any)).rejects.toThrow(
        'Hook must have at least one event'
      );
    });

    it('should throw error when handler is missing', async () => {
      const hookConfig = {
        id: generateTestId(),
        name: 'Test Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
      };

      await expect(registry.register(hookConfig as any)).rejects.toThrow(
        'Hook handler is required'
      );
    });

    it('should register hook with default values', async () => {
      const hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };

      await registry.register(hookConfig);

      const hook = registry.getHook(hookId);
      expect(hook.enabled).toBe(true);
      expect(hook.priority).toBe(50);
      expect(hook.continueOnError).toBe(true);
      expect(hook.exitCodeBlocking).toEqual([2]);
    });

    it('should index hook by event', async () => {
      const hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        events: [HookEvent.SessionStart, HookEvent.SessionEnd],
        handler: { type: 'command', command: 'echo' },
      };

      await registry.register(hookConfig);

      const startHooks = registry.getHooksForEvent(HookEvent.SessionStart);
      const endHooks = registry.getHooksForEvent(HookEvent.SessionEnd);

      expect(startHooks).toHaveLength(1);
      expect(endHooks).toHaveLength(1);
      expect(startHooks[0].id).toBe(hookId);
      expect(endHooks[0].id).toBe(hookId);
    });
  });

  describe('unregister', () => {
    let hookId: string;

    beforeEach(async () => {
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };
      await registry.register(hookConfig);
    });

    it('should unregister an existing hook', async () => {
      await registry.unregister(hookId);

      expect(registry.has(hookId)).toBe(false);
      expect(registry.size).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Unregistered hook: Test Hook (${hookId})`
      );
    });

    it('should throw error when hook not found', async () => {
      await expect(registry.unregister('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });

    it('should remove hook from event index', async () => {
      await registry.unregister(hookId);

      const hooks = registry.getHooksForEvent(HookEvent.SessionStart);
      expect(hooks).toHaveLength(0);
    });
  });

  describe('getHooksForEvent', () => {
    it('should return empty array when no hooks registered', () => {
      const hooks = registry.getHooksForEvent(HookEvent.SessionStart);
      expect(hooks).toEqual([]);
    });

    it('should return only enabled hooks', async () => {
      const enabledHookId = generateTestId();
      const disabledHookId = generateTestId();

      const enabledHook = {
        id: enabledHookId,
        name: 'Enabled Hook',
        enabled: true,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };

      const disabledHook = {
        id: disabledHookId,
        name: 'Disabled Hook',
        enabled: false,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };

      await registry.register(enabledHook);
      await registry.register(disabledHook);

      const hooks = registry.getHooksForEvent(HookEvent.SessionStart);
      expect(hooks).toHaveLength(1);
      expect(hooks[0].id).toBe(enabledHookId);
    });

    it('should sort hooks by priority', async () => {
      const highPriorityId = generateTestId();
      const lowPriorityId = generateTestId();
      const mediumPriorityId = generateTestId();

      const highPriorityHook = {
        id: highPriorityId,
        name: 'High Priority',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 10,
      };

      const lowPriorityHook = {
        id: lowPriorityId,
        name: 'Low Priority',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 100,
      };

      const mediumPriorityHook = {
        id: mediumPriorityId,
        name: 'Medium Priority',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
        priority: 50,
      };

      await registry.register(highPriorityHook);
      await registry.register(lowPriorityHook);
      await registry.register(mediumPriorityHook);

      const hooks = registry.getHooksForEvent(HookEvent.SessionStart);
      expect(hooks).toHaveLength(3);
      expect(hooks[0].id).toBe(highPriorityId);
      expect(hooks[1].id).toBe(mediumPriorityId);
      expect(hooks[2].id).toBe(lowPriorityId);
    });
  });

  describe('getHooksForEvents', () => {
    it('should return hooks for multiple events without duplicates', async () => {
      const hook1Id = generateTestId();
      const hook2Id = generateTestId();

      const hook1 = {
        id: hook1Id,
        name: 'Hook 1',
        events: [HookEvent.SessionStart, HookEvent.SessionEnd],
        handler: { type: 'command', command: 'echo' },
      };

      const hook2 = {
        id: hook2Id,
        name: 'Hook 2',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };

      await registry.register(hook1);
      await registry.register(hook2);

      const hooks = registry.getHooksForEvents([
        HookEvent.SessionStart,
        HookEvent.SessionEnd,
      ]);

      expect(hooks).toHaveLength(2);
      expect(hooks.map((h) => h.id).sort()).toEqual([hook1Id, hook2Id].sort());
    });
  });

  describe('updateStats', () => {
    let hookId: string;

    beforeEach(async () => {
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };
      await registry.register(hookConfig);
    });

    it('should update execution count on success', () => {
      registry.updateStats(hookId, 100, true);

      const stats = registry.getHookStats(hookId);
      expect(stats?.executions).toBe(1);
      expect(stats?.successes).toBe(1);
      expect(stats?.failures).toBe(0);
      expect(stats?.averageDuration).toBe(100);
    });

    it('should update failure count on failure', () => {
      registry.updateStats(hookId, 100, false);

      const stats = registry.getHookStats(hookId);
      expect(stats?.executions).toBe(1);
      expect(stats?.successes).toBe(0);
      expect(stats?.failures).toBe(1);
    });

    it('should update blocked count', () => {
      registry.updateStats(hookId, 100, true, true);

      const stats = registry.getHookStats(hookId);
      expect(stats?.blocked).toBe(1);
    });

    it('should calculate average duration correctly', () => {
      registry.updateStats(hookId, 100, true);
      registry.updateStats(hookId, 200, true);
      registry.updateStats(hookId, 300, true);

      const stats = registry.getHookStats(hookId);
      expect(stats?.averageDuration).toBe(200);
    });

    it('should update hook execution count', () => {
      registry.updateStats(hookId, 100, true);

      const hook = registry.getHook(hookId);
      expect(hook.executionCount).toBe(1);
      expect(hook.successCount).toBe(1);
      expect(hook.failureCount).toBe(0);
    });

    it('should do nothing if hook not found', () => {
      expect(() => {
        registry.updateStats('non-existent', 100, true);
      }).not.toThrow();
    });
  });

  describe('recordError', () => {
    let hookId: string;

    beforeEach(async () => {
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };
      await registry.register(hookConfig);
    });

    it('should record error message', () => {
      const error = new Error('Test error');
      registry.recordError(hookId, error);

      const stats = registry.getHookStats(hookId);
      expect(stats?.lastError).toBe('Test error');
      expect(stats?.errorHistory).toHaveLength(1);
      expect(stats?.errorHistory[0].error).toBe('Test error');
    });

    it('should update hook lastError', () => {
      const error = new Error('Test error');
      registry.recordError(hookId, error);

      const hook = registry.getHook(hookId);
      expect(hook.lastError).toBe('Test error');
    });

    it('should limit error history to 100 entries', () => {
      for (let i = 0; i < 150; i++) {
        const error = new Error(`Error ${i}`);
        registry.recordError(hookId, error);
      }

      const stats = registry.getHookStats(hookId);
      expect(stats?.errorHistory).toHaveLength(100);
      expect(stats?.errorHistory[0].error).toBe('Error 50');
    });

    it('should do nothing if hook not found', () => {
      expect(() => {
        registry.recordError('non-existent', new Error('Test'));
      }).not.toThrow();
    });
  });

  describe('enable/disable', () => {
    let hookId: string;

    beforeEach(async () => {
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        enabled: false,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };
      await registry.register(hookConfig);
    });

    it('should enable a disabled hook', async () => {
      await registry.enable(hookId);

      const hook = registry.getHook(hookId);
      expect(hook.enabled).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Enabled hook: Test Hook (${hookId})`
      );
    });

    it('should throw error when enabling non-existent hook', async () => {
      await expect(registry.enable('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });

    it('should disable an enabled hook', async () => {
      await registry.enable(hookId);
      await registry.disable(hookId);

      const hook = registry.getHook(hookId);
      expect(hook.enabled).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Disabled hook: Test Hook (${hookId})`
      );
    });

    it('should throw error when disabling non-existent hook', async () => {
      await expect(registry.disable('non-existent')).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });
  });

  describe('updatePriority', () => {
    let hookId: string;

    beforeEach(async () => {
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        priority: 50,
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };
      await registry.register(hookConfig);
    });

    it('should update hook priority', async () => {
      await registry.updatePriority(hookId, 100);

      const hook = registry.getHook(hookId);
      expect(hook.priority).toBe(100);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Updated priority for hook: Test Hook (${hookId})`,
        { priority: 100 }
      );
    });

    it('should throw error when priority is too low', async () => {
      await expect(registry.updatePriority(hookId, -1)).rejects.toThrow(
        'Priority must be between 0 and 1000'
      );
    });

    it('should throw error when priority is too high', async () => {
      await expect(registry.updatePriority(hookId, 1001)).rejects.toThrow(
        'Priority must be between 0 and 1000'
      );
    });

    it('should throw error when hook not found', async () => {
      await expect(registry.updatePriority('non-existent', 50)).rejects.toThrow(
        'Hook not found: non-existent'
      );
    });
  });

  describe('updateEvents', () => {
    let hookId: string;

    beforeEach(async () => {
      hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };
      await registry.register(hookConfig);
    });

    it('should update hook events', async () => {
      await registry.updateEvents(hookId, [
        HookEvent.SessionEnd,
        HookEvent.UserPromptSubmit,
      ]);

      const hook = registry.getHook(hookId);
      expect(hook.events).toEqual([
        HookEvent.SessionEnd,
        HookEvent.UserPromptSubmit,
      ]);

      // Old event should no longer have the hook
      const startHooks = registry.getHooksForEvent(HookEvent.SessionStart);
      expect(startHooks).toHaveLength(0);

      // New events should have the hook
      const endHooks = registry.getHooksForEvent(HookEvent.SessionEnd);
      expect(endHooks).toHaveLength(1);
      expect(endHooks[0].id).toBe(hookId);
    });

    it('should throw error when events array is empty', async () => {
      await expect(registry.updateEvents(hookId, [])).rejects.toThrow(
        'Events cannot be empty'
      );
    });

    it('should throw error when hook not found', async () => {
      await expect(
        registry.updateEvents('non-existent', [HookEvent.SessionEnd])
      ).rejects.toThrow('Hook not found: non-existent');
    });
  });

  describe('getStats', () => {
    let hook1Id: string;
    let hook2Id: string;

    beforeEach(async () => {
      hook1Id = generateTestId();
      hook2Id = generateTestId();

      const hook1 = {
        id: hook1Id,
        name: 'Hook 1',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };
      const hook2 = {
        id: hook2Id,
        name: 'Hook 2',
        events: [HookEvent.SessionEnd],
        handler: { type: 'command', command: 'echo' },
      };
      await registry.register(hook1);
      await registry.register(hook2);
    });

    it('should return total hook count', () => {
      const stats = registry.getStats();
      expect(stats.totalHooks).toBe(2);
    });

    it('should count enabled hooks', async () => {
      await registry.disable(hook1Id);

      const stats = registry.getStats();
      expect(stats.enabledHooks).toBe(1);
    });

    it('should return execution statistics', () => {
      registry.updateStats(hook1Id, 100, true);
      registry.updateStats(hook1Id, 200, true);
      registry.updateStats(hook2Id, 150, false);

      const stats = registry.getStats();
      expect(stats.totalExecutions).toBe(3);
      expect(stats.successfulExecutions).toBe(2);
      expect(stats.failedExecutions).toBe(1);
      expect(stats.blockedExecutions).toBe(0);
    });

    it('should return stats by hook', () => {
      registry.updateStats(hook1Id, 100, true);

      const stats = registry.getStats();
      expect(stats.byHook).toHaveLength(2);
      const hook1Stats = stats.byHook.find((h) => h.hookId === hook1Id);
      expect(hook1Stats?.executions).toBe(1);
    });

    it('should return stats by event', () => {
      const stats = registry.getStats();
      expect(stats.byEvent).toHaveProperty(HookEvent.SessionStart);
      expect(stats.byEvent).toHaveProperty(HookEvent.SessionEnd);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      const hookId = generateTestId();
      const hookConfig = {
        id: hookId,
        name: 'Test Hook',
        events: [HookEvent.SessionStart],
        handler: { type: 'command', command: 'echo' },
      };
      await registry.register(hookConfig);
    });

    it('should remove all hooks', async () => {
      await registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.getAllHooks()).toHaveLength(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'All hooks cleared from registry'
      );
    });
  });

  describe('getEventsWithHooks', () => {
    it('should return empty array when no hooks', () => {
      const events = registry.getEventsWithHooks();
      expect(events).toEqual([]);
    });

    it('should return all events with registered hooks', async () => {
      const hook1Id = generateTestId();
      const hook2Id = generateTestId();

      const hook1 = {
        id: hook1Id,
        name: 'Hook 1',
        events: [HookEvent.SessionStart, HookEvent.SessionEnd],
        handler: { type: 'command', command: 'echo' },
      };
      const hook2 = {
        id: hook2Id,
        name: 'Hook 2',
        events: [HookEvent.UserPromptSubmit],
        handler: { type: 'command', command: 'echo' },
      };

      await registry.register(hook1);
      await registry.register(hook2);

      const events = registry.getEventsWithHooks();
      expect(events).toHaveLength(3);
      expect(events).toContain(HookEvent.SessionStart);
      expect(events).toContain(HookEvent.SessionEnd);
      expect(events).toContain(HookEvent.UserPromptSubmit);
    });
  });
});
