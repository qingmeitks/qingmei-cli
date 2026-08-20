import { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';
import { AgentTool, ToolSecurityLevel } from '../tools/types.js';
import { MCPClientInstance } from './client.js';

function inferSecurityLevel(name: string, description?: string): ToolSecurityLevel {
  const text = `${name} ${description || ''}`.toLowerCase();
  if (
    text.includes('exec') ||
    text.includes('command') ||
    text.includes('shell') ||
    text.includes('bash') ||
    text.includes('terminal') ||
    text.includes('destroy') ||
    text.includes('drop')
  ) {
    return 'dangerous';
  }
  if (
    text.includes('write') ||
    text.includes('create') ||
    text.includes('update') ||
    text.includes('delete') ||
    text.includes('remove') ||
    text.includes('edit') ||
    text.includes('modify') ||
    text.includes('insert') ||
    text.includes('post') ||
    text.includes('patch')
  ) {
    return 'mutating';
  }
  return 'safe';
}

export function mcpToolToAgentTool(
  serverName: string,
  mcpTool: MCPTool,
  client: MCPClientInstance
): AgentTool {
  const toolName = `mcp__${serverName}__${mcpTool.name}`;
  const securityLevel = inferSecurityLevel(mcpTool.name, mcpTool.description);

  return {
    name: toolName,
    description: `[MCP: ${serverName}] ${mcpTool.description || mcpTool.name}`,
    parameters: (mcpTool.inputSchema as Record<string, any>) || { type: 'object', properties: {} },
    source: 'mcp',
    securityLevel,
    execute: async (args) => {
      try {
        const response = await client.callTool(mcpTool.name, args);
        const isError = (response as any).isError;

        let outputText = '';
        if (response.content && Array.isArray(response.content)) {
          outputText = response.content
            .map((item: any) => {
              if (item.type === 'text') return item.text;
              if (item.type === 'image') return `[Image: ${item.mimeType}]`;
              if (item.type === 'resource') return `[Resource: ${item.resource?.uri}]`;
              return JSON.stringify(item);
            })
            .join('\n');
        } else {
          outputText = JSON.stringify(response);
        }

        return {
          success: !isError,
          output: outputText.trim() || '(empty response)',
          error: isError ? outputText : undefined,
        };
      } catch (err: any) {
        return {
          success: false,
          output: `MCP Tool call failed: ${err.message}`,
          error: String(err),
        };
      }
    },
  };
}
