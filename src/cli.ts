#!/usr/bin/env node
/**
 * HookManager CLI
 * Command-line interface for managing Claude Code hooks
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

import { HookInterceptor } from './core/hook-interceptor';
import { HookEvent, LogLevel, HookConfig, HookContext } from './types';

interface CliOptions {
  config?: string;
  project?: string;
  logLevel?: string;
  json?: boolean;
  verbose?: boolean;
}

const program = new Command();

program
  .name('hookmanager')
  .description('Universal hook manager for Claude Code')
  .version('1.0.0')
  .option('--config <path>', 'Configuration file path')
  .option('--project <path>', 'Project path')
  .option('--log-level <level>', 'Log level', 'info')
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Verbose output');

interface InitOptions {
  preset?: string;
  global?: boolean;
  interactive?: boolean;
}

interface AddHookOptions {
  description?: string;
  priority?: string;
  filterTools?: string;
  filterCommands?: string;
  filterPatterns?: string;
  timeout?: string;
  retry?: string;
  continueOnError?: boolean;
  exitCodeBlocking?: string;
  global?: boolean;
}

interface ListOptions {
  enabled?: boolean;
  disabled?: boolean;
  global?: boolean;
}

interface LogsOptions {
  tail?: string;
  follow?: boolean;
  filter?: string;
  level?: string;
  hook?: string;
  export?: string;
}

interface ConfigOptions {
  show?: boolean;
  edit?: boolean;
  validate?: boolean;
  export?: string;
  import?: string;
}

interface InstallOptions {
  global?: boolean;
}

interface ValidateOptions {
  global?: boolean;
}

interface StatsOptions {
  hook?: string;
}

interface OrderOptions {
  global?: boolean;
}

interface UninstallOptions {
  global?: boolean;
  purge?: boolean;
}

// ============================================================================
// Init Command
// ============================================================================
program
  .command('init [path]')
  .description('Initialize HookManager for a project')
  .option('--preset <preset>', 'Preset configuration (minimal, full, security)')
  .option('--global', 'Initialize global configuration')
  .option('--interactive', 'Interactive setup')
  .action(async (projectPath = process.cwd(), options: InitOptions) => {
    const spinner = ora('Initializing HookManager...').start();
    const json = program.opts().json;

    try {
      // Determine target path based on --global flag
      const targetPath = options.global ? undefined : projectPath;
      const initType = options.global ? 'global' : 'project';

      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: targetPath,
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      if (options.interactive) {
        spinner.stop();
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'preset',
            message: 'Choose a preset configuration:',
            choices: ['minimal', 'full', 'security'],
            default: 'full',
          },
          {
            type: 'confirm',
            name: 'installUniversal',
            message: `Install universal hook into ${initType} Claude Code settings?`,
            default: true,
          },
        ]);

        if (answers.installUniversal) {
          const installSpinner = ora('Installing universal hook...').start();
          await installUniversalHook(options.global);
          installSpinner.succeed('Universal hook installed');
        }

        spinner.start();
      } else {
        // Always install universal hook in non-interactive mode
        await installUniversalHook(options.global);
      }

      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, path: targetPath || 'global', type: initType }, null, 2));
      } else {
        spinner.succeed(`HookManager ${initType} configuration initialized`);
        if (options.global) {
          console.log(chalk.gray(`  Global config: ~/.claude/hooks/config.json`));
          console.log(chalk.gray(`  Global settings: ~/.claude/settings.json`));
        } else {
          console.log(chalk.gray(`  Project config: ${path.join(projectPath, '.claude', 'hooks', 'config.json')}`));
          console.log(chalk.gray(`  Project settings: ${path.join(projectPath, '.claude', 'settings.json')}`));
        }
      }
    } catch (error) {
      spinner.fail('Initialization failed');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Add Hook Command
// ============================================================================
program
  .command('add <name> <lifecycle>')
  .description('Add a new hook')
  .argument('<command>', 'Command or script to execute')
  .option('--description <text>', 'Hook description')
  .option('--priority <number>', 'Execution priority (0-1000)', '50')
  .option('--filter-tools <tools>', 'Filter by tools (comma-separated)')
  .option('--filter-commands <commands>', 'Filter by commands (comma-separated)')
  .option('--filter-patterns <patterns>', 'Filter by patterns (comma-separated)')
  .option('--timeout <ms>', 'Timeout in milliseconds', '30000')
  .option('--retry <number>', 'Number of retries', '0')
  .option('--continue-on-error', 'Continue on error')
  .option('--exit-code-blocking <codes>', 'Exit codes that block (comma-separated)', '2')
  .option('--global', 'Add to global config (default: project)')
  .action(async (name: string, lifecycle: string, command: string, options: AddHookOptions) => {
    const spinner = ora('Adding hook...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: options.global ? undefined : process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      // Validate lifecycle
      const validEvents = Object.values(HookEvent);
      if (!validEvents.includes(lifecycle as HookEvent)) {
        throw new Error(`Invalid lifecycle event: ${lifecycle}. Valid events: ${validEvents.join(', ')}`);
      }

      // Parse filters
      const filter: { tools?: string[]; commands?: string[]; patterns?: string[] } = {};
      if (options.filterTools) {
        filter.tools = options.filterTools.split(',').map((t: string) => t.trim());
      }
      if (options.filterCommands) {
        filter.commands = options.filterCommands.split(',').map((c: string) => c.trim());
      }
      if (options.filterPatterns) {
        filter.patterns = options.filterPatterns.split(',').map((p: string) => p.trim());
      }

      // Parse exit codes
      const exitCodeBlocking = options.exitCodeBlocking
        ? options.exitCodeBlocking
            .split(',')
            .map((c: string) => parseInt(c.trim(), 10))
            .filter((c: number) => !isNaN(c))
        : [2];

      const hookConfig: Partial<HookConfig> = {
        id: name,
        name,
        description: options.description || '',
        enabled: true,
        events: [lifecycle as HookEvent],
        handler: {
          type: 'command' as const,
          command,
          timeout: parseInt(options.timeout, 10),
          retry: parseInt(options.retry, 10),
        },
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        priority: parseInt(options.priority, 10),
        continueOnError: options.continueOnError,
        exitCodeBlocking,
      };

      await interceptor.registerHook(hookConfig);
      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, hook: hookConfig }, null, 2));
      } else {
        spinner.succeed(`Hook "${name}" added successfully`);
        console.log(chalk.gray(`  Lifecycle: ${lifecycle}`));
        console.log(chalk.gray(`  Command: ${command}`));
        console.log(chalk.gray(`  Priority: ${options.priority}`));
      }
    } catch (error) {
      spinner.fail('Failed to add hook');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Remove Hook Command
// ============================================================================
program
  .command('remove <hook-id>')
  .description('Remove a hook')
  .option('--global', 'Remove from global config (default: project)')
  .action(async (hookId: string, options: OrderOptions) => {
    const spinner = ora('Removing hook...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: options.global ? undefined : process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();
      await interceptor.unregisterHook(hookId);
      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, hookId }, null, 2));
      } else {
        spinner.succeed(`Hook "${hookId}" removed successfully`);
      }
    } catch (error) {
      spinner.fail('Failed to remove hook');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// List Hooks Command
// ============================================================================
program
  .command('list [lifecycle]')
  .description('List hooks (optionally filtered by lifecycle)')
  .option('--enabled', 'Show only enabled hooks')
  .option('--disabled', 'Show only disabled hooks')
  .option('--global', 'Show global hooks only (default: project)')
  .action(async (lifecycle: string | undefined, options: ListOptions) => {
    const spinner = ora('Loading hooks...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: options.global ? undefined : process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      // Get hooks based on scope (global vs project)
      let hooks = options.global
        ? interceptor.getGlobalHooks()
        : interceptor.getProjectHooks();

      // Filter by lifecycle
      if (lifecycle) {
        hooks = hooks.filter((h) => h.events.includes(lifecycle));
      }

      // Filter by enabled/disabled
      if (options.enabled) {
        hooks = hooks.filter((h) => h.enabled);
      }
      if (options.disabled) {
        hooks = hooks.filter((h) => !h.enabled);
      }

      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, hooks, scope: options.global ? 'global' : 'project' }, null, 2));
      } else {
        spinner.stop();

        if (hooks.length === 0) {
          console.log(chalk.yellow('No hooks found'));
          return;
        }

        console.log(chalk.bold(`\nFound ${hooks.length} hook(s) (${options.global ? 'global' : 'project'}):\n`));

        hooks.forEach((hook) => {
          const status = hook.enabled ? chalk.green('✓') : chalk.gray('✗');
          const events = hook.events.join(', ');
          const priority = hook.priority.toString().padStart(3, ' ');

          console.log(`${status} ${chalk.bold(hook.name)}`);
          console.log(`  ${chalk.cyan('ID:')} ${chalk.yellow(hook.id)}`);
          console.log(`  ${chalk.gray('Lifecycle:')} ${events}`);
          console.log(`  ${chalk.gray('Priority:')} ${priority}`);
          console.log(`  ${chalk.gray('Handler:')} ${hook.handler.type}`);
          if (hook.description) {
            console.log(`  ${chalk.gray('Description:')} ${hook.description}`);
          }
          console.log('');
        });
      }
    } catch (error) {
      spinner.fail('Failed to list hooks');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Enable/Disable Hook Commands
// ============================================================================
program
  .command('enable <hook-id>')
  .description('Enable a hook')
  .option('--global', 'Enable global hook (default: project)')
  .action(async (hookId: string, options: OrderOptions) => {
    const spinner = ora('Enabling hook...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: options.global ? undefined : process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();
      await interceptor.enableHook(hookId);
      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, hookId }, null, 2));
      } else {
        spinner.succeed(`Hook "${hookId}" enabled`);
      }
    } catch (error) {
      spinner.fail('Failed to enable hook');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

program
  .command('disable <hook-id>')
  .description('Disable a hook')
  .option('--global', 'Disable global hook (default: project)')
  .action(async (hookId: string, options: OrderOptions) => {
    const spinner = ora('Disabling hook...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: options.global ? undefined : process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();
      await interceptor.disableHook(hookId);
      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, hookId }, null, 2));
      } else {
        spinner.succeed(`Hook "${hookId}" disabled`);
      }
    } catch (error) {
      spinner.fail('Failed to disable hook');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Order Hook Command
// ============================================================================
program
  .command('order <hook-id> <position>')
  .description('Change hook execution order')
  .option('--global', 'Change global hook priority (default: project)')
  .action(async (hookId: string, position: string, options: OrderOptions) => {
    const spinner = ora('Updating hook order...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: options.global ? undefined : process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();
      await interceptor.updateHookPriority(hookId, parseInt(position, 10));
      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, hookId, position }, null, 2));
      } else {
        spinner.succeed(`Hook "${hookId}" priority updated to ${position}`);
      }
    } catch (error) {
      spinner.fail('Failed to update hook order');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Logs Command
// ============================================================================
program
  .command('logs')
  .description('View and manage hook logs')
  .option('--tail <number>', 'Show last N lines', '50')
  .option('--follow', 'Follow log output')
  .option('--filter <pattern>', 'Filter logs by pattern')
  .option('--level <level>', 'Filter by log level')
  .option('--hook <hook-id>', 'Filter by hook ID')
  .option('--export <file>', 'Export logs to file')
  .action(async (options: LogsOptions) => {
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      const logger = interceptor.getLogger();
      const logs = await logger.getLogs({
        limit: parseInt(options.tail || '50', 10),
        search: options.filter,
        level: options.level ? [options.level as LogLevel] : undefined,
        hookId: options.hook,
      });

      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, logs }, null, 2));
      } else {
        if (logs.length === 0) {
          console.log(chalk.yellow('No logs found'));
          return;
        }

        console.log(chalk.bold(`\nLast ${logs.length} log entry(ies):\n`));

        logs.forEach((log) => {
          const levelColor = {
            debug: chalk.gray,
            info: chalk.blue,
            warn: chalk.yellow,
            error: chalk.red,
            silent: chalk.gray,
          }[log.level] || chalk.white;

          const timestamp = new Date(log.timestamp).toLocaleString();
          console.log(`${chalk.gray(timestamp)} ${levelColor(log.level.toUpperCase())} ${log.message}`);
          if (log.hookName) {
            console.log(`  ${chalk.gray('Hook:')} ${log.hookName}`);
          }
          if (log.data) {
            console.log(`  ${chalk.gray('Data:')} ${JSON.stringify(log.data, null, 2)}`);
          }
          console.log('');
        });
      }

      // Export if requested
      if (options.export) {
        const exportSpinner = ora(`Exporting logs to ${options.export}...`).start();
        await fs.writeJson(options.export, logs, { spaces: 2 });
        exportSpinner.succeed(`Logs exported to ${options.export}`);
      }
    } catch (error) {
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Config Command
// ============================================================================
program
  .command('config')
  .description('View and manage configuration')
  .option('--show', 'Show current configuration')
  .option('--edit', 'Edit configuration')
  .option('--validate', 'Validate configuration')
  .option('--export <file>', 'Export configuration')
  .option('--import <file>', 'Import configuration')
  .action(async (options: ConfigOptions) => {
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      if (options.show) {
        const config = await interceptor.exportConfig('json');
        if (json) {
          console.log(config);
        } else {
          console.log(chalk.bold('\nCurrent Configuration:\n'));
          console.log(config);
        }
      } else if (options.validate) {
        const validation = await interceptor.validate();
        if (json) {
          console.log(JSON.stringify(validation, null, 2));
        } else {
          if (validation.valid) {
            console.log(chalk.green('✓ Configuration is valid'));
          } else {
            console.log(chalk.red('✗ Configuration has errors:\n'));
            validation.errors.forEach((err: string) => console.log(`  ${chalk.red('•')} ${err}`));
            if (validation.warnings.length > 0) {
              console.log(chalk.yellow('\nWarnings:\n'));
              validation.warnings.forEach((warn: string) => console.log(`  ${chalk.yellow('•')} ${warn}`));
            }
          }
        }
      } else if (options.export) {
        const spinner = ora(`Exporting configuration to ${options.export}...`).start();
        const config = await interceptor.exportConfig('json');
        await fs.writeJson(options.export, JSON.parse(config), { spaces: 2 });
        spinner.succeed(`Configuration exported to ${options.export}`);
      } else if (options.import) {
        const spinner = ora(`Importing configuration from ${options.import}...`).start();
        const data = await fs.readJson(options.import);
        await interceptor.importConfig(JSON.stringify(data), 'json');
        spinner.succeed('Configuration imported successfully');
      } else {
        // Show help
        console.log(chalk.bold('\nAvailable config commands:\n'));
        console.log('  --show       Show current configuration');
        console.log('  --validate   Validate configuration');
        console.log('  --export     Export configuration to file');
        console.log('  --import     Import configuration from file');
      }

      await interceptor.destroy();
    } catch (error) {
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Install Command
// ============================================================================
program
  .command('install')
  .description('Install universal hook into Claude Code settings')
  .option('--global', 'Install globally (default: install for current project)')
  .action(async (options: InstallOptions) => {
    const spinner = ora('Installing universal hook...').start();
    const json = program.opts().json;

    try {
      await installUniversalHook(options.global || false);

      if (json) {
        console.log(JSON.stringify({ success: true }, null, 2));
      } else {
        spinner.succeed('Universal hook installed');
        console.log(chalk.gray('  Restart Claude Code to activate'));
      }
    } catch (error) {
      spinner.fail('Installation failed');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Uninstall Command
// ============================================================================
program
  .command('uninstall')
  .description('Remove HookManager universal hooks from Claude Code settings')
  .option('--global', 'Remove from global settings (default: project)')
  .option('--purge', 'Remove all hooks configuration including .claude/hooks/ folder')
  .action(async (options: UninstallOptions) => {
    const isGlobal = options.global || false;
    const scopeText = isGlobal ? 'global' : 'project';
    const spinner = ora(`Removing ${scopeText} universal hooks...`).start();
    const json = program.opts().json;

    try {
      const settingsPath = isGlobal
        ? path.join(os.homedir(), '.claude', 'settings.json')
        : path.join(process.cwd(), '.claude', 'settings.json');

      // Remove universal hook entries from settings.json
      await removeUniversalHooksFromSettings(settingsPath);

      // If --purge, remove the entire hooks configuration directory
      if (options.purge) {
        const hooksConfigDir = isGlobal
          ? path.join(os.homedir(), '.claude', 'hooks')
          : path.join(process.cwd(), '.claude', 'hooks');

        if (await fs.pathExists(hooksConfigDir)) {
          await fs.remove(hooksConfigDir);
        }
      }

      if (json) {
        console.log(JSON.stringify({ success: true, scope: scopeText, purged: !!options.purge }, null, 2));
      } else {
        spinner.succeed(`${scopeText.charAt(0).toUpperCase() + scopeText.slice(1)} hooks removed`);
        if (options.purge) {
          console.log(chalk.gray('  All hooks configuration has been deleted'));
        } else {
          console.log(chalk.gray('  Hooks configuration folder preserved'));
        }
        console.log(chalk.gray('  Restart Claude Code to apply changes'));
      }
    } catch (error) {
      spinner.fail('Uninstallation failed');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Validate Command
// ============================================================================
program
  .command('validate')
  .description('Validate configuration and hooks')
  .option('--global', 'Validate global configuration (default: project)')
  .action(async (options: ValidateOptions) => {
    const spinner = ora('Validating configuration...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: options.global ? undefined : process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();
      const validation = await interceptor.validate();
      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify(validation, null, 2));
      } else {
        spinner.stop();

        if (validation.valid) {
          console.log(chalk.green('✓ Configuration is valid'));
        } else {
          console.log(chalk.red('✗ Configuration has errors:\n'));
          validation.errors.forEach((err: string) => console.log(`  ${chalk.red('•')} ${err}`));
          if (validation.warnings.length > 0) {
            console.log(chalk.yellow('\nWarnings:\n'));
            validation.warnings.forEach((warn: string) => console.log(`  ${chalk.yellow('•')} ${warn}`));
          }
        }
      }
    } catch (error) {
      spinner.fail('Validation failed');
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Stats Command
// ============================================================================
program
  .command('stats')
  .description('Show execution statistics')
  .option('--hook <hook-id>', 'Show stats for specific hook')
  .action(async (options: StatsOptions) => {
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      let stats;
      if (options.hook) {
        stats = interceptor.getHookStats(options.hook);
      } else {
        stats = interceptor.getStats();
      }

      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, stats }, null, 2));
      } else {
        if (!stats) {
          console.log(chalk.yellow('No statistics available'));
          return;
        }

        console.log(chalk.bold('\nExecution Statistics:\n'));

        if (options.hook) {
          console.log(`Hook: ${stats.hookName} (${stats.hookId})`);
          console.log(`Total Executions: ${stats.executions}`);
          console.log(`Successes: ${chalk.green(stats.successes)}`);
          console.log(`Failures: ${chalk.red(stats.failures)}`);
          console.log(`Blocked: ${chalk.yellow(stats.blocked)}`);
          console.log(`Average Duration: ${stats.averageDuration.toFixed(2)}ms`);
          if (stats.lastExecution) {
            console.log(`Last Execution: ${new Date(stats.lastExecution).toLocaleString()}`);
          }
          if (stats.lastError) {
            console.log(`Last Error: ${chalk.red(stats.lastError)}`);
          }
        } else {
          console.log(`Total Hooks: ${stats.totalHooks}`);
          console.log(`Enabled Hooks: ${stats.enabledHooks}`);
          console.log(`Total Executions: ${stats.totalExecutions}`);
          console.log(`Successful: ${chalk.green(stats.successfulExecutions)}`);
          console.log(`Failed: ${chalk.red(stats.failedExecutions)}`);
          console.log(`Blocked: ${chalk.yellow(stats.blockedExecutions)}`);

          if (stats.byEvent && Object.keys(stats.byEvent).length > 0) {
            console.log(chalk.bold('\nBy Event:\n'));
            Object.entries(stats.byEvent).forEach(([event, count]) => {
              console.log(`  ${event}: ${count}`);
            });
          }
        }
      }
    } catch (error) {
      if (json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// Intercept Command - Universal Hook Entry Point
// ============================================================================
program
  .command('intercept')
  .description('Universal hook interceptor - entry point for all Claude Code events')
  .option('--event <event>', 'Lifecycle event type (required)')
  .option('--tool <tool>', 'Tool name')
  .option('--input <input>', 'Tool input (JSON string)')
  .option('--success <success>', 'Success status (true/false)')
  .option('--prompt <prompt>', 'User prompt')
  .option('--session-id <id>', 'Session ID')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: true,
      });

      // Build event context
      const eventContext: Partial<HookContext> = {
        tool: options.tool,
        sessionId: options.sessionId,
      };

      // Parse input if provided
      if (options.input) {
        try {
          eventContext.input = JSON.parse(options.input);
        } catch {
          eventContext.input = options.input;
        }
      }

      // Add prompt if provided
      if (options.prompt) {
        eventContext.input = options.prompt;
      }

      // Execute hooks
      const result = await interceptor.handleEvent(
        options.event as HookEvent,
        eventContext
      );

      await interceptor.destroy();

      if (program.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.error(JSON.stringify({
        success: false,
        error: (error as Error).message
      }));
      process.exit(1);
    }
  });

// ============================================================================
// Help Command
// ============================================================================
program
  .command('help')
  .description('Show detailed help')
  .action(() => {
    console.log(chalk.bold('\nHookManager - Universal Hook Manager for Claude Code\n'));
    console.log('Usage: hookmanager <command> [options]\n');
    console.log('Commands:');
    console.log('  init [path]           Initialize HookManager');
    console.log('  add <name> <lifecycle> <command>  Add a new hook');
    console.log('  remove <hook-id>      Remove a hook');
    console.log('  list [lifecycle]      List hooks');
    console.log('  enable <hook-id>      Enable a hook');
    console.log('  disable <hook-id>     Disable a hook');
    console.log('  order <hook-id> <pos> Change hook order');
    console.log('  logs                  View and manage logs');
    console.log('  config                Manage configuration');
    console.log('  install               Install universal hook');
    console.log('  uninstall             Remove universal hooks');
    console.log('  validate              Validate configuration');
    console.log('  stats                 Show execution statistics');
    console.log('  intercept             Internal event interceptor');
    console.log('  help                  Show this help\n');
    console.log('Global Options:');
    console.log('  --config <path>       Configuration file path');
    console.log('  --project <path>      Project path');
    console.log('  --log-level <level>   Log level (debug, info, warn, error, silent)');
    console.log('  --json                Output as JSON');
    console.log('  --verbose             Verbose output\n');
    console.log('Examples:');
    console.log('  hookmanager init');
    console.log('  hookmanager add security-audit pre-command "npm audit"');
    console.log('  hookmanager list');
    console.log('  hookmanager logs --tail 20');
    console.log('  hookmanager config --validate');
    console.log('  hookmanager intercept --event PreToolUse --tool Write --input "test"\n');
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function installUniversalHook(isGlobal: boolean = false): Promise<void> {
  const settingsPath = isGlobal
    ? path.join(os.homedir(), '.claude', 'settings.json')
    : path.join(process.cwd(), '.claude', 'settings.json');

  await fs.ensureDir(path.dirname(settingsPath));

  let settings: any = {};
  if (await fs.pathExists(settingsPath)) {
    settings = await fs.readJson(settingsPath);
  }

  // Initialize hooks object if it doesn't exist
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Universal hook entries - inject into specific lifecycle events
  // Based on official documentation: https://code.claude.com/docs/en/hooks
  const universalHooks = [
    {
      event: 'PreToolUse',
      matcher: 'Bash',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PreToolUse --tool "$TOOL_NAME"'
      }]
    },
    {
      event: 'PreToolUse',
      matcher: 'Write|Edit',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PreToolUse --tool "$TOOL_NAME"'
      }]
    },
    {
      event: 'PostToolUse',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PostToolUse --tool "$TOOL_NAME"'
      }]
    },
    {
      event: 'UserPromptSubmit',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event UserPromptSubmit --prompt "$PROMPT"'
      }]
    },
    {
      event: 'SessionStart',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event SessionStart'
      }]
    },
    {
      event: 'PostToolUseFailure',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PostToolUseFailure --tool "$TOOL_NAME"'
      }]
    },
    {
      event: 'SubagentStart',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event SubagentStart'
      }]
    },
    {
      event: 'SubagentStop',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event SubagentStop'
      }]
    },
    {
      event: 'Stop',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event Stop'
      }]
    },
    {
      event: 'PreCompact',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PreCompact'
      }]
    },
    {
      event: 'Setup',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event Setup'
      }]
    },
    {
      event: 'SessionEnd',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event SessionEnd'
      }]
    }
  ];

  for (const hook of universalHooks) {
    if (!settings.hooks[hook.event]) {
      settings.hooks[hook.event] = [];
    }

    // Check if universal hook already exists for this event and matcher
    const existingIndex = settings.hooks[hook.event].findIndex(
      (h: any) => h.matcher === hook.matcher && h.hooks?.[0]?.command?.includes('hook-manager')
    );

    const hookEntry = {
      matcher: hook.matcher,
      hooks: hook.hooks,
    };

    if (existingIndex >= 0) {
      settings.hooks[hook.event][existingIndex] = hookEntry;
    } else {
      settings.hooks[hook.event].push(hookEntry);
    }
  }

  await fs.writeJson(settingsPath, settings, { spaces: 2 });
}

async function removeUniversalHooksFromSettings(settingsPath: string): Promise<void> {
  // Check if settings file exists
  if (!(await fs.pathExists(settingsPath))) {
    return;
  }

  const settings: any = await fs.readJson(settingsPath);

  // If no hooks object, nothing to remove
  if (!settings.hooks) {
    return;
  }

  let removedCount = 0;

  // Remove all hook-manager related entries from each event
  for (const event of Object.keys(settings.hooks)) {
    const eventHooks: any[] = settings.hooks[event];

    if (!Array.isArray(eventHooks)) {
      continue;
    }

    // Filter out hooks that contain hook-manager references
    const filteredHooks = eventHooks.filter((hookEntry: any) => {
      // Check if this entry contains hook-manager command
      if (hookEntry.hooks && Array.isArray(hookEntry.hooks)) {
        for (const hook of hookEntry.hooks) {
          if (hook.type === 'command' && typeof hook.command === 'string') {
            // Check for various hook-manager reference patterns
            if (
              hook.command.includes('hook-manager') ||
              hook.command.includes('@smilecat2026/hook-manager')
            ) {
              removedCount++;
              return false; // Remove this entry
            }
          }
        }
      }
      return true; // Keep this entry
    });

    settings.hooks[event] = filteredHooks;
  }

  // Remove empty hooks objects entirely
  for (const event of Object.keys(settings.hooks)) {
    if (settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }
  }

  // Remove hooks object if empty
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // Write updated settings
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
}

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.help();
}
