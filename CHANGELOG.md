# Changelog

<p align="center">
  <b>English</b> | <a href="CHANGELOG.zh-CN.md">简体中文</a>
</p>

---

All notable changes to **Qingmei (青袂) CLI** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.0.2] - Unreleased

### Added
- **Multi-Session Concurrency Engine (`MultiSessionPool`)**:
  - Support multiple flat, in-memory parallel sessions under a single workspace.
  - Non-blocking background task execution: run intensive tasks in background sessions while seamlessly interacting with foreground sessions.
  - Independent context managers, visual history buffers, draft buffers, and `AbortController` cancellation signals per session.
  - Press `Tab` on empty input to quickly cycle through open sessions.
- **Top-Level Direct Commands (Zero Short-Flags)**:
  - `/new [name]`: Create and switch to a new session.
  - `/switch [id]`: Switch active session (interactive selector modal when called without arguments).
  - `/sessions`: List all active in-memory sessions and saved workspace snapshots on disk.
  - `/rename [name]`: Rename the active session.
  - `/close [id]`: Close and release session memory (auto-fallback to adjacent session).
  - `/save [name]`: Persist active session snapshot to `~/.qingmei/sessions/<ws-hash>/`.
  - `/resume [id]`: Restore and wake saved session snapshot into active memory.
  - `/delete [id]`: Delete saved snapshot file (supports ID, name, prefix, suffix, and `/delete all`).
  - `/export [id]`: Export session conversation to Markdown report.
- **Adaptive Dual-Line Status Bar**:
  - **Line 1 (Metrics)**: Token usage (`[1.8k/1M (<0.1%)]`), security mode `[interactive]`, active model `[gemini-3.7-flash]`, `[1M]` badge, and reasoning effort `[high]`.
  - **Line 2 (Adaptive Sessions + Path)**: Dynamically scales across 3 layouts:
    - *Standard Mode (1~4 sessions)*: `[#1 (running)] [#2]* [#3] | ~/path`
    - *Compact Mode (4~6 sessions)*: `[#1 (running)] [#2] [#3] [#4]* [#5] | ~/path`
    - *Ultra-Wide Collapsed Mode (>6 sessions or narrow width)*: `#5* [running] (8 sessions: 2 running, 6 ready) | ~/path`
- **API Key Management & Smart Fallback (`/key` & `/model`)**:
  - Dedicated `/key` management center with masked key previews (`sk-****3f9a`), connectivity probes, and error diagnosis.
  - Parameterized updates (`/key deepseek sk-xxxx`) and direct removals (`/key rm deepseek`).
  - **Runtime Client Hot-Reloading**: update active provider keys without process restarts or losing context history.
  - **In-Flow Management in `/model`**: easily update or unbind credentials directly when selecting configured providers.
  - **Smart Post-Remove Fallback**: guided auto-switch to alternative configured providers when the active key is removed.
- **Expanded Google Gemini Model Presets**:
  - Added official presets for `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash`, and `gemini-3.1-pro-preview` (all supporting 1M+ context window).
- **Curated OpenAI GPT-5.x Model Presets**:
  - Enabled OpenAI provider with presets for `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5` (1M context, tools + reasoning), and `gpt-5.4-mini` (1M context, tools).
- **Exit Guard**:
  - Intercepts `/quit` and `/exit` if background sessions are still active (`[running]` or `[waiting]`), prompting a confirmation warning before force termination.

### Changed
- **Zero Icons UI Redesign**:
  - 100% removed all Emojis and decorative symbols across the entire UI in favor of high-density pure text status badges (`[running]`, `[ready]`, `[waiting]`, `[done]`, `[error]`).
- **Pure Viewport `/clear`**:
  - Reformed `/clear` to clear only the screen viewport while preserving current session conversation memory, token accounting, and context state.
- **Input Pipeline Deduplication**:
  - Single-stream architecture in `TuiPrompt` unifying terminal raw mode, Chinese IME composition commits, and bracketed paste handling without duplication.

---

## [0.0.1] - 2026-08-21

### Added
- **Initial Open Source Release of Qingmei CLI**.
- **Autonomous ReAct Agent Engine**:
  - Multi-step tool use loop with streaming reasoning / thinking tokens.
  - Configurable reasoning effort: `off`, `low`, `medium`, `high`.
  - Built-in loop detection and auto-recovery.
- **Integrated Boxed TUI**:
  - Full-screen terminal layout with comfortable padding and ASCII title art.
  - Smooth operation history viewport with mouse wheel and keyboard scrolling (zero scrollbars).
  - Floating slash command suggestion overlay with fuzzy matching.
- **4-Tier Security Spectrum**:
  - `[interactive]`: Read-only tools execute automatically; write/shell tools require confirmation.
  - `[auto]`: Fully autonomous execution with zero confirmation prompts.
  - `[readonly]`: Strictly read-only analysis; file modifications and command executions are blocked.
  - `[chat]`: Pure conversation mode with zero tool schemas and ultra-low token latency.
- **Workspace Trust & Sandboxing**:
  - Interactive trust prompt on opening unfamiliar repositories.
  - Path containment sandboxing blocking filesystem traversal outside the workspace root.
- **Model Context Protocol (MCP)**:
  - Native stdio process sandboxing and remote SSE transport integration.
  - Automatic namespace isolation (`mcp__<server>__<tool>`).
- **Skill Extension Engine**:
  - Standard `SKILL.md` parser with global registry in `~/.qingmei/skills/`.
- **1M+ Context Awareness**:
  - Curated presets for DeepSeek (`deepseek-v4-flash`, `deepseek-v4-pro`) and Google Gemini (`gemini-3.7-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`).
- **Zero Workspace Pollution**:
  - 100% configuration, session snapshots, and cache isolated under global `~/.qingmei/`.
