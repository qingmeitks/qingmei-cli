import { describe, it, expect } from 'vitest';
import { mcpToolToAgentTool } from '../../src/mcp/adapter.js';
import { MCPClientInstance } from '../../src/mcp/client.js';

describe('MCP Adapter & Tool Conversion', () => {
  const dummyClient = new MCPClientInstance('test-server', {
    command: 'echo',
  });

  it('should convert an MCP tool into an AgentTool with namespacing and inferred security level', () => {
    const rawTool = {
      name: 'delete_file',
      description: 'Delete a file from the workspace',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    };

    const agentTool = mcpToolToAgentTool('filesystem', rawTool as any, dummyClient);
    expect(agentTool.name).toBe('mcp__filesystem__delete_file');
    expect(agentTool.source).toBe('mcp');
    expect(agentTool.securityLevel).toBe('mutating');
    expect(agentTool.description).toContain('[MCP: filesystem]');
  });

  it('should infer safe level for query/read MCP tools', () => {
    const rawTool = {
      name: 'search_records',
      description: 'Search read-only database records',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
      },
    };

    const agentTool = mcpToolToAgentTool('db', rawTool as any, dummyClient);
    expect(agentTool.name).toBe('mcp__db__search_records');
    expect(agentTool.securityLevel).toBe('safe');
  });
});
