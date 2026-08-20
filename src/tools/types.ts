import { ToolDefinition } from '../core/llm/types.js';

export type ToolSecurityLevel = 'safe' | 'mutating' | 'dangerous';

export interface ToolExecutionContext {
  workingDirectory: string;
  securityMode: 'interactive' | 'auto' | 'readonly' | 'chat';
  isWorkspaceTrusted?: boolean;
  confirmAction?: (description: string) => Promise<boolean>;
}


export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  source: 'builtin' | 'mcp' | 'skill';
  securityLevel: ToolSecurityLevel;
  execute: (args: Record<string, any>, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

export function toToolDefinition(tool: AgentTool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
