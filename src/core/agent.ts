import { LLMClient } from './llm/client.js';
import { ChatMessage, ToolCall } from './llm/types.js';
import { ToolDispatcher } from './dispatcher.js';
import { ContextManager, ContextUsage } from './context.js';
import { CompactionResult } from './context/compressor.js';
import { SessionManager } from './session.js';
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
  public session: SessionManager;
  public contextManager: ContextManager;
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
    this.session = config.sessionManager || new SessionManager();

    this.contextManager = new ContextManager({
      workingDirectory: this.workingDirectory,
      activeModel: this.activeModel,
      skillManager: this.skillManager,
      compactionConfig: config.compactionConfig,
    });
  }

  setWorkspaceTrusted(trusted: boolean): void {
    this.isWorkspaceTrusted = trusted;
  }

  setThinkingEffort(effort: ThinkingEffort): void {
    this.thinkingEffort = effort;
  }

  setSecurityMode(mode: SecurityMode): void {
    this.securityMode = mode;
  }

  setModel(modelId: string, provider?: string): void {
    const meta = getModelMetadata(modelId, provider || this.llmClient.config.provider);
    this.activeModel = meta;
    this.contextManager.updateModel(meta);
  }

  setLLMClient(client: LLMClient): void {
    this.llmClient = client;
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
    const usage = this.getContextUsage();
    return this.session.save(this.workingDirectory, usage.usedTokens, name);
  }

  resumeSession(sessionId: string): boolean {
    const snapshot = loadSessionSnapshot(this.workingDirectory, sessionId);
    if (!snapshot) return false;
    this.session.loadSnapshot(snapshot);
    return true;
  }

  listSessions(): SessionSnapshot[] {
    return listSessionSnapshots(this.workingDirectory);
  }

  deleteSession(sessionId: string): boolean {
    return deleteSessionSnapshot(this.workingDirectory, sessionId);
  }

  deleteAllSessions(): number {
    return deleteAllSessionSnapshots(this.workingDirectory);
  }


  exportSession(sessionId?: string, targetPath?: string): string {
    let snapshot: SessionSnapshot | null = null;
    if (sessionId && sessionId !== this.session.sessionId) {
      snapshot = loadSessionSnapshot(this.workingDirectory, sessionId);
    }
    if (!snapshot) {
      const usage = this.getContextUsage();
      snapshot = this.session.toSnapshot(this.workingDirectory, usage.usedTokens);
    }
    return exportSessionToMarkdown(snapshot, targetPath);
  }




  async run(userInput: string, callbacks: AgentCallbacks = {}): Promise<string> {
    // 1. Add User message to session
    this.session.addMessage({
      role: 'user',
      content: userInput,
    });

    let currentStep = 0;
    let finalAssistantReply = '';

    while (currentStep < this.maxSteps) {
      currentStep++;

      // 2. Prepare context with sliding window / system prompt
      const messages = this.contextManager.prepareMessages(this.session.messages);

      // 3. Get tools allowed for current security mode
      const toolDefs = this.dispatcher.registry.getToolDefinitionsForMode(this.securityMode);

      // 4. Stream LLM Response
      let currentContent = '';
      let currentReasoning = '';
      let currentToolCalls: ToolCall[] | undefined;

      const stream = this.llmClient.chatStream(messages, {
        model: this.activeModel.id,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        thinkingEffort: this.thinkingEffort,
      });


      for await (const event of stream) {
        if (event.type === 'reasoning') {
          currentReasoning += event.delta;
          callbacks.onReasoningChunk?.(event.delta);
        } else if (event.type === 'text') {
          currentContent += event.delta;
          callbacks.onTextChunk?.(event.delta);
        } else if (event.type === 'tool_call_start') {
          callbacks.onToolCallStart?.(event.name, event.id);
        } else if (event.type === 'done') {
          currentContent = event.fullContent;
          currentReasoning = event.fullReasoning || '';
          currentToolCalls = event.toolCalls;
        }
      }

      // 5. Record Assistant response in session
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: currentContent || null,
        reasoning_content: currentReasoning || undefined,
        tool_calls: currentToolCalls && currentToolCalls.length > 0 ? currentToolCalls : undefined,
      };
      this.session.addMessage(assistantMsg);

      finalAssistantReply = currentContent;

      // 6. If no tool calls were requested, we are done!
      if (!currentToolCalls || currentToolCalls.length === 0) {
        break;
      }

      // 7. Execute all tool calls
      const executionContext: ToolExecutionContext = {
        workingDirectory: this.workingDirectory,
        securityMode: this.securityMode,
        isWorkspaceTrusted: this.isWorkspaceTrusted,
        confirmAction: callbacks.onConfirm,
      };


      for (const tc of currentToolCalls) {
        const toolName = tc.function.name;
        const toolArgs = tc.function.arguments;

        const dispatchResult = await this.dispatcher.dispatch(
          toolName,
          toolArgs,
          executionContext
        );

        callbacks.onToolCallResult?.(
          toolName,
          dispatchResult.result.output,
          dispatchResult.durationMs,
          dispatchResult.result.success
        );

        // Record tool output in session
        const toolMsg: ChatMessage = {
          role: 'tool',
          name: toolName,
          tool_call_id: tc.id,
          content: dispatchResult.result.output,
        };
        this.session.addMessage(toolMsg);
      }
    }

    // Auto-save active session snapshot to ~/.qingmei/sessions/
    this.saveActiveSession();

    return finalAssistantReply;
  }
}

