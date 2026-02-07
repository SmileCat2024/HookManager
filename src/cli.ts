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
import { validateMatcherForEvent, getMatcherValidationMessage, eventSupportsMatcher, getMatcherConfig } from './utils/event-validator';

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
  .description('Claude Code 通用钩子管理器')
  .version('1.0.0')
  .addHelpText('after', `
处理器类型:
  command               执行 Shell 命令
  prompt                使用 Claude AI 进行智能决策

过滤机制 (执行顺序: Matcher → Filter):
  --matcher <pattern>    粗粒度过滤 - 按事件特定字段 (正则表达式)
  --filter-tools <tools> 细粒度过滤 - 按工具名称
  --filter-commands <cmd> 细粒度过滤 - 按命令内容
  --filter-patterns <p>  细粒度过滤 - 按参数模式

示例:
  $ hookmanager init
  $ hookmanager add security-audit PreToolUse "npm audit" --matcher "Bash|Write"
  $ hookmanager add ai-filter UserPromptSubmit "检查安全性" --type prompt
  $ hookmanager add mcp-guard PreToolUse "验证" --matcher "mcp__.*"
  $ hookmanager list
  $ hookmanager disable security-audit
  $ hookmanager logs --tail 20
  $ hookmanager config --validate

更多信息请访问: https://github.com/SmileCat2024/HookManager
`)
  .option('--config <path>', '配置文件路径')
  .option('--project <path>', '项目路径')
  .option('--log-level <level>', '日志级别 (debug, info, warn, error, silent)', 'info')
  .option('--json', '以 JSON 格式输出')
  .option('--verbose', '详细输出');

interface InitOptions {
  preset?: string;
  global?: boolean;
  interactive?: boolean;
}

interface AddHookOptions {
  type?: string;
  description?: string;
  priority?: string;
  matcher?: string;
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
  .description('初始化项目的 HookManager 配置')
  .option('--preset <preset>', '预设配置 (minimal, full, security)')
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

      // Ensure project config exists if initializing project
      if (!options.global) {
        const configManager = interceptor.getConfigManager();
        if (!configManager.getProjectConfig()) {
          const projectConfigPath = path.join(projectPath, '.claude', 'hooks', 'hookmanager', 'config.json');
          await fs.ensureDir(path.dirname(projectConfigPath));
          await fs.writeJson(projectConfigPath, {
            version: '1.0.0',
            hooks: [],
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          }, { spaces: 2 });
          await configManager.load();
        }
      }

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
          console.log(chalk.gray(`  Global config: ~/.claude/hooks/hookmanager/config.json`));
          console.log(chalk.gray(`  Global settings: ~/.claude/settings.json`));
        } else {
          console.log(chalk.gray(`  Project config: ${path.join(projectPath, '.claude', 'hooks', 'hookmanager', 'config.json')}`));
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
  .description('添加新钩子')
  .argument('<command>', '要执行的命令、脚本或提示词')
  .option('--type <type>', '处理器类型 (command, prompt)', 'command')
  .option('--description <text>', '钩子描述')
  .option('--priority <number>', '执行优先级 (0-1000)', '50')
  .option('--matcher <pattern>', 'Matcher 模式 (事件特定字段的正则表达式)')
  .option('--filter-tools <tools>', '按工具过滤 (逗号分隔)')
  .option('--filter-commands <commands>', '按命令内容过滤 (逗号分隔)')
  .option('--filter-patterns <patterns>', '按参数模式过滤 (逗号分隔)')
  .option('--timeout <ms>', '超时时间 (毫秒)', '30000')
  .option('--retry <number>', '重试次数', '0')
  .option('--continue-on-error', '错误时继续执行')
  .option('--exit-code-blocking <codes>', '阻塞性退出码 (逗号分隔)', '2')
  .option('--global', '添加到全局配置 (默认为项目级)')
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

      const hookEvent = lifecycle as HookEvent;

      // Validate matcher if provided
      if (options.matcher) {
        const validationResult = validateMatcherForEvent(hookEvent, options.matcher);
        if (!validationResult.valid) {
          let errorMsg = validationResult.error || '';
          if (validationResult.suggestions && validationResult.suggestions.length > 0) {
            errorMsg += `\n\n${chalk.yellow('Valid matchers for ' + hookEvent + ':')}\n  ${chalk.gray(validationResult.suggestions.slice(0, 10).join('\n  '))}`;
          }
          const config = getMatcherConfig(hookEvent);
          if (config.examples.length > 0) {
            errorMsg += `\n\n${chalk.yellow('Examples:')}\n  ${chalk.gray(config.examples.slice(0, 3).join('\n  '))}`;
          }
          throw new Error(errorMsg);
        }
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

      // Validate handler type
      const validTypes = ['command', 'prompt'];
      const handlerType = options.type || 'command';
      if (!validTypes.includes(handlerType)) {
        throw new Error(`Invalid handler type: ${handlerType}. Valid types: ${validTypes.join(', ')}`);
      }

      // Build handler based on type
      let handler: any;
      if (handlerType === 'prompt') {
        // Prompt handler - the command argument is the prompt template
        handler = {
          type: 'prompt' as const,
          prompt: command,
          timeout: parseInt(options.timeout, 10),
        };
      } else {
        // Command/script/module handler
        handler = {
          type: handlerType as 'command' | 'script' | 'module',
          ...(handlerType === 'command' || handlerType === 'script' ? { command } : { module: command }),
          timeout: parseInt(options.timeout, 10),
          retry: parseInt(options.retry, 10),
        };
      }

      // Generate unique ID based on creation time (not the name)
      const uniqueId = generateHookId();

      const hookConfig: Partial<HookConfig> = {
        id: uniqueId,
        name,
        description: options.description || '',
        enabled: true,
        events: [hookEvent],
        handler,
        matcher: options.matcher || undefined,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        priority: parseInt(options.priority, 10),
        continueOnError: options.continueOnError,
        exitCodeBlocking,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await interceptor.registerHook(hookConfig, options.global || false);
      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, hook: hookConfig }, null, 2));
      } else {
        spinner.succeed(`Hook "${name}" added successfully`);
        console.log(chalk.gray(`  Type: ${handlerType}`));
        console.log(chalk.gray(`  Lifecycle: ${lifecycle}`));
        if (options.matcher) {
          console.log(chalk.gray(`  Matcher: ${options.matcher}`));
        }
        if (handlerType === 'prompt') {
          console.log(chalk.gray(`  Prompt: ${command.substring(0, 80)}${command.length > 80 ? '...' : ''}`));
        } else {
          console.log(chalk.gray(`  Command: ${command}`));
        }
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
  .command('remove <hook-id-or-name>')
  .description('移除钩子 (支持 ID 或名称，影响所有作用域)')
  .action(async (hookIdOrName: string, options: OrderOptions) => {
    const spinner = ora('Removing hook...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      // Find and remove hooks matching by ID or name (both global and project)
      const removedHooks = await interceptor.unregisterHookByIdOrName(hookIdOrName);

      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, removedHooks }, null, 2));
      } else {
        spinner.succeed(`Removed ${removedHooks.length} hook(s): ${removedHooks.map(h => h.name).join(', ')}`);
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
  .description('列出钩子 (可选按生命周期过滤，默认显示项目级钩子)')
  .option('--enabled', '仅显示已启用的钩子')
  .option('--disabled', '仅显示已禁用的钩子')
  .option('--global', '仅显示全局钩子')
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

      // Check if project is initialized when listing project hooks
      if (!options.global) {
        const configManager = interceptor.getConfigManager();
        const projectConfig = configManager.getProjectConfig();
        
        if (!projectConfig) {
           spinner.stop();
           console.log(chalk.yellow('Project not initialized.'));
           console.log(chalk.gray('Run "hookmanager init" to initialize configuration.'));
           return;
        }
      }

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
          const scope = hook.metadata?._scope || 'unknown';

          console.log(`${status} ${chalk.bold(hook.name)}`);
          console.log(`  ${chalk.cyan('ID:')} ${chalk.yellow(hook.id)}`);
          console.log(`  ${chalk.gray('Scope:')} ${scope === 'global' ? chalk.blue('global') : chalk.green('project')}`);
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
  .command('enable <hook-id-or-name>')
  .description('启用钩子 (支持 ID 或名称，影响所有作用域)')
  .action(async (hookIdOrName: string, options: OrderOptions) => {
    const spinner = ora('Enabling hook...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      // Find hooks matching by ID or name (both global and project)
      const enabledHooks = await interceptor.enableHookByIdOrName(hookIdOrName);

      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, enabledHooks }, null, 2));
      } else {
        spinner.succeed(`Enabled ${enabledHooks.length} hook(s): ${enabledHooks.map(h => h.name).join(', ')}`);
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
  .command('disable <hook-id-or-name>')
  .description('禁用钩子 (支持 ID 或名称，影响所有作用域)')
  .action(async (hookIdOrName: string, options: OrderOptions) => {
    const spinner = ora('Disabling hook...').start();
    const json = program.opts().json;

    try {
      const interceptor = HookInterceptor.create({
        configPath: program.opts().config,
        projectPath: process.cwd(),
        logLevel: program.opts().logLevel as LogLevel,
        autoInitialize: false,
      });

      await interceptor.initialize();

      // Find hooks matching by ID or name (both global and project)
      const disabledHooks = await interceptor.disableHookByIdOrName(hookIdOrName);

      await interceptor.destroy();

      if (json) {
        console.log(JSON.stringify({ success: true, disabledHooks }, null, 2));
      } else {
        spinner.succeed(`Disabled ${disabledHooks.length} hook(s): ${disabledHooks.map(h => h.name).join(', ')}`);
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
  .description('更改钩子执行顺序')
  .option('--global', '更改全局钩子优先级 (默认为项目级)')
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
  .description('查看和管理钩子日志')
  .option('--tail <number>', '显示最后 N 行', '50')
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
  .description('查看和管理配置')
  .option('--show', '显示当前配置')
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
  .description('将通用钩子安装到 Claude Code 设置')
  .option('--global', '全局安装 (默认为当前项目安装)')
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
  .description('从 Claude Code 设置中移除 HookManager 通用钩子')
  .option('--global', '从全局设置中移除 (默认为项目级)')
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
  .description('验证配置和钩子')
  .option('--global', '验证全局配置 (默认为项目级)')
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
  .description('显示执行统计信息')
  .option('--hook <hook-id>', '显示特定钩子的统计信息')
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
  .description('通用钩子拦截器 - 所有 Claude Code 事件的入口点')
  .option('--event <event>', '生命周期事件类型 (必需)')
  .option('--tool <tool>', 'Tool name')
  .option('--command <command>', 'Command string (for Bash/Run tools)')
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
        command: options.command, // Add command support
        sessionId: options.sessionId,
      };

      // Read stdin for JSON input
      // All events from Claude Code pass data via stdin JSON
      let stdinData = '';
      if (process.stdin.isTTY) {
        // No stdin data, use command line arguments
      } else {
        // Read from stdin
        for await (const chunk of process.stdin) {
          stdinData += chunk.toString();
        }
        // Try to parse stdin as JSON
        if (stdinData.trim()) {
          try {
            const stdinJson = JSON.parse(stdinData);

            // Map all stdin JSON fields to eventContext
            // UserPromptSubmit specific
            if (stdinJson.prompt !== undefined) {
              eventContext.input = stdinJson.prompt;
            }

            // Common fields (all events)
            if (stdinJson.session_id) eventContext.sessionId = stdinJson.session_id;
            if (stdinJson.cwd) eventContext.projectDir = stdinJson.cwd;

            // Tool events (PreToolUse, PostToolUse, PostToolUseFailure)
            if (stdinJson.tool) eventContext.tool = stdinJson.tool;
            if (stdinJson.command) eventContext.command = stdinJson.command;
            if (stdinJson.input !== undefined) eventContext.input = stdinJson.input;
            if (stdinJson.output !== undefined) eventContext.output = stdinJson.output;
            if (stdinJson.success !== undefined) {
              eventContext.metadata = eventContext.metadata || {};
              eventContext.metadata.success = stdinJson.success;
            }

            // Event metadata
            if (stdinJson.metadata) eventContext.metadata = { ...eventContext.metadata, ...stdinJson.metadata };
            if (stdinJson.error) {
              eventContext.metadata = eventContext.metadata || {};
              eventContext.metadata.error = stdinJson.error;
            }

            // Permission info
            if (stdinJson.permission_mode) {
              eventContext.metadata = eventContext.metadata || {};
              eventContext.metadata.permissionMode = stdinJson.permission_mode;
            }
            if (stdinJson.permission) {
              eventContext.metadata = eventContext.metadata || {};
              eventContext.metadata.permission = stdinJson.permission;
            }

            // Agent info
            if (stdinJson.agent_type) {
              eventContext.metadata = eventContext.metadata || {};
              eventContext.metadata.agent_type = stdinJson.agent_type;
            }
            if (stdinJson.agentId) {
              eventContext.metadata = eventContext.metadata || {};
              eventContext.metadata.agentId = stdinJson.agentId;
            }

            // Task info
            if (stdinJson.taskId) {
              eventContext.metadata = eventContext.metadata || {};
              eventContext.metadata.taskId = stdinJson.taskId;
            }

            // Event name
            if (stdinJson.hook_event_name) {
              eventContext.metadata = eventContext.metadata || {};
              eventContext.metadata.hook_event_name = stdinJson.hook_event_name;
            }

          } catch (parseError) {
            // Not valid JSON, use as raw input
            eventContext.input = stdinData;
          }
        }
      }

      // Parse input if provided via --input option
      if (options.input && !eventContext.input) {
        try {
          eventContext.input = JSON.parse(options.input);
        } catch {
          eventContext.input = options.input;
        }
      }

      // Add prompt if provided via --prompt option
      if (options.prompt && !eventContext.input) {
        eventContext.input = options.prompt;
      }

      // Execute hooks
      const result = await interceptor.handleEvent(
        options.event as HookEvent,
        eventContext
      );

      await interceptor.destroy();

      // Output result (always output for debugging)
      if (program.opts().json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Check if any hook blocked execution
        if (result.summary.blocked > 0) {
          console.error(JSON.stringify({
            success: false,
            blocked: true,
            message: 'Operation blocked by hook',
            result
          }));
          // Exit with code 2 to signal blocking
          process.exit(2);
        } else {
          if (result.summary.total > 0) {
            console.log(JSON.stringify({
              success: true,
              message: 'Hooks executed successfully',
              result
            }, null, 2));
          }
        }
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
  .description('显示帮助信息')
  .action(() => {
    program.help();
  });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique hook ID based on creation time
 * Format: hook-<timestamp>-<random>
 */
function generateHookId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `hook-${timestamp}-${random}`;
}

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
  // Based on official Claude Code documentation
  // Data is passed via stdin JSON, not command line arguments
  const universalHooks = [
    {
      event: 'PreToolUse',
      matcher: 'Bash',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PreToolUse'
      }]
    },
    {
      event: 'PreToolUse',
      matcher: 'Write|Edit',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PreToolUse'
      }]
    },
    {
      event: 'PostToolUse',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PostToolUse'
      }]
    },
    {
      event: 'UserPromptSubmit',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event UserPromptSubmit'
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
        command: 'hookmanager intercept --event PostToolUseFailure'
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
      event: 'Notification',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event Notification'
      }]
    },
    {
      event: 'TeammateIdle',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event TeammateIdle'
      }]
    },
    {
      event: 'TaskCompleted',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event TaskCompleted'
      }]
    },
    {
      event: 'PermissionRequest',
      matcher: '*',
      hooks: [{
        type: 'command',
        command: 'hookmanager intercept --event PermissionRequest'
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
