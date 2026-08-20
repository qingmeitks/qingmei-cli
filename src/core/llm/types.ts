export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning_content?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, any>;
  };
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  thinkingEffort?: 'off' | 'low' | 'medium' | 'high';
}


export type StreamEvent =
  | { type: 'reasoning'; delta: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_call_start'; index: number; id: string; name: string }
  | { type: 'tool_call_delta'; index: number; argumentsDelta: string }
  | { type: 'tool_call_done'; index: number; toolCall: ToolCall }
  | { type: 'done'; fullContent: string; fullReasoning?: string; toolCalls?: ToolCall[] }
  | { type: 'error'; error: Error };

export interface LLMResponse {
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
}
