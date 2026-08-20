import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { MCPServerConfig, MCPServerStatus, StdioMCPServerConfig, SseMCPServerConfig } from './types.js';

export class MCPClientInstance {
  public name: string;
  public config: MCPServerConfig;
  public status: MCPServerStatus = 'disconnected';
  public client: Client | null = null;
  private transport: StdioClientTransport | SSEClientTransport | null = null;
  public error?: string;

  constructor(name: string, config: MCPServerConfig) {
    this.name = name;
    this.config = config;
  }

  isStdio(): boolean {
    return 'command' in this.config;
  }

  async connect(): Promise<void> {
    this.status = 'connecting';
    this.error = undefined;

    try {
      this.client = new Client(
        {
          name: `qingmei-client-${this.name}`,
          version: '1.0.0',
        },
        {
          capabilities: {
            roots: {
              listChanged: true,
            },
            sampling: {},
          },
        }
      );

      if (this.isStdio()) {
        const stdioConfig = this.config as StdioMCPServerConfig;
        
        // Expand environment variables (filtering out undefined values)
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            env[key] = value;
          }
        }
        if (stdioConfig.env) {
          Object.assign(env, stdioConfig.env);
        }

        this.transport = new StdioClientTransport({
          command: stdioConfig.command,
          args: stdioConfig.args || [],
          env,
          stderr: 'inherit',
        });
      } else {
        const sseConfig = this.config as SseMCPServerConfig;
        this.transport = new SSEClientTransport(new URL(sseConfig.url), {
          requestInit: {
            headers: sseConfig.headers,
          },
        });
      }

      await this.client.connect(this.transport);
      this.status = 'connected';
    } catch (err: any) {
      this.status = 'error';
      this.error = err?.message || String(err);
      throw err;
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    if (this.status !== 'connected' || !this.client) {
      return { ok: false, latencyMs: 0, error: 'Not connected' };
    }
    const start = Date.now();
    try {
      await this.client.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err?.message || String(err) };
    }
  }

  async listTools() {
    if (this.status !== 'connected' || !this.client) {
      return [];
    }
    try {
      const res = await this.client.listTools();
      return res.tools || [];
    } catch {
      return [];
    }
  }

  async callTool(name: string, args: Record<string, any>) {
    if (this.status !== 'connected' || !this.client) {
      throw new Error(`MCP server '${this.name}' is not connected.`);
    }
    return await this.client.callTool({
      name,
      arguments: args,
    });
  }

  async listResources() {
    if (this.status !== 'connected' || !this.client) {
      return [];
    }
    try {
      const res = await this.client.listResources();
      return res.resources || [];
    } catch {
      return [];
    }
  }

  async listPrompts() {
    if (this.status !== 'connected' || !this.client) {
      return [];
    }
    try {
      const res = await this.client.listPrompts();
      return res.prompts || [];
    } catch {
      return [];
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
    } catch {
      // ignore
    } finally {
      this.client = null;
      this.transport = null;
      this.status = 'disconnected';
    }
  }
}
