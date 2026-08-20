# Qingmei (青袂) - Minimalist Modern TypeScript Agent CLI

<p align="center">
  <b>English</b> | <a href="README.zh-CN.md">简体中文</a>
</p>

---

**Qingmei (青袂)** is a modern, modular, high-density autonomous AI Agent Command Line Interface (CLI) built with TypeScript and Node.js. It features deep integration with the **Model Context Protocol (MCP)** specification, a comprehensive **Skill Extension Engine**, a **4-tier Security Spectrum**, and an icon-free, minimalist boxed terminal interface.


---

## 🌟 Key Features

- **Autonomous ReAct Reasoning Loop**: Multi-step tool use, thought/reasoning stream rendering, loop detection, and self-healing.
- **Integrated Boxed TUI**:
  - Full-screen layout filling terminal width and height with comfortable outer padding; title at the top, input dock and status bar anchored at the bottom.
  - Live operation history records rendered in the middle viewport between the title and input dock, with smooth mouse wheel and keyboard scrolling without scrollbars.
  - Status bar displays real-time context token usage (e.g. `1.8k/1M (0.2%)`), with current workspace path presented on its own line below using clean `~` relative formatting.




- **Workspace Trust & Path Sandboxing**:
  - Automatically prompts for trust when opening unfamiliar repositories. Untrusted workspaces are locked to restricted read-only mode to prevent prompt injection and supply-chain attacks.
  - Built-in path sandboxing strictly intercepts directory traversals and mutating operations targeting files outside the workspace root.
- **4-Tier Security Modes**:
  - **`[interactive]`**: Read tools execute automatically; write/shell tools require user confirmation.
  - **`[auto]`**: Fully autonomous execution with zero confirmation prompts.
  - **`[readonly]`**: Strictly read-only analysis; file modifications and command execution are physically blocked.
  - **`[chat]`**: **Pure conversation mode**; disables and removes all tool schemas for zero token overhead, ultra-fast responses, and no tool hallucination.
- **1M Context Awareness**:
  - Automatically identifies 1M+ context models (DeepSeek-V4 series, Gemini 3.7 / 3.5 series) and dynamically scales token budgeting and prompt strategies.
  - Displays explicit `[1M]` / `[200k]` badges in the prompt bar and model selection menus.
- **Curated Model Presets**:
  - **DeepSeek**: Pre-configured with `deepseek-v4-flash` (1M context, tools + reasoning) and `deepseek-v4-pro` (1M context, tools).
  - **Google Gemini**: Pre-configured with `gemini-3.7-flash` (1M context, tools + reasoning), `gemini-3.5-flash-lite` (1M context), and `gemini-3.1-pro-preview` (1M context).
- **Model Context Protocol (MCP)**: Native support for MCP Tools, Resources, and Prompts over `stdio` process sandboxes and remote `sse` transports, with automatic namespace isolation (`mcp__<server>__<tool>`).
- **Skill Extension Engine**: Standard `SKILL.md` parser and global skill registry in `~/.qingmei/skills/` with hot-pluggable injection.
- **Layered Instruction Rules**:
  - Global user constraints: `~/.qingmei/QINGMEI.md` (applies across all projects)
  - Project workspace constraints: `./AGENTS.md` (applies to the current repo)
  - Active skill protocols: `SKILL.md` (injected on-demand when enabled)
- **Zero Workspace Pollution**: 100% global configuration and session storage isolated in `~/.qingmei/`. Your project repositories stay completely clean.

---

## 🚀 Quick Start

### 1. Installation & Quick Launch
 
#### Option A: Instant Run with npx (Recommended)
```bash
npx @qingmeixyz/cli
```

#### Option B: Global Install
```bash
# Global install via npm
npm install -g @qingmeixyz/cli

# Launch directly
qingmei
```

#### Option C: Build from Source
```bash
# Clone repository and install dependencies
npm install

# Build ESM bundle
npm run build

# Link globally
npm link
```


> **First-Time Setup**: If unconfigured, Qingmei automatically triggers the interactive setup wizard to guide you through selecting a provider (DeepSeek / Gemini), entering an API key, testing connectivity, and choosing a pre-configured model.

---

## ⌨️ REPL Slash Commands

Within the `qingmei` interactive prompt, type `/` to view suggestions with `Tab` completion:

| Command | Description |
| :--- | :--- |
| `/mode [mode]` | Switch running mode (`interactive`, `auto`, `readonly`, `chat`) |
| `/model [name]` | Switch AI model and provider (with preset choices and dynamic API key input) |
| `/effort [level]` | Adjust reasoning / thinking effort (`off`, `low`, `medium`, `high`) |
| `/skills` | View installed skills and toggle them on/off |
| `/mcp` | Check connected MCP servers health and registered tool count |
| `/trust [path]` | Trust current or specified workspace (enables mutating tools) |
| `/untrust [path]` | Untrust workspace and switch to restricted read-only mode |
| `/compact` | Compact and optimize context memory (folds long tool logs & synthesizes summary) |
| `/clear` | Clear terminal screen and reset conversation context memory |

| `/session [subcmd]` | Session lifecycle management: `-l` (list), `-s` (save), `-r` (resume), `-d` (delete), `-e` (export) |
| `/config` | View active configuration (or `/config edit` to open in default editor) |

| `/help` | Display command reference |
| `/exit` / `/quit` | Exit REPL and disconnect all background MCP processes |



---

## 🛡️ 4-Tier Security Modes

Switch modes on the fly via `/mode <name>` or configure via `QINGMEI_SECURITY_MODE`:

```text
┌──────────────┬──────────────────┬──────────────────┬──────────────────┐
│ Mode         │ Read Tools       │ Write / Shell    │ Tool Schemas     │
├──────────────┼──────────────────┼──────────────────┼──────────────────┤
│ interactive  │ Auto-execute     │ User Prompt      │ Enabled          │
│ auto         │ Auto-execute     │ Auto-execute     │ Enabled          │
│ readonly     │ Auto-execute     │ Blocked          │ Enabled          │
│ chat         │ Disabled         │ Disabled         │ None (Omitted)   │
└──────────────┴──────────────────┴──────────────────┴──────────────────┘
```

- **`[chat]` Mode Advantage**: Completely strips tool definitions from the system prompt, eliminating token overhead, preventing accidental tool invocations, and maximizing streaming speed.

---

## 📜 Prompt & Constraint Hierarchy

Qingmei automatically layers instruction files into the Agent's system prompt on every turn:

```text
┌──────────────────────────────────────────────────────────┐
│ 1. Core Agent System Prompt (Identity, ReAct, Security)  │
├──────────────────────────────────────────────────────────┤
│ 2. Global Constraints (~/.qingmei/QINGMEI.md)            │
├──────────────────────────────────────────────────────────┤
│ 3. Project Constraints (./AGENTS.md)                     │
├──────────────────────────────────────────────────────────┤
│ 4. Active Skill Protocols (Active SKILL.md)              │
└──────────────────────────────────────────────────────────┘
```

1. **Global User Directives (`~/.qingmei/QINGMEI.md`)**:
   - Applies across all repositories on your system.
   - Ideal for personal coding preferences, communication style, and universal standards.
2. **Project Directives (`./AGENTS.md`)**:
   - Placed in the root directory of your workspace/repository.
   - Ideal for project architecture rules, test commands (`npm test`), forbidden libraries, and team SOPs.
3. **Skill Extensions (`SKILL.md`)**:
   - Injected dynamically when specific domain skills are toggled on via `/skills`.

---

## ⚙️ Configuration & Manual Editing (`~/.qingmei/config.json`)

Edit your configuration anytime via `qingmei config edit` or `/config edit` inside the REPL:

```json
{
  "activeProvider": "deepseek",
  "activeModel": "deepseek-v4-flash",
  "securityMode": "interactive",
  "providers": {
    "deepseek": {
      "apiKey": "sk-...",
      "baseUrl": "https://api.deepseek.com/v1",
      "defaultModel": "deepseek-v4-flash",
      "models": [
        {
          "id": "deepseek-v4-flash",
          "name": "deepseek-v4-flash",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": true
        },
        {
          "id": "deepseek-v4-pro",
          "name": "deepseek-v4-pro",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": false
        }
      ]
    },
    "gemini": {
      "apiKey": "AIza...",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
      "defaultModel": "gemini-3.7-flash",
      "models": [
        {
          "id": "gemini-3.7-flash",
          "name": "gemini-3.7-flash",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": true
        },
        {
          "id": "gemini-3.5-flash-lite",
          "name": "gemini-3.5-flash-lite",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": false
        },
        {
          "id": "gemini-3.1-pro-preview",
          "name": "gemini-3.1-pro-preview",
          "context": "1M",
          "contextWindow": 1000000,
          "is1MContext": true,
          "supportsTools": true,
          "supportsReasoning": false
        }
      ]
    }
  }
}
```

### Authentication Precedence
1. **Vendor-Specific Environment Variables** (`DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, etc.)
2. **Global User Configuration** (`~/.qingmei/config.json`)
3. **Interactive Setup Wizard** (automatically triggered if unconfigured)

---

## 🔌 MCP (Model Context Protocol) Management

### CLI Commands
```bash
# List all configured MCP servers and health status
qingmei mcp list

# Add a local stdio process sandbox MCP server (e.g. filesystem)
qingmei mcp add filesystem --command "npx -y @modelcontextprotocol/server-filesystem ./ "

# Add a remote SSE protocol MCP server
qingmei mcp add remote-service --url "https://mcp.company.com/sse"

# Test connection and list exposed tools
qingmei mcp test filesystem

# Remove an MCP server
qingmei mcp remove filesystem
```

Configured in `~/.qingmei/mcp.json`. Servers are connected asynchronously in the background on startup, with tool names isolated as `mcp__<server>__<tool>`.

---

## 🧠 Skill Extension System

Skills encapsulate domain-specific troubleshooting SOPs, system prompt protocols, and tool requirements in standard `SKILL.md` format.

### Creating a New Skill
```bash
qingmei skill new code-auditor
```

This creates `~/.qingmei/skills/code-auditor/SKILL.md`:
```markdown
---
name: code-auditor
description: Security vulnerability and OWASP audit SOP
version: 1.0.0
author: user
tags: [security, audit]
required_tools: [read_file, run_command]
---

# Security Audit Protocol
1. Scan dependencies and lockfiles for known CVE vulnerabilities.
2. Inspect route handlers for authentication and authorization gates.
3. Verify all database queries use parameterized binding to prevent SQL injection.
```

Toggle skills on/off anytime using `/skills` in the REPL.

---

## 🛠️ Development & Testing

```bash
# Run unit and integration tests
npm test

# Run TypeScript type check
npm run typecheck

# Build ESM bundle
npm run build

# Run in development mode
npm run dev
```

---

## 🤝 Contributing Policy

Qingmei is maintained as a personal open-source project. We do not accept external Pull Requests at this time. If you discover bugs or have suggestions, please open an issue in [GitHub Issues](https://github.com/qingmeitks/qingmei-cli/issues).


See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## 📄 License

[MIT License](LICENSE) © Qingmei Team

