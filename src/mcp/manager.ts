import fs from 'fs';
import { MCP_CONFIG_PATH, QINGMEI_HOME } from '../config/defaults.js';
import { MCPConfigFile, MCPServerConfig, MCPServerInfo } from './types.js';
import { MCPClientInstance } from './client.js';
import { mcpToolToAgentTool } from './adapter.js';
import { ToolRegistry } from '../tools/registry.js';

export class MCPManager {
  private clients: Map<string, MCPClientInstance> = new Map();

  constructor() {}

  loadConfig(): MCPConfigFile {
    try {
      if (!fs.existsSync(MCP_CONFIG_PATH)) {
        return { mcpServers: {} };
      }
      const content = fs.readFileSync(MCP_CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { mcpServers: {} };
    }
  }

  saveConfig(config: MCPConfigFile): void {
    if (!fs.existsSync(QINGMEI_HOME)) {
      fs.mkdirSync(QINGMEI_HOME, { recursive: true });
    }
    fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  async addServer(name: string, serverConfig: MCPServerConfig): Promise<void> {
    const config = this.loadConfig();
    config.mcpServers[name] = serverConfig;
    this.saveConfig(config);
  }

  async removeServer(name: string): Promise<boolean> {
    const config = this.loadConfig();
    if (!config.mcpServers[name]) {
      return false;
    }
    delete config.mcpServers[name];
    this.saveConfig(config);

    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
    return true;
  }

  async connectAll(registry?: ToolRegistry): Promise<void> {
    const config = this.loadConfig();

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      let client = this.clients.get(name);
      if (!client) {
        client = new MCPClientInstance(name, serverConfig);
        this.clients.set(name, client);
      }

      if (client.status !== 'connected') {
        try {
          await client.connect();
          if (registry) {
            const mcpTools = await client.listTools();
            for (const tool of mcpTools) {
              const agentTool = mcpToolToAgentTool(name, tool, client);
              registry.register(agentTool);
            }
          }
        } catch {
          // Keep instance for status reporting
        }
      }
    }
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }

  async getServerInfos(): Promise<MCPServerInfo[]> {
    const config = this.loadConfig();
    const infos: MCPServerInfo[] = [];

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const client = this.clients.get(name);
      const isStdio = 'command' in serverConfig;

      if (!client) {
        infos.push({
          name,
          status: 'disconnected',
          transportType: isStdio ? 'stdio' : 'sse',
          toolCount: 0,
        });
      } else {
        const pingResult = await client.ping();
        const tools = await client.listTools();
        infos.push({
          name,
          status: client.status,
          transportType: client.isStdio() ? 'stdio' : 'sse',
          toolCount: tools.length,
          latencyMs: pingResult.ok ? pingResult.latencyMs : undefined,
          error: client.error || pingResult.error,
        });
      }
    }

    return infos;
  }

  async testServer(name: string): Promise<{ ok: boolean; latencyMs?: number; tools: string[]; error?: string }> {
    const config = this.loadConfig();
    const serverConfig = config.mcpServers[name];
    if (!serverConfig) {
      return { ok: false, tools: [], error: `Server '${name}' not found in ~/.qingmei/mcp.json` };
    }

    let client = this.clients.get(name);
    let isTemp = false;
    if (!client) {
      client = new MCPClientInstance(name, serverConfig);
      isTemp = true;
    }

    try {
      if (client.status !== 'connected') {
        await client.connect();
      }
      const ping = await client.ping();
      const tools = await client.listTools();
      return {
        ok: true,
        latencyMs: ping.latencyMs,
        tools: tools.map((t) => t.name),
      };
    } catch (err: any) {
      return {
        ok: false,
        tools: [],
        error: err?.message || String(err),
      };
    } finally {
      if (isTemp) {
        await client.disconnect();
      }
    }
  }
}
