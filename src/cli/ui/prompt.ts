import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SecurityMode, ModelMetadata, ThinkingEffort } from '../../config/types.js';
import { theme } from './theme.js';

export interface SlashCommandInfo {
  command: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommandInfo[] = [
  { command: '/new', description: 'Create and switch to a new session' },
  { command: '/switch', description: 'Switch active session' },
  { command: '/sessions', description: 'List all open sessions and saved snapshots' },
  { command: '/rename', description: 'Rename current active session' },
  { command: '/close', description: 'Close current or specified session' },
  { command: '/save', description: 'Save current session snapshot to disk' },
  { command: '/resume', description: 'Resume a saved snapshot from disk' },
  { command: '/delete', description: 'Delete one or more saved snapshots from disk' },
  { command: '/rm', description: 'Delete one or more saved snapshots from disk' },
  { command: '/export', description: 'Export current session to Markdown report' },
  { command: '/mode', description: 'Switch mode: interactive, auto, readonly, chat' },
  { command: '/model', description: 'Switch AI model & provider' },
  { command: '/key', description: 'Manage AI provider API keys (view, update, remove)' },
  { command: '/effort', description: 'Set reasoning effort: off, low, medium, high' },
  { command: '/skills', description: 'View and toggle active skills' },
  { command: '/mcp', description: 'Check MCP server connections and tools' },
  { command: '/trust', description: 'Trust current workspace to enable full tools' },
  { command: '/untrust', description: 'Untrust current workspace (restricted mode)' },
  { command: '/compact', description: 'Compact and optimize context memory' },
  { command: '/session', description: 'Session commands (new, switch, list, save, resume, delete, export)' },
  { command: '/clear', description: 'Clear screen viewport (retains session memory)' },
  { command: '/config', description: 'Show current configuration' },
  { command: '/help', description: 'Show help message' },
  { command: '/exit', description: 'Exit Qingmei REPL' },
  { command: '/quit', description: 'Exit Qingmei REPL' },
];

export interface TuiPromptOptions {
  mode: SecurityMode;
  model: ModelMetadata;
  cwd: string;
  isWorkspaceTrusted?: boolean;
  thinkingEffort?: ThinkingEffort;
  contextUsage?: string;
  sessionBarText?: string;
}

export interface ModalOption {
  value: string;
  label: string;
  hint?: string;
}

export type ModalState =
  | {
      type: 'select';
      title: string;
      options: ModalOption[];
      selectedIndex: number;
    }
  | {
      type: 'multiselect';
      title: string;
      options: ModalOption[];
      selectedIndex: number;
      selectedValues: Set<string>;
    }
  | {
      type: 'confirm';
      title: string;
      message: string;
      selectedIndex: number; // 0: Yes, 1: No
    }
  | {
      type: 'text';
      title: string;
      placeholder?: string;
      isPassword?: boolean;
      buffer: string;
      cursorIndex: number;
    };

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

export function getCharWidth(char: string): number {
  const code = char.codePointAt(0) || 0;
  // Control characters
  if (code < 32 || (code >= 0x7f && code < 0xa0)) {
    return 0;
  }
  // East Asian Wide / Fullwidth characters & Common Emojis
  if (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK Radicals, Kangxi, Ideographs, Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe10 && code <= 0xfe19) || // Vertical forms
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Symbols
    (code >= 0x1f300 && code <= 0x1f64f) || // Misc Symbols and Pictographs, Emoticons
    (code >= 0x1f680 && code <= 0x1f6ff) || // Transport and Map
    (code >= 0x1f900 && code <= 0x1f9ff) || // Supplemental Symbols and Pictographs
    (code >= 0x20000 && code <= 0x3fffd) // CJK Extensions
  ) {
    return 2;
  }
  return 1;
}

export function getStringWidth(str: string): number {
  const clean = stripAnsi(str);
  let width = 0;
  for (const char of clean) {
    width += getCharWidth(char);
  }
  return width;
}

export function truncateAnsi(str: string, maxVisualWidth: number): string {
  if (maxVisualWidth <= 0) return '';
  const totalVisualWidth = getStringWidth(str);
  if (totalVisualWidth <= maxVisualWidth) return str;

  let currentWidth = 0;
  let result = '';
  let inEscape = false;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\x1b') {
      inEscape = true;
      result += str[i];
    } else if (inEscape) {
      result += str[i];
      if (str[i].match(/[a-zA-Z]/)) {
        inEscape = false;
      }
    } else {
      const char = str[i];
      const charWidth = getCharWidth(char);
      if (currentWidth + charWidth <= maxVisualWidth - 1) {
        result += char;
        currentWidth += charWidth;
      } else {
        result += '…';
        currentWidth += 1;
        break;
      }
    }
  }
  return result + '\x1b[0m';
}

export function extractAnsiRange(str: string, startCol: number, endCol: number): string {
  if (startCol >= endCol || !str) return '';
  let curCol = 0;
  let result = '';
  let activeEscapes = '';

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\x1b') {
      let esc = '';
      while (i < str.length && str[i] !== 'm' && !str[i].match(/[a-zA-Z]/)) {
        esc += str[i];
        i++;
      }
      if (i < str.length) esc += str[i];
      if (esc === '\x1b[0m') {
        activeEscapes = '';
      } else {
        activeEscapes += esc;
      }
      if (curCol >= startCol && curCol < endCol) {
        result += esc;
      }
      continue;
    }

    const char = str[i];
    const charW = getCharWidth(char);

    if (curCol >= endCol) {
      break;
    }

    if (curCol >= startCol) {
      if (result.length === 0 && activeEscapes) {
        result += activeEscapes;
      }
      if (curCol + charW <= endCol) {
        result += char;
      } else {
        result += ' '.repeat(endCol - curCol);
        curCol = endCol;
        break;
      }
    } else if (curCol + charW > startCol) {
      result += ' '.repeat(curCol + charW - startCol);
    }

    curCol += charW;
  }

  return result ? result + '\x1b[0m' : '';
}

function formatRelativePath(fullPath: string): string {
  const home = os.homedir();
  if (fullPath === home) {
    return '~';
  }
  if (fullPath.startsWith(home + path.sep) || fullPath.startsWith(home + '/')) {
    return '~' + fullPath.slice(home.length);
  }
  return fullPath;
}

function wrapAnsiLine(line: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [line];
  const totalWidth = getStringWidth(line);
  if (totalWidth <= maxWidth) {
    return [line];
  }

  const result: string[] = [];
  let curLine = '';
  let curWidth = 0;
  let activeEscapes = '';

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\x1b') {
      let escSeq = '';
      while (i < line.length && line[i] !== 'm' && !line[i].match(/[a-zA-Z]/)) {
        escSeq += line[i];
        i++;
      }
      if (i < line.length) escSeq += line[i];
      curLine += escSeq;
      if (escSeq === '\x1b[0m') {
        activeEscapes = '';
      } else {
        activeEscapes += escSeq;
      }
      continue;
    }

    const char = line[i];
    const charW = getCharWidth(char);

    if (curWidth + charW > maxWidth) {
      result.push(curLine + '\x1b[0m');
      curLine = activeEscapes + char;
      curWidth = charW;
    } else {
      curLine += char;
      curWidth += charW;
    }
  }

  if (curLine.length > 0 && stripAnsi(curLine).length > 0) {
    result.push(curLine);
  }

  return result.length > 0 ? result : [''];
}

export function wrapText(text: string, maxWidth: number): string[] {
  const rawLines = text.split(/\r?\n/);
  const wrapped: string[] = [];
  for (const raw of rawLines) {
    wrapped.push(...wrapAnsiLine(raw, maxWidth));
  }
  return wrapped;
}

export function scanWorkspaceFiles(workspaceRoot: string, maxFiles: number = 300): string[] {
  const results: string[] = [];
  const ignoredDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.turbo',
    '.cache',
    '.DS_Store',
    '.venv',
    'venv',
    'env',
    '.env',
    '__pycache__',
    '.pytest_cache',
    '.idea',
    '.vscode',
    'target',
    'coverage',
  ]);

  function walk(currentDir: string, depth: number) {
    if (depth > 6 || results.length >= maxFiles) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') {
        if (entry.name === '.git' || entry.name === '.DS_Store' || entry.name.startsWith('.venv')) continue;
      }
      if (ignoredDirs.has(entry.name) || entry.name.startsWith('.venv') || entry.name.startsWith('__pycache__')) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(workspaceRoot, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        results.push(relPath);
        if (results.length >= maxFiles) break;
      }
    }
  }

  walk(workspaceRoot, 0);
  return results;
}

export class TuiPrompt {
  private mode: SecurityMode;
  private model: ModelMetadata;
  private cwd: string;
  private isWorkspaceTrusted: boolean = true;
  private thinkingEffort: ThinkingEffort = 'medium';
  private contextUsage: string = '0/1M (<0.1%)';
  private sessionBarText: string = '';
  private history: string[] = [];
  private liveLines: string[] = [];
  private inputHistory: string[] = [];
  private scrollOffset: number = 0;

  // Workspace files cache for @mention completion
  private cachedFiles: string[] = [];
  private lastScanTime: number = 0;

  // Live Activity Spinner state
  private spinnerActive: boolean = false;
  private spinnerLabel: string = '';
  private spinnerStartTime: number = 0;
  private spinnerTimer: NodeJS.Timeout | null = null;
  private spinnerIndex: number = 0;
  private spinnerFrames: string[] = ['-', '\\', '|', '/'];

  // Native Centered Modal State
  private activeModal: ModalState | null = null;

  constructor(options: TuiPromptOptions) {
    this.mode = options.mode;
    this.model = options.model;
    this.cwd = options.cwd;
    this.isWorkspaceTrusted = options.isWorkspaceTrusted !== false;
    this.thinkingEffort = options.thinkingEffort || 'medium';
    this.contextUsage = options.contextUsage || '0/1M (<0.1%)';
    this.sessionBarText = options.sessionBarText || '';
  }

  getWorkspaceFiles(): string[] {
    const now = Date.now();
    if (now - this.lastScanTime > 5000 || this.cachedFiles.length === 0) {
      this.cachedFiles = scanWorkspaceFiles(this.cwd);
      this.lastScanTime = now;
    }
    return this.cachedFiles;
  }

  getMentionMatches(buffer: string, cursorIndex: number): { query: string; startIndex: number; matches: string[] } | null {
    const textBeforeCursor = buffer.slice(0, cursorIndex);
    const match = /@([^\s@]*)$/.exec(textBeforeCursor);
    if (!match) return null;

    const query = match[1].toLowerCase();
    const files = this.getWorkspaceFiles();
    const matches = files
      .filter((f) => f.toLowerCase().includes(query))
      .slice(0, 6);

    return {
      query,
      startIndex: match.index,
      matches,
    };
  }

  startSpinner(label: string = 'Thinking...'): void {
    if (this.spinnerActive) return;
    this.spinnerActive = true;
    this.spinnerLabel = label;
    this.spinnerStartTime = Date.now();
    this.spinnerIndex = 0;

    this.spinnerTimer = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
      this.renderBox('', 0, 0);
    }, 100);
  }

  updateSpinner(label: string): void {
    this.spinnerLabel = label;
  }

  stopSpinner(): void {
    if (!this.spinnerActive) return;
    this.spinnerActive = false;
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  updateState(
    mode?: SecurityMode,
    model?: ModelMetadata,
    isWorkspaceTrusted?: boolean,
    thinkingEffort?: ThinkingEffort,
    contextUsage?: string,
    sessionBarText?: string
  ): void {
    if (mode) {
      this.mode = mode;
    }
    if (model) {
      this.model = model;
    }
    if (isWorkspaceTrusted !== undefined) {
      this.isWorkspaceTrusted = isWorkspaceTrusted;
    }
    if (thinkingEffort) {
      this.thinkingEffort = thinkingEffort;
    }
    if (contextUsage) {
      this.contextUsage = contextUsage;
    }
    if (sessionBarText !== undefined) {
      this.sessionBarText = sessionBarText;
    }
  }

  addHistory(text: string | string[]): void {
    const cols = process.stdout.columns || 80;
    const contentWidth = Math.max(20, cols);

    if (Array.isArray(text)) {
      for (const t of text) {
        this.history.push(...wrapText(t, contentWidth));
      }
    } else {
      this.history.push(...wrapText(text, contentWidth));
    }
    this.scrollOffset = 0;
  }

  setLiveLines(lines: string | string[]): void {
    this.liveLines = Array.isArray(lines) ? lines : [lines];
    this.scrollOffset = 0;
    this.renderBox('', 0, 0);
  }

  clearLiveLines(): void {
    this.liveLines = [];
    this.renderBox('', 0, 0);
  }

  commitLiveLines(): void {
    if (this.liveLines.length > 0) {
      this.addHistory(this.liveLines);
      this.liveLines = [];
      this.renderBox('', 0, 0);
    }
  }

  clearHistory(): void {
    this.history = [];
    this.liveLines = [];
    this.scrollOffset = 0;
  }

  getHistory(): string[] {
    return this.history;
  }

  getInputHistory(): string[] {
    return [...this.inputHistory];
  }

  addInputHistory(cmd: string): void {
    if (cmd && (this.inputHistory.length === 0 || this.inputHistory[this.inputHistory.length - 1] !== cmd)) {
      this.inputHistory.push(cmd);
    }
  }

  clearInputHistory(): void {
    this.inputHistory = [];
  }

  private getStatusBarText(maxContentWidth: number): string {
    const modeBadge = theme.badgeMode(this.mode);
    const modelBadge = theme.badgeModel(this.model.id);
    const contextBadge = theme.badgeContext(this.model);
    const usageBadge = chalk.dim(`[${this.contextUsage}]`);

    const parts = [usageBadge, modeBadge, modelBadge];
    if (contextBadge) parts.push(contextBadge);
    if (this.model.supportsReasoning) {
      parts.push(chalk.magenta(`[${this.thinkingEffort}]`));
    }

    if (!this.isWorkspaceTrusted) {
      parts.push(chalk.redBright.bold('[untrusted]'));
    }

    return parts.join(' ');
  }

  private getPathBarText(maxContentWidth: number): string {
    const relPath = formatRelativePath(this.cwd);
    let shortPath = relPath;
    const visualLen = getStringWidth(shortPath);
    if (visualLen > maxContentWidth) {
      shortPath = `...${shortPath.slice(-(maxContentWidth - 3))}`;
    }
    return chalk.dim(shortPath);
  }

  getMatchingCommands(input: string): SlashCommandInfo[] {
    if (!input.startsWith('/')) return [];
    const prefix = input.split(/\s+/)[0].toLowerCase();
    return SLASH_COMMANDS.filter((cmd) => cmd.command.toLowerCase().startsWith(prefix));
  }

  renderModalOverlay(contentWidth: number): string[] {
    if (!this.activeModal) return [];

    const lines: string[] = [];

    if (this.activeModal.type === 'select') {
      const { title, options, selectedIndex } = this.activeModal;
      const modalWidth = Math.min(contentWidth - 4, 64);
      const modalInner = modalWidth - 2;

      const modalRow = (text: string) => {
        const fitted = truncateAnsi(text, modalInner - 4);
        const vLen = getStringWidth(fitted);
        const pad = Math.max(0, modalInner - 4 - vLen);
        return `${chalk.cyan('│')}  ${fitted}${' '.repeat(pad)}  ${chalk.cyan('│')}`;
      };

      const titleText = ` ${chalk.bold.cyanBright(title)} `;
      const titleLen = getStringWidth(titleText);
      const topDashTotal = Math.max(0, modalInner - titleLen);
      const topDashLeft = 2;
      const topDashRight = Math.max(0, topDashTotal - topDashLeft);

      const topBorder = `${chalk.cyan('┌')}${chalk.cyan('─'.repeat(topDashLeft))}${titleText}${chalk.cyan('─'.repeat(topDashRight))}${chalk.cyan('┐')}`;
      const bottomBorder = `${chalk.cyan('└')}${chalk.cyan('─'.repeat(modalInner))}${chalk.cyan('┘')}`;

      lines.push(topBorder);
      lines.push(modalRow(''));

      const maxDisplay = Math.min(options.length, 8);
      let startIndex = 0;
      if (selectedIndex >= maxDisplay) {
        startIndex = selectedIndex - maxDisplay + 1;
      }
      const visibleOpts = options.slice(startIndex, startIndex + maxDisplay);

      for (let i = 0; i < visibleOpts.length; i++) {
        const actualIdx = startIndex + i;
        const opt = visibleOpts[i];
        const isSelected = actualIdx === selectedIndex;
        const hintStr = opt.hint ? chalk.dim(` (${opt.hint})`) : '';

        if (isSelected) {
          const pointer = chalk.cyanBright('>');
          const labelStr = chalk.bold.cyanBright(opt.label);
          lines.push(modalRow(`  ${pointer} ${labelStr}${hintStr}`));
        } else {
          const pointer = ' ';
          const labelStr = chalk.white(opt.label);
          lines.push(modalRow(`  ${pointer} ${labelStr}${hintStr}`));
        }
      }

      lines.push(modalRow(''));
      lines.push(modalRow(chalk.dim('(Up/Down Select, Enter Confirm, Esc Cancel)')));
      lines.push(bottomBorder);

    } else if (this.activeModal.type === 'multiselect') {
      const { title, options, selectedIndex, selectedValues } = this.activeModal;
      const modalWidth = Math.min(contentWidth - 4, 72);
      const modalInner = modalWidth - 2;

      const modalRow = (text: string) => {
        const fitted = truncateAnsi(text, modalInner - 4);
        const vLen = getStringWidth(fitted);
        const pad = Math.max(0, modalInner - 4 - vLen);
        return `${chalk.cyan('│')}  ${fitted}${' '.repeat(pad)}  ${chalk.cyan('│')}`;
      };

      const titleText = ` ${chalk.bold.cyanBright(title)} `;
      const titleLen = getStringWidth(titleText);
      const topDashTotal = Math.max(0, modalInner - titleLen);
      const topDashLeft = 2;
      const topDashRight = Math.max(0, topDashTotal - topDashLeft);

      const topBorder = `${chalk.cyan('┌')}${chalk.cyan('─'.repeat(topDashLeft))}${titleText}${chalk.cyan('─'.repeat(topDashRight))}${chalk.cyan('┐')}`;
      const bottomBorder = `${chalk.cyan('└')}${chalk.cyan('─'.repeat(modalInner))}${chalk.cyan('┘')}`;

      lines.push(topBorder);
      lines.push(modalRow(''));

      const maxDisplay = Math.min(options.length, 8);
      let startIndex = 0;
      if (selectedIndex >= maxDisplay) {
        startIndex = selectedIndex - maxDisplay + 1;
      }
      const visibleOpts = options.slice(startIndex, startIndex + maxDisplay);

      for (let i = 0; i < visibleOpts.length; i++) {
        const actualIdx = startIndex + i;
        const opt = visibleOpts[i];
        const isCursor = actualIdx === selectedIndex;
        const isChecked = selectedValues.has(opt.value);
        const checkMark = isChecked ? chalk.greenBright.bold('[x]') : chalk.dim('[ ]');
        const hintStr = opt.hint ? chalk.dim(` (${opt.hint})`) : '';

        if (isCursor) {
          const pointer = chalk.cyanBright('>');
          const labelStr = chalk.bold.cyanBright(opt.label);
          lines.push(modalRow(`  ${pointer} ${checkMark} ${labelStr}${hintStr}`));
        } else {
          const pointer = ' ';
          const labelStr = chalk.white(opt.label);
          lines.push(modalRow(`  ${pointer} ${checkMark} ${labelStr}${hintStr}`));
        }
      }

      lines.push(modalRow(''));
      const countStr = chalk.cyan(`(${selectedValues.size}/${options.length} selected)`);
      lines.push(modalRow(`${countStr} ${chalk.dim('Space toggle, \'a\' all, Enter confirm, Esc cancel')}`));
      lines.push(bottomBorder);

    } else if (this.activeModal.type === 'confirm') {
      const { title, message, selectedIndex } = this.activeModal;
      const modalWidth = Math.min(contentWidth - 4, Math.max(52, getStringWidth(message) + 12));
      const modalInner = modalWidth - 2;

      const modalRow = (text: string) => {
        const fitted = truncateAnsi(text, modalInner - 4);
        const vLen = getStringWidth(fitted);
        const pad = Math.max(0, modalInner - 4 - vLen);
        return `${chalk.cyan('│')}  ${fitted}${' '.repeat(pad)}  ${chalk.cyan('│')}`;
      };

      const titleText = ` ${chalk.bold.yellowBright(title)} `;
      const titleLen = getStringWidth(titleText);
      const topDashTotal = Math.max(0, modalInner - titleLen);
      const topDashLeft = 2;
      const topDashRight = Math.max(0, topDashTotal - topDashLeft);

      lines.push(`${chalk.cyan('┌')}${chalk.cyan('─'.repeat(topDashLeft))}${titleText}${chalk.cyan('─'.repeat(topDashRight))}${chalk.cyan('┐')}`);
      lines.push(modalRow(''));
      lines.push(modalRow(chalk.whiteBright(message)));
      lines.push(modalRow(''));

      const yesBtn = selectedIndex === 0 ? chalk.bgCyan.black.bold('  [ Yes ]  ') : chalk.dim('  [ Yes ]  ');
      const noBtn = selectedIndex === 1 ? chalk.bgRed.white.bold('  [ No ]  ') : chalk.dim('  [ No ]  ');
      lines.push(modalRow(`    ${yesBtn}      ${noBtn}`));
      lines.push(modalRow(''));
      lines.push(modalRow(chalk.dim('(Left/Right or Tab toggle, Enter Confirm, Esc Cancel)')));
      lines.push(`${chalk.cyan('└')}${chalk.cyan('─'.repeat(modalInner))}${chalk.cyan('┘')}`);

    } else if (this.activeModal.type === 'text') {
      const { title, placeholder, isPassword, buffer } = this.activeModal;
      const modalWidth = Math.min(contentWidth - 4, 60);
      const modalInner = modalWidth - 2;

      const modalRow = (text: string) => {
        const fitted = truncateAnsi(text, modalInner - 4);
        const vLen = getStringWidth(fitted);
        const pad = Math.max(0, modalInner - 4 - vLen);
        return `${chalk.cyan('│')}  ${fitted}${' '.repeat(pad)}  ${chalk.cyan('│')}`;
      };

      const titleText = ` ${chalk.bold.whiteBright(title)} `;
      const titleLen = getStringWidth(titleText);
      const topDashTotal = Math.max(0, modalInner - titleLen);
      const topDashLeft = 2;
      const topDashRight = Math.max(0, topDashTotal - topDashLeft);

      lines.push(`${chalk.cyan('┌')}${chalk.cyan('─'.repeat(topDashLeft))}${titleText}${chalk.cyan('─'.repeat(topDashRight))}${chalk.cyan('┐')}`);
      lines.push(modalRow(''));

      const displayVal = isPassword ? '•'.repeat(buffer.length) : buffer;
      const shownVal = displayVal.length > 0 ? displayVal : (placeholder ? chalk.dim(placeholder) : '');
      lines.push(modalRow(`${chalk.cyan('> ')}${shownVal}`));
      lines.push(modalRow(''));
      lines.push(modalRow(chalk.dim('(Enter Confirm, Esc Cancel)')));
      lines.push(`${chalk.cyan('└')}${chalk.cyan('─'.repeat(modalInner))}${chalk.cyan('┘')}`);
    }

    return lines;
  }

  renderBox(buffer: string = '', cursorIndex: number = 0, selectedIndex: number = 0): void {
    if (!process.stdin.isTTY) return;

    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;

    const contentWidth = Math.max(20, cols);
    const totalBoxHeight = Math.max(12, rows - 1);

    const formatRow = (content: string): string => {
      const fittedContent = truncateAnsi(content, contentWidth);
      return fittedContent + '\x1b[K';
    };

    const innerDivider = formatRow(chalk.dim('─'.repeat(contentWidth)));

    // Top Section: Title & Subtitle
    const topLines: string[] = [
      formatRow(chalk.bold.cyanBright('█▀█ █ █▄ █ █▀▀ █▀▄▀█ █▀▀ █') + '   ' + chalk.bold.whiteBright('v0.1.0')),
      formatRow(chalk.bold.cyanBright('▀▀█ █ █ ▀█ █▄█ █ ▀ █ ██▄ █') + '   ' + chalk.dim('Type your request, @file, !cmd, or slash commands (e.g. /help, /mode, /model, /exit)')),
      formatRow(''),
    ];

    // Bottom Dock: Multiline-aware input prompt
    let inputPrompt: string;
    let visualCursorOffset = 0;

    if (buffer.includes('\n')) {
      const lines = buffer.split('\n');
      const firstLine = lines[0];
      const totalCount = lines.length;
      inputPrompt = `${chalk.cyan('> ')}${firstLine} ${chalk.cyanBright.dim(`(+${totalCount - 1} lines)`)}`;
      visualCursorOffset = getStringWidth(firstLine);
    } else {
      inputPrompt = `${chalk.cyan('> ')}${buffer}`;
      visualCursorOffset = getStringWidth(buffer.slice(0, cursorIndex));
    }

    const secondStatusLine = this.sessionBarText || this.getPathBarText(contentWidth);

    const bottomDockLines: string[] = [
      formatRow(''), // Breathing room above input dock
      innerDivider,
      formatRow(inputPrompt),
      innerDivider,
      formatRow(this.getStatusBarText(contentWidth)),
      formatRow(secondStatusLine),
    ];

    // Calculate available viewport height in the middle for Operation History
    const usedLines = topLines.length + bottomDockLines.length;
    const viewportHeight = Math.max(0, totalBoxHeight - usedLines);

    // Prepare all history lines: committed history + dynamic live activity lines + live spinner line
    const dynamicLines: string[] = [];
    for (const l of this.liveLines) {
      dynamicLines.push(...wrapText(l, contentWidth));
    }
    if (this.spinnerActive) {
      const elapsed = ((Date.now() - this.spinnerStartTime) / 1000).toFixed(1);
      const spinnerChar = chalk.cyanBright(this.spinnerFrames[this.spinnerIndex]);
      dynamicLines.push(`${spinnerChar} ${chalk.bold.cyan(this.spinnerLabel)} ${chalk.dim(`(${elapsed}s)`)}`);
    }

    const allHistoryLines = [...this.history, ...dynamicLines];
    const totalHistory = allHistoryLines.length;
    const maxScroll = Math.max(0, totalHistory - viewportHeight);
    if (this.scrollOffset > maxScroll) {
      this.scrollOffset = maxScroll;
    }
    if (this.scrollOffset < 0) {
      this.scrollOffset = 0;
    }

    const startIndex = Math.max(0, totalHistory - viewportHeight - this.scrollOffset);
    const visibleSlice = allHistoryLines.slice(startIndex, startIndex + viewportHeight);

    const middleLines: string[] = [];
    for (const hLine of visibleSlice) {
      middleLines.push(formatRow(hLine));
    }

    // Fill remaining empty rows if history has fewer items than viewport
    while (middleLines.length < viewportHeight) {
      middleLines.push(formatRow(''));
    }

    // Floating overlay rendering
    if (this.activeModal) {
      const modalRows = this.renderModalOverlay(contentWidth);
      const modalHeight = modalRows.length;
      const startInject = Math.max(0, Math.floor((viewportHeight - modalHeight) / 2));

      for (let i = 0; i < modalHeight && startInject + i < middleLines.length; i++) {
        const modalLine = modalRows[i];
        const modalW = getStringWidth(modalLine);
        const leftSpace = Math.max(0, Math.floor((contentWidth - modalW) / 2));
        const bgLine = middleLines[startInject + i] || '';
        const leftBg = extractAnsiRange(bgLine, 0, leftSpace);
        const leftPad = ' '.repeat(Math.max(0, leftSpace - getStringWidth(leftBg)));
        const rightBg = extractAnsiRange(bgLine, leftSpace + modalW, contentWidth);
        middleLines[startInject + i] = formatRow(`${leftBg}${leftPad}${modalLine}${rightBg}`);
      }
    } else {
      // Check @mention overlay
      const mentionData = this.getMentionMatches(buffer, cursorIndex);
      if (mentionData && mentionData.matches.length > 0) {
        const matches = mentionData.matches;
        const maxOverlay = Math.min(matches.length, 5);
        const overlayRows: string[] = [];

        for (let i = 0; i < maxOverlay; i++) {
          const file = matches[i];
          const isSelected = i === selectedIndex;
          if (isSelected) {
            overlayRows.push(chalk.bgCyan.black.bold(` > @${file} `));
          } else {
            overlayRows.push(chalk.dim(`   @${file} `));
          }
        }

        const injectStart = Math.max(0, middleLines.length - overlayRows.length);
        for (let i = 0; i < overlayRows.length; i++) {
          middleLines[injectStart + i] = formatRow(overlayRows[i]);
        }
      } else if (buffer.startsWith('/') && !buffer.includes(' ')) {
        // Check slash suggestions overlay
        const matches = this.getMatchingCommands(buffer);
        if (matches.length > 0) {
          const maxOverlay = Math.min(matches.length, 5);
          const overlayRows: string[] = [];

          for (let i = 0; i < maxOverlay; i++) {
            const cmd = matches[i];
            const isSelected = i === selectedIndex;
            if (isSelected) {
              overlayRows.push(chalk.bgCyan.black.bold(` > ${cmd.command} `) + chalk.cyanBright(` - ${cmd.description}`));
            } else {
              overlayRows.push(chalk.cyan(`   ${cmd.command}`) + chalk.dim(` - ${cmd.description}`));
            }
          }

          const injectStart = Math.max(0, middleLines.length - overlayRows.length);
          for (let i = 0; i < overlayRows.length; i++) {
            middleLines[injectStart + i] = formatRow(overlayRows[i]);
          }
        }
      }
    }

    // Assemble all screen rows
    const allScreenRows = [
      ...topLines,
      ...middleLines,
      ...bottomDockLines,
    ];

    // Atomic full-screen draw
    const outputBuffer = '\x1b[?25l\x1b[H' + allScreenRows.join('\n') + '\n';
    process.stdout.write(outputBuffer);

    // Reposition cursor in input box
    const cursorRow = topLines.length + viewportHeight + 3;
    const cursorCol = 1 + 2 + visualCursorOffset;
    process.stdout.write(`\x1b[${cursorRow};${cursorCol}H\x1b[?25h`);
  }

  async selectModal(options: {
    title: string;
    options: ModalOption[];
    initialValue?: string;
  }): Promise<string | null> {
    if (!process.stdin.isTTY || options.options.length === 0) {
      return options.options[0]?.value || null;
    }

    return new Promise((resolve) => {
      let selectedIndex = 0;
      if (options.initialValue) {
        const found = options.options.findIndex((o) => o.value === options.initialValue);
        if (found >= 0) selectedIndex = found;
      }

      this.activeModal = {
        type: 'select',
        title: options.title,
        options: options.options,
        selectedIndex,
      };

      const render = () => {
        if (this.activeModal && this.activeModal.type === 'select') {
          this.activeModal.selectedIndex = selectedIndex;
        }
        this.renderBox('', 0, 0);
      };

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      render();

      const onKeypress = (str: string | undefined, key: readline.Key) => {
        if (!key) return;

        if (key.name === 'up') {
          selectedIndex = (selectedIndex - 1 + options.options.length) % options.options.length;
          render();
          return;
        }

        if (key.name === 'down') {
          selectedIndex = (selectedIndex + 1) % options.options.length;
          render();
          return;
        }

        if (key.name === 'return') {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(options.options[selectedIndex]?.value || null);
          return;
        }

        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(null);
          return;
        }
      };

      const cleanup = () => {
        process.stdin.removeListener('keypress', onKeypress);
      };

      process.stdin.on('keypress', onKeypress);
    });
  }

  async multiselectModal(options: {
    title: string;
    options: ModalOption[];
    initialValues?: string[];
  }): Promise<string[] | null> {
    if (!process.stdin.isTTY || options.options.length === 0) {
      return options.initialValues || [];
    }

    return new Promise((resolve) => {
      let selectedIndex = 0;
      const selectedValues = new Set<string>(options.initialValues || []);

      this.activeModal = {
        type: 'multiselect',
        title: options.title,
        options: options.options,
        selectedIndex,
        selectedValues,
      };

      const render = () => {
        if (this.activeModal && this.activeModal.type === 'multiselect') {
          this.activeModal.selectedIndex = selectedIndex;
          this.activeModal.selectedValues = selectedValues;
        }
        this.renderBox('', 0, 0);
      };

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      render();

      const onKeypress = (str: string | undefined, key: readline.Key) => {
        if (!key) return;

        if (key.name === 'up') {
          selectedIndex = (selectedIndex - 1 + options.options.length) % options.options.length;
          render();
          return;
        }

        if (key.name === 'down') {
          selectedIndex = (selectedIndex + 1) % options.options.length;
          render();
          return;
        }

        if (key.name === 'space' || str === ' ') {
          const curVal = options.options[selectedIndex]?.value;
          if (curVal) {
            if (selectedValues.has(curVal)) {
              selectedValues.delete(curVal);
            } else {
              selectedValues.add(curVal);
            }
          }
          render();
          return;
        }

        if (str === 'a' || str === 'A') {
          if (selectedValues.size === options.options.length) {
            selectedValues.clear();
          } else {
            for (const opt of options.options) {
              selectedValues.add(opt.value);
            }
          }
          render();
          return;
        }

        if (key.name === 'return') {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(Array.from(selectedValues));
          return;
        }

        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(null);
          return;
        }
      };

      const cleanup = () => {
        process.stdin.removeListener('keypress', onKeypress);
      };

      process.stdin.on('keypress', onKeypress);
    });
  }

  async confirmModal(options: {
    title: string;
    message: string;
    initialValue?: boolean;
  }): Promise<boolean> {
    if (!process.stdin.isTTY) {
      return options.initialValue !== false;
    }

    return new Promise((resolve) => {
      let selectedIndex = options.initialValue !== false ? 0 : 1;

      this.activeModal = {
        type: 'confirm',
        title: options.title,
        message: options.message,
        selectedIndex,
      };

      const render = () => {
        if (this.activeModal && this.activeModal.type === 'confirm') {
          this.activeModal.selectedIndex = selectedIndex;
        }
        this.renderBox('', 0, 0);
      };

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      render();

      const onKeypress = (str: string | undefined, key: readline.Key) => {
        if (!key) return;

        if (key.name === 'left' || key.name === 'right' || key.name === 'tab' || key.name === 'up' || key.name === 'down') {
          selectedIndex = selectedIndex === 0 ? 1 : 0;
          render();
          return;
        }

        if (str === 'y' || str === 'Y') {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(true);
          return;
        }

        if (str === 'n' || str === 'N') {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(false);
          return;
        }

        if (key.name === 'return') {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(selectedIndex === 0);
          return;
        }

        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(false);
          return;
        }
      };

      const cleanup = () => {
        process.stdin.removeListener('keypress', onKeypress);
      };

      process.stdin.on('keypress', onKeypress);
    });
  }

  async textModal(options: {
    title: string;
    placeholder?: string;
    isPassword?: boolean;
    initialValue?: string;
  }): Promise<string | null> {
    if (!process.stdin.isTTY) {
      return options.initialValue || null;
    }

    return new Promise((resolve) => {
      let buffer = options.initialValue || '';
      let cursorIndex = buffer.length;

      this.activeModal = {
        type: 'text',
        title: options.title,
        placeholder: options.placeholder,
        isPassword: options.isPassword,
        buffer,
        cursorIndex,
      };

      const render = () => {
        if (this.activeModal && this.activeModal.type === 'text') {
          this.activeModal.buffer = buffer;
          this.activeModal.cursorIndex = cursorIndex;
        }
        this.renderBox('', 0, 0);
      };

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      render();

      const onKeypress = (str: string | undefined, key: readline.Key) => {
        if (!key) return;

        if (key.name === 'backspace') {
          if (cursorIndex > 0) {
            buffer = buffer.slice(0, cursorIndex - 1) + buffer.slice(cursorIndex);
            cursorIndex--;
            render();
          }
          return;
        }

        if (key.name === 'left') {
          if (cursorIndex > 0) {
            cursorIndex--;
            render();
          }
          return;
        }

        if (key.name === 'right') {
          if (cursorIndex < buffer.length) {
            cursorIndex++;
            render();
          }
          return;
        }

        if (key.name === 'return') {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(buffer.trim() || null);
          return;
        }

        if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
          cleanup();
          this.activeModal = null;
          this.renderBox('', 0, 0);
          resolve(null);
          return;
        }

        if (key.sequence === '\x1b[200~' || key.sequence === '\x1b[201~' || str === '\x1b[200~' || str === '\x1b[201~') {
          return;
        }

        if (str && !key.ctrl && !key.meta && !str.startsWith('\x1b') && str.length === 1) {
          buffer = buffer.slice(0, cursorIndex) + str + buffer.slice(cursorIndex);
          cursorIndex++;
          render();
        }
      };

      const cleanup = () => {
        process.stdin.removeListener('keypress', onKeypress);
      };

      process.stdin.on('keypress', onKeypress);
    });
  }

  async readLine(callbacks?: { onEmptyTab?: () => void }): Promise<string> {
    if (!process.stdin.isTTY) {
      return new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question('> ', (ans) => {
          rl.close();
          resolve(ans.trim());
        });
      });
    }

    return new Promise((resolve) => {
      let buffer = '';
      let cursorIndex = 0;
      let selectedIndex = 0;
      let historyIndex = -1;
      let savedInputBuffer = '';

      const render = () => {
        this.renderBox(buffer, cursorIndex, selectedIndex);
      };

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();

      // Enable Bracketed Paste Mode
      process.stdout.write('\x1b[?2004h');

      const onResize = () => {
        render();
      };
      process.stdout.on('resize', onResize);

      let isBracketedPasting = false;

      const onRawData = (data: Buffer) => {
        const str = data.toString();

        if (str.includes('\x1b[200~')) {
          isBracketedPasting = true;
        }
        if (str.includes('\x1b[201~')) {
          isBracketedPasting = false;
        }

        if (str.includes('<64;')) {
          const maxScroll = Math.max(0, this.history.length + this.liveLines.length - 5);
          this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 3);
          render();
          return;
        }
        if (str.includes('<65;')) {
          this.scrollOffset = Math.max(0, this.scrollOffset - 3);
          render();
          return;
        }
      };
      process.stdin.on('data', onRawData);

      render();

      const onKeypress = (str: string | undefined, key: readline.Key) => {
        if (!key) return;
        if (key.sequence === '\x1b[200~' || key.sequence === '\x1b[201~' || str === '\x1b[200~' || str === '\x1b[201~') {
          return;
        }

        if (key.ctrl && key.name === 'c') {
          if (buffer.length > 0) {
            buffer = '';
            cursorIndex = 0;
            selectedIndex = 0;
            historyIndex = -1;
            render();
            return;
          }
          cleanup();
          process.stdout.write('\x1b[0 q\x1b[?2004l\x1b[2J\x1b[3J\x1b[H\x1b[?25h');
          process.exit(0);
        }

        if (key.ctrl && key.name === 'd') {
          cleanup();
          process.stdout.write('\x1b[0 q\x1b[?2004l\x1b[2J\x1b[3J\x1b[H\x1b[?25h');
          process.exit(0);
        }

        if (key.name === 'escape') {
          if (buffer.length > 0) {
            buffer = '';
            cursorIndex = 0;
            selectedIndex = 0;
            historyIndex = -1;
            render();
          }
          return;
        }

        if (key.name === 'pageup') {
          const maxScroll = Math.max(0, this.history.length + this.liveLines.length - 5);
          this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 6);
          render();
          return;
        }
        if (key.name === 'pagedown') {
          this.scrollOffset = Math.max(0, this.scrollOffset - 6);
          render();
          return;
        }

        if (key.name === 'up') {
          if (historyIndex === -1 && buffer.startsWith('/') && !buffer.includes(' ')) {
            const matches = this.getMatchingCommands(buffer);
            if (matches.length > 1) {
              selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
              render();
              return;
            }
          }

          const mentionData = this.getMentionMatches(buffer, cursorIndex);
          if (historyIndex === -1 && mentionData && mentionData.matches.length > 1) {
            selectedIndex = (selectedIndex - 1 + mentionData.matches.length) % mentionData.matches.length;
            render();
            return;
          }

          if (this.inputHistory.length > 0) {
            if (historyIndex === -1) {
              savedInputBuffer = buffer;
              historyIndex = this.inputHistory.length - 1;
            } else if (historyIndex > 0) {
              historyIndex--;
            }
            buffer = this.inputHistory[historyIndex];
            cursorIndex = buffer.length;
            selectedIndex = 0;
            render();
            return;
          }
          return;
        }

        if (key.name === 'down') {
          if (historyIndex === -1 && buffer.startsWith('/') && !buffer.includes(' ')) {
            const matches = this.getMatchingCommands(buffer);
            if (matches.length > 1) {
              selectedIndex = (selectedIndex + 1) % matches.length;
              render();
              return;
            }
          }

          const mentionData = this.getMentionMatches(buffer, cursorIndex);
          if (historyIndex === -1 && mentionData && mentionData.matches.length > 1) {
            selectedIndex = (selectedIndex + 1) % mentionData.matches.length;
            render();
            return;
          }

          if (historyIndex !== -1) {
            if (historyIndex < this.inputHistory.length - 1) {
              historyIndex++;
              buffer = this.inputHistory[historyIndex];
              cursorIndex = buffer.length;
            } else {
              historyIndex = -1;
              buffer = savedInputBuffer;
              cursorIndex = buffer.length;
            }
            selectedIndex = 0;
            render();
            return;
          }
          return;
        }

        if (key.name === 'return' || key.name === 'enter') {
          if (isBracketedPasting) {
            buffer = buffer.slice(0, cursorIndex) + '\n' + buffer.slice(cursorIndex);
            cursorIndex++;
            selectedIndex = 0;
            historyIndex = -1;
            render();
            return;
          }

          const mentionData = this.getMentionMatches(buffer, cursorIndex);
          if (mentionData && mentionData.matches.length > 0) {
            const chosenFile = mentionData.matches[selectedIndex] || mentionData.matches[0];
            const before = buffer.slice(0, mentionData.startIndex);
            const after = buffer.slice(cursorIndex);
            buffer = `${before}@${chosenFile} ${after}`;
            cursorIndex = (before + '@' + chosenFile + ' ').length;
            selectedIndex = 0;
            render();
            return;
          }

          let chosen = buffer.trim();
          if (buffer.startsWith('/')) {
            const matches = this.getMatchingCommands(buffer);
            if (matches.length > 0 && !buffer.includes(' ')) {
              chosen = matches[selectedIndex]?.command || buffer.trim();
            }
          }

          if (chosen) {
            this.addInputHistory(chosen);
          }

          cleanup();
          resolve(chosen);
          return;
        }

        // Tab Autocomplete or Empty-Tab Switch
        if (key.name === 'tab') {
          if (buffer.length === 0) {
            if (callbacks?.onEmptyTab) {
              callbacks.onEmptyTab();
              render();
              return;
            }
          }

          const mentionData = this.getMentionMatches(buffer, cursorIndex);
          if (mentionData && mentionData.matches.length > 0) {
            const chosenFile = mentionData.matches[selectedIndex] || mentionData.matches[0];
            const before = buffer.slice(0, mentionData.startIndex);
            const after = buffer.slice(cursorIndex);
            buffer = `${before}@${chosenFile} ${after}`;
            cursorIndex = (before + '@' + chosenFile + ' ').length;
            selectedIndex = 0;
            render();
            return;
          }

          if (buffer.startsWith('/')) {
            const matches = this.getMatchingCommands(buffer);
            if (matches.length > 0) {
              const selectedCmd = matches[selectedIndex]?.command || matches[0].command;
              buffer = selectedCmd + ' ';
              cursorIndex = buffer.length;
              selectedIndex = 0;
              render();
            }
          }
          return;
        }

        if (key.name === 'backspace') {
          if (cursorIndex > 0) {
            buffer = buffer.slice(0, cursorIndex - 1) + buffer.slice(cursorIndex);
            cursorIndex--;
            selectedIndex = 0;
            historyIndex = -1;
            this.scrollOffset = 0;
            render();
          }
          return;
        }

        if (key.name === 'left') {
          if (cursorIndex > 0) {
            cursorIndex--;
            render();
          }
          return;
        }
        if (key.name === 'right') {
          if (cursorIndex < buffer.length) {
            cursorIndex++;
            render();
          }
          return;
        }

        if (str && !key.ctrl && !key.meta && !str.startsWith('\x1b') && !str.includes('\x1b')) {
          buffer = buffer.slice(0, cursorIndex) + str + buffer.slice(cursorIndex);
          cursorIndex += str.length;
          selectedIndex = 0;
          historyIndex = -1;
          this.scrollOffset = 0;
          render();
        }
      };

      const cleanup = () => {
        process.stdout.write('\x1b[?2004l');
        process.stdin.removeListener('keypress', onKeypress);
        process.stdin.removeListener('data', onRawData);
        process.stdout.removeListener('resize', onResize);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.resume();
      };

      process.stdin.on('keypress', onKeypress);
    });
  }
}
