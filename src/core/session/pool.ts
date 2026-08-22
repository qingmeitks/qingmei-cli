import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { SessionInstance, SessionInstanceConfig } from './instance.js';
import { SessionStatus, SessionSummary } from './types.js';
import {
  SessionSnapshot,
  listSessionSnapshots,
  loadSessionSnapshot,
  deleteSessionSnapshot,
  exportSessionToMarkdown,
} from './storage.js';
import { LLMClient } from '../llm/client.js';
import { ToolDispatcher } from '../dispatcher.js';
import { ContextManager } from '../context.js';
import { ModelMetadata, SecurityMode, ThinkingEffort, CompactionConfig } from '../../config/types.js';
import { SkillManager } from '../../skills/manager.js';

export interface MultiSessionPoolConfig {
  workingDirectory: string;
  securityMode: SecurityMode;
  isWorkspaceTrusted?: boolean;
  thinkingEffort?: ThinkingEffort;
  compactionConfig?: CompactionConfig;
  llmClient: LLMClient;
  activeModel: ModelMetadata;
  toolDispatcher: ToolDispatcher;
  skillManager?: SkillManager;
}

export function formatRelativePath(fullPath: string): string {
  const home = os.homedir();
  if (fullPath === home) {
    return '~';
  }
  if (fullPath.startsWith(home + path.sep) || fullPath.startsWith(home + '/')) {
    return '~' + fullPath.slice(home.length);
  }
  return fullPath;
}

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

export class MultiSessionPool {
  public sessions: Map<string, SessionInstance> = new Map();
  public activeSessionId: string = '';
  private nextIndex: number = 1;
  private config: MultiSessionPoolConfig;

  constructor(config: MultiSessionPoolConfig) {
    this.config = config;
    // Create initial default session #1
    const initialSession = this.createSession();
    this.activeSessionId = initialSession.id;
  }

  get activeSession(): SessionInstance {
    const active = this.sessions.get(this.activeSessionId);
    if (active) return active;
    const first = this.getAllSessions()[0];
    if (first) {
      this.activeSessionId = first.id;
      return first;
    }
    // Fallback: create fresh
    const fresh = this.createSession();
    this.activeSessionId = fresh.id;
    return fresh;
  }

  updateConfig(updates: Partial<MultiSessionPoolConfig>): void {
    Object.assign(this.config, updates);
    for (const session of this.sessions.values()) {
      if (updates.securityMode) session.securityMode = updates.securityMode;
      if (updates.isWorkspaceTrusted !== undefined) session.isWorkspaceTrusted = updates.isWorkspaceTrusted;
      if (updates.thinkingEffort) session.thinkingEffort = updates.thinkingEffort;
      if (updates.activeModel) {
        session.activeModel = updates.activeModel;
        session.contextManager.updateModel(updates.activeModel);
      }
      if (updates.llmClient) session.llmClient = updates.llmClient;
    }
  }

  createSession(name?: string, snapshot?: SessionSnapshot): SessionInstance {
    const displayIndex = this.nextIndex++;
    const contextManager = new ContextManager({
      workingDirectory: this.config.workingDirectory,
      activeModel: this.config.activeModel,
      skillManager: this.config.skillManager,
      compactionConfig: this.config.compactionConfig,
    });

    const instanceConfig: SessionInstanceConfig = {
      id: snapshot?.id,
      name: name || snapshot?.name,
      displayIndex,
      workingDirectory: this.config.workingDirectory,
      securityMode: this.config.securityMode,
      isWorkspaceTrusted: this.config.isWorkspaceTrusted,
      thinkingEffort: this.config.thinkingEffort,
      llmClient: this.config.llmClient,
      activeModel: this.config.activeModel,
      dispatcher: this.config.toolDispatcher,
      contextManager,
      initialMessages: snapshot?.messages,
      createdAt: snapshot?.createdAt,
      updatedAt: snapshot?.updatedAt,
    };

    const instance = new SessionInstance(instanceConfig);
    this.sessions.set(instance.id, instance);
    return instance;
  }

  getAllSessions(): SessionInstance[] {
    return Array.from(this.sessions.values()).sort((a, b) => a.displayIndex - b.displayIndex);
  }

  findSession(identifier: string): SessionInstance | undefined {
    const trimmed = identifier.trim().toLowerCase();
    if (!trimmed) return undefined;

    // Try match by ID
    const byId = this.sessions.get(trimmed);
    if (byId) return byId;

    // Try match by display index: e.g. "1", "#1"
    const indexMatch = trimmed.replace(/^#/, '');
    const num = parseInt(indexMatch, 10);
    if (!isNaN(num)) {
      const byIndex = Array.from(this.sessions.values()).find((s) => s.displayIndex === num);
      if (byIndex) return byIndex;
    }

    // Try match by name
    const byName = Array.from(this.sessions.values()).find(
      (s) => s.name && s.name.toLowerCase() === trimmed
    );
    if (byName) return byName;

    // Try prefix match on ID
    const byPrefix = Array.from(this.sessions.values()).find((s) => s.id.toLowerCase().startsWith(trimmed));
    if (byPrefix) return byPrefix;

    return undefined;
  }

  switchSession(identifier: string): SessionInstance | null {
    const target = this.findSession(identifier);
    if (!target) return null;

    // If target was done, transition to ready on user switch-in
    if (target.status === 'done') {
      target.setStatus('ready');
    }

    this.activeSessionId = target.id;
    return target;
  }

  nextSession(): SessionInstance {
    const all = this.getAllSessions();
    if (all.length <= 1) return this.activeSession;

    const currentIdx = all.findIndex((s) => s.id === this.activeSessionId);
    const nextIdx = (currentIdx + 1) % all.length;
    const target = all[nextIdx];
    if (target.status === 'done') {
      target.setStatus('ready');
    }
    this.activeSessionId = target.id;
    return target;
  }

  prevSession(): SessionInstance {
    const all = this.getAllSessions();
    if (all.length <= 1) return this.activeSession;

    const currentIdx = all.findIndex((s) => s.id === this.activeSessionId);
    const prevIdx = (currentIdx - 1 + all.length) % all.length;
    const target = all[prevIdx];
    if (target.status === 'done') {
      target.setStatus('ready');
    }
    this.activeSessionId = target.id;
    return target;
  }

  closeSession(identifier?: string): { closed: SessionInstance; newActive: SessionInstance } | null {
    const target = identifier ? this.findSession(identifier) : this.activeSession;
    if (!target) return null;

    target.abort();
    // Auto-save snapshot before close
    const usage = target.contextManager.getContextUsage(target.sessionManager.messages);
    target.sessionManager.save(target.workingDirectory, usage.usedTokens, target.name);

    this.sessions.delete(target.id);

    // If no sessions left, create a fresh session
    if (this.sessions.size === 0) {
      const fresh = this.createSession();
      this.activeSessionId = fresh.id;
      return { closed: target, newActive: fresh };
    }

    // If closed session was active, switch to next available
    if (this.activeSessionId === target.id) {
      const remaining = this.getAllSessions();
      this.activeSessionId = remaining[0].id;
      if (remaining[0].status === 'done') {
        remaining[0].setStatus('ready');
      }
    }

    return { closed: target, newActive: this.activeSession };
  }

  renameSession(identifier: string, newName: string): SessionInstance | null {
    const target = this.findSession(identifier) || this.activeSession;
    if (!target) return null;
    target.name = newName.trim() || undefined;
    target.sessionManager.sessionName = target.name;
    const usage = target.contextManager.getContextUsage(target.sessionManager.messages);
    target.sessionManager.save(target.workingDirectory, usage.usedTokens, target.name);
    return target;
  }

  hasRunningSessions(): boolean {
    for (const session of this.sessions.values()) {
      if (session.isRunning) return true;
    }
    return false;
  }

  getRunningSessions(): SessionInstance[] {
    return Array.from(this.sessions.values()).filter((s) => s.isRunning);
  }

  terminateAll(): void {
    for (const session of this.sessions.values()) {
      session.abort();
    }
  }

  // --- Snapshot Storage Integrations ---

  saveActiveSession(name?: string): SessionSnapshot {
    const active = this.activeSession;
    if (name) {
      active.name = name;
      active.sessionManager.sessionName = name;
    }
    const usage = active.contextManager.getContextUsage(active.sessionManager.messages);
    return active.sessionManager.save(active.workingDirectory, usage.usedTokens, active.name);
  }

  resumeSessionFromSnapshot(sessionIdOrName: string): SessionInstance | null {
    const snapshot = loadSessionSnapshot(this.config.workingDirectory, sessionIdOrName);
    if (!snapshot) return null;

    // Check if already open in memory
    const existing = this.sessions.get(snapshot.id);
    if (existing) {
      existing.sessionManager.loadSnapshot(snapshot);
      existing.name = snapshot.name;
      existing.updatedAt = snapshot.updatedAt || Date.now();
      this.activeSessionId = existing.id;
      return existing;
    }

    // Open as new in-memory session
    const session = this.createSession(snapshot.name, snapshot);
    this.activeSessionId = session.id;
    return session;
  }

  listSavedSnapshots(): SessionSnapshot[] {
    return listSessionSnapshots(this.config.workingDirectory);
  }

  deleteSavedSnapshot(sessionIdOrName: string): boolean {
    return deleteSessionSnapshot(this.config.workingDirectory, sessionIdOrName);
  }

  exportSession(sessionIdOrName?: string, targetPath?: string): string {
    let snapshot: SessionSnapshot | null = null;
    if (sessionIdOrName) {
      const inMemory = this.findSession(sessionIdOrName);
      if (inMemory) {
        const usage = inMemory.contextManager.getContextUsage(inMemory.sessionManager.messages);
        snapshot = inMemory.sessionManager.toSnapshot(inMemory.workingDirectory, usage.usedTokens);
      } else {
        snapshot = loadSessionSnapshot(this.config.workingDirectory, sessionIdOrName);
      }
    }
    if (!snapshot) {
      const active = this.activeSession;
      const usage = active.contextManager.getContextUsage(active.sessionManager.messages);
      snapshot = active.sessionManager.toSnapshot(active.workingDirectory, usage.usedTokens);
    }
    return exportSessionToMarkdown(snapshot, targetPath);
  }

  /**
   * Format Line 2 of bottom status bar according to adaptive width & Scenario 3 ultra-wide collapsed aggregation
   */
  getStatusBarSecondLine(maxContentWidth: number): string {
    const all = this.getAllSessions();
    const active = this.activeSession;
    const relPath = formatRelativePath(this.config.workingDirectory);

    // Build standard tags for all sessions
    const sessionTags: string[] = [];
    let runningCount = 0;
    let readyCount = 0;

    for (const s of all) {
      const isActive = s.id === active.id;
      const star = isActive ? '*' : '';
      if (s.isRunning) runningCount++;
      else readyCount++;

      let statusBadge = '';
      if (s.status === 'running') statusBadge = ' (running)';
      else if (s.status === 'waiting_confirm') statusBadge = ' (waiting)';
      else if (s.status === 'error') statusBadge = ' (error)';
      else if (s.status === 'done') statusBadge = ' (done)';
      else if (isActive) statusBadge = ' (ready)';

      const nameLabel = s.name ? `: ${s.name}` : '';
      const tagContent = `#${s.displayIndex}${nameLabel}${statusBadge}${star}`;
      sessionTags.push(`[${tagContent}]`);
    }

    // Try Standard Mode: Full tags + path
    const standardLeft = sessionTags.join(' ');
    const fullStandard = `${standardLeft} | ${relPath}`;
    if (stripAnsi(fullStandard).length <= maxContentWidth && all.length <= 4) {
      return `${sessionTags
        .map((tag, idx) => {
          const s = all[idx];
          if (s.id === active.id) {
            return chalk.cyanBright.bold(tag);
          }
          if (s.isRunning) {
            return chalk.yellowBright(tag);
          }
          return chalk.dim(tag);
        })
        .join(' ')} ${chalk.dim('|')} ${chalk.dim(relPath)}`;
    }

    // Try Compact Mode: `#1 (running) #2* #3`
    const compactTags: string[] = [];
    for (const s of all) {
      const isActive = s.id === active.id;
      const star = isActive ? '*' : '';
      let statusBadge = '';
      if (s.status === 'running') statusBadge = ' (running)';
      else if (s.status === 'waiting_confirm') statusBadge = ' (waiting)';
      else if (s.status === 'error') statusBadge = ' (error)';
      else if (s.status === 'done') statusBadge = ' (done)';
      else if (isActive) statusBadge = ' (ready)';

      const tagContent = `#${s.displayIndex}${statusBadge}${star}`;
      compactTags.push(`[${tagContent}]`);
    }

    const compactLeft = compactTags.join(' ');
    const fullCompact = `${compactLeft} | ${relPath}`;
    if (stripAnsi(fullCompact).length <= maxContentWidth && all.length <= 6) {
      return `${compactTags
        .map((tag, idx) => {
          const s = all[idx];
          if (s.id === active.id) {
            return chalk.cyanBright.bold(tag);
          }
          if (s.isRunning) {
            return chalk.yellowBright(tag);
          }
          return chalk.dim(tag);
        })
        .join(' ')} ${chalk.dim('|')} ${chalk.dim(relPath)}`;
    }

    // Scenario 3: Ultra-Wide Collapsed Aggregation Mode:
    // e.g. `#5* [running] (8 sessions: 2 running, 6 ready) | ~/path`
    const activeName = active.name ? ` (${active.name})` : '';
    const activeStatusBadge = `[${active.status}]`;
    const totalCount = all.length;
    const summaryParts: string[] = [];
    if (runningCount > 0) summaryParts.push(`${runningCount} running`);
    if (readyCount > 0) summaryParts.push(`${readyCount} ready`);
    const summaryStr = `(${totalCount} sessions: ${summaryParts.join(', ')})`;

    const collapsedLeft = `#${active.displayIndex}${activeName}* ${activeStatusBadge} ${summaryStr}`;
    let shortRelPath = relPath;
    const availPathWidth = maxContentWidth - stripAnsi(collapsedLeft).length - 3;
    if (availPathWidth < stripAnsi(shortRelPath).length && availPathWidth > 5) {
      shortRelPath = `...${shortRelPath.slice(-(availPathWidth - 3))}`;
    }

    const coloredActive = chalk.cyanBright.bold(`#${active.displayIndex}${activeName}*`);
    const coloredStatus = active.isRunning
      ? chalk.yellowBright(activeStatusBadge)
      : active.status === 'error'
      ? chalk.red(activeStatusBadge)
      : chalk.green(activeStatusBadge);
    const coloredSummary = chalk.dim(summaryStr);

    return `${coloredActive} ${coloredStatus} ${coloredSummary} ${chalk.dim('|')} ${chalk.dim(shortRelPath)}`;
  }
}
