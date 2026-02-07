# Lifecycle Events

These events can be intercepted by HookManager. Based on official Claude Code documentation.

## Complete Event List (15 events)

### Session Events (2)
- `SessionStart`: When a session begins or resumes
  - **Matcher Support**: ✅ Yes - matches `source`: `startup`, `resume`, `clear`, `compact`
- `SessionEnd`: When a session terminates
  - **Matcher Support**: ✅ Yes - matches `reason`: `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other`

### User Interaction (1)
- `UserPromptSubmit`: When you submit a prompt, before Claude processes it
  - **[决策事件 - 支持 Prompt Handler]** - Flow Control

### Tool Events (3)
- `PreToolUse`: Before a tool call executes. Can block it
  - **Matcher Support**: ✅ Yes - matches tool name
  - **[决策事件 - 支持 Prompt Handler]** - Permission Decision
- `PostToolUse`: After a tool call succeeds
  - **Matcher Support**: ✅ Yes - matches tool name
  - **[决策事件 - 支持 Prompt Handler]** - Flow Control
- `PostToolUseFailure`: After a tool call fails
  - **Matcher Support**: ✅ Yes - matches tool name
  - **[决策事件 - 支持 Prompt Handler]** - Flow Control

### Permission Events (1)
- `PermissionRequest`: When a permission dialog appears
  - **[决策事件 - 支持 Prompt Handler]** - Permission Decision

### Agent Events (2)
- `SubagentStart`: When a subagent is spawned
  - **Matcher Support**: ✅ Yes - matches `agent_type`: `Bash`, `Explore`, `Plan`, `Code`, etc.
- `SubagentStop`: When a subagent finishes
  - **Matcher Support**: ✅ Yes - matches `agent_type`: `Bash`, `Explore`, `Plan`, `Code`, etc.
  - **[决策事件 - 支持 Prompt Handler]** - Flow Control

### Context Events (1)
- `PreCompact`: Before context compaction
  - **Matcher Support**: ✅ Yes - matches `trigger`: `manual`, `auto`

### Response Events (1)
- `Stop`: When Claude finishes responding

### Notification Events (1)
- `Notification`: When Claude Code sends a notification
  - **Matcher Support**: ✅ Yes - matches `type`: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`

### Team Events (1)
- `TeammateIdle`: When an agent team teammate is about to go idle

### Task Events (1)
- `TaskCompleted`: When a task is being marked as completed

---

## Matcher Support Summary

| Event | Matcher Target | Valid Values |
|-------|----------------|--------------|
| `SessionStart` | `metadata.source` | `startup`, `resume`, `clear`, `compact` |
| `SessionEnd` | `metadata.reason` | `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| `SubagentStart/SubagentStop` | `metadata.agent_type` | `Bash`, `Explore`, `Plan`, `Code`, or custom names |
| `Notification` | `metadata.type` | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| `PreCompact` | `metadata.trigger` | `manual`, `auto` |
| Tool events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) | `context.tool` | Any tool name (`Bash`, `Write`, `Edit`, etc.) |

**Events without matcher support**: `UserPromptSubmit`, `PermissionRequest`, `Stop`, `TeammateIdle`, `TaskCompleted`

---

## Prompt Handler 支持的事件

只有标注 **[决策事件]** 的事件才支持 `type: "prompt"` 的 Handler。这些事件需要二元决策（allow/deny 或 continue/block）。

| 事件 | 决策类型 | ok: true 结果 | ok: false 结果 |
|------|----------|---------------|----------------|
| `PreToolUse` | 权限决策 | `permissionDecision: "allow"` | `permissionDecision: "deny"` |
| `PostToolUse` | 流程控制 | `decision: "continue"` | `decision: "block"` |
| `PostToolUseFailure` | 流程控制 | `decision: "continue"` | `decision: "block"` |
| `UserPromptSubmit` | 流程控制 | `decision: "continue"` | `decision: "block"` |
| `SubagentStop` | 流程控制 | `decision: "continue"` | `decision: "block"` |
| `PermissionRequest` | 权限决策 | `permissionDecision: "allow"` | `permissionDecision: "deny"` |

