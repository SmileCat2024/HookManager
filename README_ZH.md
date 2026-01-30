# HookManager

> Claude Code 的通用钩子管理器 - 通过 CLI 管理所有生命周期钩子

HookManager 提供统一的接口，通过单一"通用钩子"管理 Claude Code 钩子，该钩子拦截所有生命周期事件并委托给存储在 JSON 文件中的用户配置钩子。

## 快速开始 / Quick Start

### 1. 安装 / Install

```bash
npm install -g @smilecat2026/hook-manager
```

### 2. 初始化 / Initialize

```bash
# 初始化项目配置（默认）
hookmanager init

# 初始化全局配置
hookmanager init --global
```

### 3. 添加钩子 / Add a Hook

```bash
# 添加到项目配置（默认）
hookmanager add security-audit pre-command "npm audit" \
  --description "在包安装前运行 npm audit" \
  --filter-commands "npm install,npm ci" \
  --priority 100

# 添加到全局配置
hookmanager add security-audit pre-command "npm audit" \
  --description "在包安装前运行 npm audit" \
  --filter-commands "npm install,npm ci" \
  --priority 100 \
  --global
```

### 4. 列出钩子 / List Hooks

```bash
# 列出项目钩子（默认）
hookmanager list

# 列出全局钩子
hookmanager list --global
```

### 5. 查看日志 / View Logs

```bash
hookmanager logs --tail 20
```

### 6. 卸载 / Uninstall

```bash
# 从项目设置移除通用钩子（默认）
hookmanager uninstall

# 从全局设置移除通用钩子
hookmanager uninstall --global

# 移除所有内容，包括钩子配置文件夹
hookmanager uninstall --purge
```

## 核心功能 / Core Features

- **通用钩子**: 单一钩子拦截所有 Claude Code 生命周期事件
- **JSON 配置**: 在 JSON 文件中存储钩子（全局和项目级别）
- **钩子组合**: 每个生命周期多个钩子，按优先级排序
- **全面日志记录**: 内置日志管理，支持轮转和导出
- **安全性**: 命令验证、路径遍历保护、沙盒模式
- **性能**: 支持并行执行、超时处理、重试逻辑

## CLI 命令 / CLI Commands

| 命令 / Command | 描述 / Description        |
| -------------- | ------------------------- |
| `init`         | 初始化 HookManager        |
| `add`          | 添加新钩子                |
| `remove`       | 移除钩子                  |
| `list`         | 列出钩子                  |
| `enable`       | 启用钩子                  |
| `disable`      | 禁用钩子                  |
| `order`        | 更改钩子顺序              |
| `logs`         | 查看和管理日志            |
| `config`       | 管理配置                  |
| `install`      | 安装通用钩子              |
| `uninstall`    | 移除 HookManager 通用钩子 |
| `validate`     | 验证配置                  |
| `stats`        | 显示执行统计              |
| `help`         | 显示详细帮助              |

## 配置 / Configuration

### 全局配置 / Global Configuration

位置：`~/.claude/hooks/config.json`

- 使用 `--global` 标志访问全局配置

### 项目配置 / Project Configuration

位置：`.claude/hooks/config.json`

- 默认操作针对项目配置

## 钩子类型 / Hook Types

### 命令处理器 / Command Handler

执行 shell 命令：

```json
{
  "type": "command",
  "command": "npm audit",
  "timeout": 30000
}
```

### 脚本处理器 / Script Handler

执行脚本文件：

```json
{
  "type": "script",
  "path": "./scripts/backup.sh",
  "timeout": 60000
}
```

### 模块处理器 / Module Handler

执行 Node.js 模块：

```json
{
  "type": "module",
  "module": "./custom-handler.js",
  "function": "myHandler"
}
```

### 编程式处理器 / Programmatic Handler

执行 JavaScript 函数：

```json
{
  "type": "programmatic",
  "handler": "(context) => { return { success: true, exitCode: 0 }; }"
}
```

## 生命周期事件 / Lifecycle Events

- SessionStart, SessionEnd, SessionResume
- UserPromptSubmit, UserPromptEdit
- PreToolUse, PostToolUse, PostToolUseFailure
- SubagentStart, SubagentStop, SubagentSpawn
- ResponseStart, ResponseEnd, ResponseChunk
- ContextCompact, ContextExpand, ContextTruncate
- PermissionRequest, PermissionGranted, PermissionDenied
- Notification, Alert, Warning
- Error, Exception
- Custom

## 示例 / Examples

### 安全钩子 / Security Hooks

```bash
# 包安装前运行 npm audit
hookmanager add security-audit pre-command "npm audit" \
  --filter-commands "npm install,npm ci" \
  --priority 100

# 阻止危险命令
hookmanager add block-dangerous pre-tool "node ./scripts/block.js" \
  --filter-tools "bash,run" \
  --priority 1
```

### 开发钩子 / Development Hooks

```bash
# 提交前进行代码检查
hookmanager add lint pre-command "npm run lint" \
  --filter-commands "git commit" \
  --priority 50

# 提交前运行测试
hookmanager add test pre-command "npm test" \
  --filter-commands "git commit" \
  --priority 60
```

## 卸载命令 / Uninstall Command

从系统中移除 HookManager 通用钩子：

```bash
# 从项目设置移除通用钩子（默认）
hookmanager uninstall

# 从全局设置移除通用钩子
hookmanager uninstall --global

# 移除所有内容，包括钩子配置文件夹
hookmanager uninstall --purge
```

## 测试 / Testing

```bash
# 运行基本测试
npm test

# 在监视模式下运行测试
npm run test:watch
```

## 开发 / Development

```bash
# 安装依赖
npm install

# 构建 TypeScript
npm run build

# 运行代码检查
npm run lint

# 修复代码检查问题
npm run lint:fix

# 格式化代码
npm run format
```

## 许可证 / License

MIT 许可证 - 详情请参见 [LICENSE](LICENSE)

## 支持 / Support

- 文档：https://github.com/your-org/hook-manager
- 问题：https://github.com/your-org/hook-manager/issues
- Claude Code 钩子：https://code.claude.com/docs/en/hooks