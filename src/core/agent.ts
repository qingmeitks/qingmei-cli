import { LLMClient } from './llm/client.js';
import { ChatMessage, ToolCall } from './llm/types.js';
import { ToolDispatcher } from './dispatcher.js';
import { ContextManager, ContextUsage } from './context.js';
import { CompactionResult } from './context/compressor.js';
import { SessionManager } from './session.js';
import { MultiSessionPool } from './session/pool.js';
import { SessionInstance } from './session/instance.js';
import {
  SessionSnapshot,
  loadSessionSnapshot,
  listSessionSnapshots,
  deleteSessionSnapshot,
  deleteAllSessionSnapshots,
  exportSessionToMarkdown,
} from './session/storage.js';

import { SkillManager } from '../skills/manager.js';
import { MCPManager } from '../mcp/manager.js';
import { SecurityMode, ModelMetadata, ThinkingEffort, CompactionConfig } from '../config/types.js';
import { ToolExecutionContext } from '../tools/types.js';
import { getModelMetadata } from '../config/loader.js';

export interface AgentCallbacks {
  onReasoningChunk?: (delta: string) => void;
  onTextChunk?: (delta: string) => void;
  onToolCallStart?: (name: string, id: string) => void;
  onToolCallResult?: (name: string, result: string, durationMs: number, success: boolean) => void;
  onConfirm?: (description: string) => Promise<boolean>;
}

export interface AgentConfig {
  workingDirectory: string;
  securityMode: SecurityMode;
  llmClient: LLMClient;
  activeModel: ModelMetadata;
  isWorkspaceTrusted?: boolean;
  thinkingEffort?: ThinkingEffort;
  compactionConfig?: CompactionConfig;
  toolDispatcher?: ToolDispatcher;
  skillManager?: SkillManager;
  mcpManager?: MCPManager;
  sessionManager?: SessionManager;
  pool?: MultiSessionPool;
}

export class QingmeiAgent {
  public workingDirectory: string;
  public securityMode: SecurityMode;
  public isWorkspaceTrusted: boolean = true;
  public thinkingEffort: ThinkingEffort = 'medium';
  public llmClient: LLMClient;
  public activeModel: ModelMetadata;
  public dispatcher: ToolDispatcher;
  public skillManager: SkillManager;
  public mcpManager: MCPManager;
  public pool: MultiSessionPool;
  public maxSteps = 25;

  constructor(config: AgentConfig) {
    this.workingDirectory = config.workingDirectory;
    this.securityMode = config.securityMode;
    this.isWorkspaceTrusted = config.isWorkspaceTrusted !== false;
    this.thinkingEffort = config.thinkingEffort || 'medium';
    this.llmClient = config.llmClient;
    this.activeModel = config.activeModel;
    this.dispatcher = config.toolDispatcher || new ToolDispatcher();
    this.skillManager = config.skillManager || new SkillManager();
    this.mcpManager = config.mcpManager || new MCPManager();

    if (config.pool) {
      this.pool = config.pool;
    } else {
      this.pool = new MultiSessionPool({
        workingDirectory: this.workingDirectory,
        securityMode: this.securityMode,
        isWorkspaceTrusted: this.isWorkspaceTrusted,
        thinkingEffort: this.thinkingEffort,
        compactionConfig: config.compactionConfig,
        llmClient: this.llmClient,
        activeModel: this.activeModel,
        toolDispatcher: this.dispatcher,
        skillManager: this.skillManager,
      });

      if (config.sessionManager) {
        this.pool.activeSession.sessionManager = config.sessionManager;
      }
    }
  }

  get session(): SessionManager {
    return this.pool.activeSession.sessionManager;
  }

  get contextManager(): ContextManager {
    return this.pool.activeSession.contextManager;
  }

  setWorkspaceTrusted(trusted: boolean): void {
    this.isWorkspaceTrusted = trusted;
    this.pool.updateConfig({ isWorkspaceTrusted: trusted });
  }

  setThinkingEffort(effort: ThinkingEffort): void {
    this.thinkingEffort = effort;
    this.pool.updateConfig({ thinkingEffort: effort });
  }

  setSecurityMode(mode: SecurityMode): void {
    this.securityMode = mode;
    this.pool.updateConfig({ securityMode: mode });
  }

  setModel(modelId: string, provider?: string): void {
    const meta = getModelMetadata(modelId, provider || this.llmClient.config.provider);
    this.activeModel = meta;
    this.pool.updateConfig({ activeModel: meta });
  }

  setLLMClient(client: LLMClient): void {
    this.llmClient = client;
    this.pool.updateConfig({ llmClient: client });
  }

  getContextUsage(): ContextUsage {
    return this.contextManager.getContextUsage(this.session.messages);
  }

  compactSession(): CompactionResult {
    const result = this.contextManager.compactHistory(this.session.messages);
    this.session.messages = result.compactedMessages;
    this.saveActiveSession();
    return result;
  }

  saveActiveSession(name?: string): SessionSnapshot {
    return this.pool.saveActiveSession(name);
  }

  resumeSession(sessionId: string): boolean {
    const resumed = this.pool.resumeSessionFromSnapshot(sessionId);
    return Boolean(resumed);
  }

  listSessions(): SessionSnapshot[] {
    return this.pool.listSavedSnapshots();
  }

  deleteSession(sessionId: string): boolean {
    return this.pool.deleteSavedSnapshot(sessionId);
  }

  deleteAllSessions(): number {
    return deleteAllSessionSnapshots(this.workingDirectory);
  }

  exportSession(sessionId?: string, targetPath?: string): string {
    return this.pool.exportSession(sessionId, targetPath);
  }

  async run(userInput: string, callbacks: AgentCallbacks = {}): Promise<string> {
    const active = this.pool.activeSession;
    return active.run(userInput, {
      onReasoningChunk: callbacks.onReasoningChunk,
      onTextChunk: callbacks.onTextChunk,
      onToolCallStart: callbacks.onToolCallStart,
      onToolCallResult: callbacks.onToolCallResult,
      onConfirm: callbacks.onConfirm,
    });
  }
}
