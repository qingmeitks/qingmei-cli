# Qingmei (青袂) - Minimalist Modern TypeScript Agent CLI

<p align="center">
  <b>English</b> | <a href="README.zh-CN.md">简体中文</a> | <a href="CHANGELOG.md">Changelog</a>
</p>

---

**Qingmei (青袂)** is a modern, modular, high-density autonomous AI Agent Command Line Interface (CLI) built with TypeScript and Node.js. It features deep integration with the **Multi-Session Background Execution Pool**, the **Model Context Protocol (MCP)** specification, a comprehensive **Skill Extension Engine**, a **4-tier Security Spectrum**, and an icon-free, minimalist boxed terminal interface.

---

## 🌟 Key Features

- **Multi-Session Background Execution & Switching (v0.1.0)**:
  - Multiple flat sessions under a single workspace, each maintaining independent context memory, status machines, and async execution loops.
  - Non-blocking background task execution: start a task in one session and seamlessly switch to another to work on something else.
  - Quick cycle between sessions with `Tab` when input is empty, or open the interactive picker with `/switch`.
  - **Exit Guard**: Prompts a confirmation warning when exiting if background tasks are still running.
- **Autonomous ReAct Reasoning Loop**: Multi-step tool use, thought/reasoning stream rendering, loop detection, and self-healing.
- **Integrated Boxed TUI**:
  - Full-screen layout filling terminal width and height with comfortable outer padding; title at the top, input dock and status bar anchored at the bottom.
  - Adaptive dual-line status bar:
    - **Line 1 (Metrics)**: Context token usage (e.g. `[1.8k/1M (<0.1%)]`), running mode `[interactive]`, active model `[gemini-3.7-flash]`, `[1M]` badge, reasoning effort `[high]`, and untrusted warning.
    - **Line 2 (Adaptive Sessions + Path)**: Standard mode (`[#1 (running)] [#2]*`), compact mode, and ultra-wide collapsed aggregation mode (`#5* [running] (8 sessions: 2 running, 6 ready) | ~/path`).
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
- **Curated Model Presets**:
  - **DeepSeek**: Pre-configured with `deepseek-v4-flash` (1M context, tools + reasoning) and `deepseek-v4-pro` (1M context, tools).
  - **Google Gemini**: Pre-configured with `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash` (1M context, tools + reasoning), and `gemini-3.1-pro-preview` (1M context).
  - **OpenAI**: Pre-configured with `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5` (1M context, tools + reasoning), and `gpt-5.4-mini` (1M context, tools).
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
npx @qingmeitks/cli
```

#### Option B: Global Install
```bash
# Global install via npm
npm install -g @qingmeitks/cli

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

| Command | Description | Example |
| :--- | :--- | :--- |
| **`/new [name]`** | Create and switch to a new session | `/new Refactor API` |
| **`/switch [id]`** | Switch active session (picker modal or press `Tab` on empty line) | `/switch 1` |
| **`/sessions`** | List all open in-memory sessions and saved snapshots | `/sessions` |
| **`/rename [name]`** | Rename current active session | `/rename Architecture` |
| **`/close [id]`** | Close and release specified session from memory | `/close 2` |
| **`/save [name]`** | Save current session snapshot to disk | `/save checkpoint-1` |
| **`/resume [id]`** | Resume a saved snapshot from disk into memory | `/resume sess_123` |
| **`/delete [id]`** | Delete a saved snapshot file from disk (`/delete all` supported) | `/delete sess_123` |
| **`/export [id]`** | Export session to Markdown report | `/export` |
| **`/mode [mode]`** | Switch running mode (`interactive`, `auto`, `readonly`, `chat`) | `/mode auto` |
| **`/model [name]`** | Switch AI model and provider (with in-flow Key management) | `/model` |
| **`/key [prov] [key]`** | Manage API Keys (masked preview, connectivity probe, update, `/key rm <prov>`) | `/key deepseek sk-xxxx` |
| **`/effort [level]`** | Adjust reasoning / thinking effort (`off`, `low`, `medium`, `high`) | `/effort high` |
| **`/skills`** | View installed skills and toggle them on/off | `/skills` |
| **`/mcp`** | Check connected MCP servers health and registered tool count | `/mcp` |
| **`/trust [path]`** | Trust current workspace (enables mutating tools) | `/trust` |
| **`/untrust [path]`** | Untrust workspace and switch to restricted read-only mode | `/untrust` |
| **`/compact`** | Compact and optimize context memory | `/compact` |
| **`/clear`** | Clear screen viewport (retains session memory) | `/clear` |
| **`/config`** | Show current configuration (`/config edit` to edit in editor) | `/config` |
| **`/help`** | Show help message | `/help` |
| **`/exit` or `/quit`** | Exit Qingmei REPL (intercepted if background tasks are running) | `/quit` |

---

## 🛠️ Core Techniques

### 1. Context File Mentions (`@file`)
Type `@` in the input dock to trigger fuzzy file path auto-completion across your project. The referenced files are automatically injected into the agent prompt as structured context.

### 2. Host Shell Passthrough (`!<cmd>`)
Prefix any command with `!` (e.g. `!git status` or `!npm test`) to execute native shell commands directly on the host machine and capture the output inside the TUI viewport.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
