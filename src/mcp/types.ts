export interface StdioMCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SseMCPServerConfig {
  url: string;
  headers?: Record<string, string>;
}

export type MCPServerConfig = StdioMCPServerConfig | SseMCPServerConfig;

export interface MCPConfigFile {
  $schema?: string;
  mcpServers: Record<string, MCPServerConfig>;
}

export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface MCPServerInfo {
  name: string;
  status: MCPServerStatus;
  transportType: 'stdio' | 'sse';
  toolCount: number;
  latencyMs?: number;
  error?: string;
}
