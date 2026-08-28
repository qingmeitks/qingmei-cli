import { SessionManager } from '../session.js';
import { ChatMessage, ToolCall } from '../llm/types.js';
import { LLMClient } from '../llm/client.js';
import { ToolDispatcher } from '../dispatcher.js';
import { ContextManager } from '../context.js';
import { ModelMetadata, SecurityMode, ThinkingEffort } from '../../config/types.js';
import { ToolExecutionContext } from '../../tools/types.js';
import { SessionStatus, SessionSummary, SessionInstanceCallbacks } from './types.js';

export interface SessionInstanceConfig {
  id?: string;
  name?: string;
  displayIndex: number;
  workingDirectory: string;
  securityMode: SecurityMode;
  isWorkspaceTrusted?: boolean;
  thinkingEffort?: ThinkingEffort;
  llmClient: LLMClient;
  activeModel: ModelMetadata;
  dispatcher: ToolDispatcher;
  contextManager: ContextManager;
  initialMessages?: ChatMessage[];
  createdAt?: number;
  updatedAt?: number;
}

export class SessionInstance {
  public id: string;
  public name?: string;
  public displayIndex: number;
  public status: SessionStatus = 'ready';
  public currentAction?: string;
  public sessionManager: SessionManager;
  public historyLines: string[] = [];
  public draftInput: string = '';
  public workingDirectory: string;
  public securityMode: SecurityMode;
  public isWorkspaceTrusted: boolean = true;
  public thinkingEffort: ThinkingEffort = 'medium';
  public llmClient: LLMClient;
  public activeModel: ModelMetadata;
  public dispatcher: ToolDispatcher;
  public contextManager: ContextManager;
  public createdAt: number;
  public updatedAt: number;
  public maxSteps = 25;

  private runningPromise?: Promise<string>;
  private abortController?: AbortController;

  constructor(config: SessionInstanceConfig) {
    this.displayIndex = config.displayIndex;
    this.name = config.name;
    this.workingDirectory = config.workingDirectory;
    this.securityMode = config.securityMode;
    this.isWorkspaceTrusted = config.isWorkspaceTrusted !== false;
    this.thinkingEffort = config.thinkingEffort || 'medium';
    this.llmClient = config.llmClient;
    this.activeModel = config.activeModel;
    this.dispatcher = config.dispatcher;
    this.contextManager = config.contextManager;

    this.sessionManager = new SessionManager();
    if (config.id) {
      this.sessionManager.sessionId = config.id;
    }
    this.id = this.sessionManager.sessionId;
    if (config.name) {
      this.sessionManager.sessionName = config.name;
    }
    if (config.initialMessages && config.initialMessages.length > 0) {
      this.sessionManager.messages = [...config.initialMessages];
    }
    this.createdAt = config.createdAt || Date.now();
    this.updatedAt = config.updatedAt || Date.now();
  }

  get isRunning(): boolean {
    return this.status === 'running' || this.status === 'waiting_confirm';
  }

  setStatus(status: SessionStatus, actionDetail?: string): void {
    this.status = status;
    this.currentAction = actionDetail;
    this.updatedAt = Date.now();
  }

  getSummary(usedTokens = 0): SessionSummary {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      currentAction: this.currentAction,
      messageCount: this.sessionManager.messages.length,
      usedTokens,
      preview: this.sessionManager.toSnapshot(this.workingDirectory, usedTokens).preview,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
    if (this.isRunning) {
      this.setStatus('error', 'Execution interrupted');
    }
  }

  async run(userInput: string, callbacks: SessionInstanceCallbacks = {}): Promise<string> {
    this.abort(); // Clear any stale controller
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.setStatus('running');
    callbacks.onStatusChange?.('running');

    // 1. Add User message to session
    this.sessionManager.addMessage({
      role: 'user',
      content: userInput,
    });
    this.updatedAt = Date.now();

    const executionPromise = (async () => {
      let currentStep = 0;
      let finalAssistantReply = '';
      let currentContent = '';
      let currentReasoning = '';

      try {
        while (currentStep < this.maxSteps) {
          if (signal.aborted) {
            throw new Error('Task was cancelled');
          }

          currentStep++;

          // 2. Prepare context with sliding window / system prompt
          const messages = this.contextManager.prepareMessages(this.sessionManager.messages);

          // 3. Get tools allowed for current security mode
          const toolDefs = this.dispatcher.registry.getToolDefinitionsForMode(this.securityMode);

          // 4. Stream LLM Response
          currentContent = '';
          currentReasoning = '';
          let currentToolCalls: ToolCall[] | undefined;

          const stream = this.llmClient.chatStream(messages, {
            model: this.activeModel.id,
            tools: toolDefs.length > 0 ? toolDefs : undefined,
            thinkingEffort: this.thinkingEffort,
            signal,
          });

          for await (const event of stream) {
            if (signal.aborted) {
              throw new Error('Task was cancelled');
            }

            if (event.type === 'reasoning') {
              currentReasoning += event.delta;
              callbacks.onReasoningChunk?.(event.delta);
            } else if (event.type === 'text') {
              currentContent += event.delta;
              callbacks.onTextChunk?.(event.delta);
            } else if (event.type === 'tool_call_start') {
              this.currentAction = `calling ${event.name}`;
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
          this.sessionManager.addMessage(assistantMsg);
          this.updatedAt = Date.now();

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
            confirmAction: async (desc: string) => {
              this.setStatus('waiting_confirm', `confirming ${desc}`);
              callbacks.onStatusChange?.('waiting_confirm', desc);
              try {
                const confirmed = callbacks.onConfirm ? await callbacks.onConfirm(desc) : true;
                return confirmed;
              } finally {
                this.setStatus('running', `executing tool`);
                callbacks.onStatusChange?.('running');
              }
            },
          };

          for (const tc of currentToolCalls) {
            if (signal.aborted) {
              throw new Error('Task was cancelled');
            }

            const toolName = tc.function.name;
            const toolArgs = tc.function.arguments;

            this.currentAction = `calling ${toolName}`;
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
            this.sessionManager.addMessage(toolMsg);
            this.updatedAt = Date.now();
          }
        }

        // Auto-save snapshot
        const usage = this.contextManager.getContextUsage(this.sessionManager.messages);
        this.sessionManager.save(this.workingDirectory, usage.usedTokens, this.name);

        this.setStatus('done');
        callbacks.onStatusChange?.('done');
        callbacks.onCompleted?.(finalAssistantReply);

        return finalAssistantReply;
      } catch (err: any) {
        const isCancelled = signal.aborted || err.name === 'AbortError' || err.message?.includes('cancelled') || err.message?.includes('aborted');
        if (isCancelled) {
          const assistantText = currentContent
            ? `${currentContent} [Interrupted]`
            : (currentReasoning ? `[Interrupted during reasoning]` : `[Interrupted by user]`);

          const partialMsg: ChatMessage = {
            role: 'assistant',
            content: assistantText,
            reasoning_content: currentReasoning || undefined,
          };
          this.sessionManager.addMessage(partialMsg);
          this.updatedAt = Date.now();

          this.setStatus('ready', 'cancelled');
          callbacks.onStatusChange?.('ready');
          return currentContent || '';
        }

        this.setStatus('error', err.message || String(err));
        callbacks.onStatusChange?.('error', err.message);
        callbacks.onError?.(err);
        throw err;
      } finally {
        this.abortController = undefined;
      }
    })();

    this.runningPromise = executionPromise;
    return executionPromise;
  }
}
