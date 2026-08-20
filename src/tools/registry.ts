import { AgentTool, toToolDefinition } from './types.js';
import { BUILTIN_TOOLS } from './builtin/index.js';
import { ToolDefinition } from '../core/llm/types.js';
import { SecurityMode } from '../config/types.js';

export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  constructor(registerBuiltins = true) {
    if (registerBuiltins) {
      this.registerAll(BUILTIN_TOOLS);
    }
  }

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  unregister(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  clearNonBuiltins(): void {
    const builtinNames = new Set(BUILTIN_TOOLS.map((t) => t.name));
    for (const name of this.tools.keys()) {
      if (!builtinNames.has(name)) {
        this.tools.delete(name);
      }
    }
  }

  getTool(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Filter tools according to the current security/run mode
   */
  getToolsForMode(mode: SecurityMode): AgentTool[] {
    if (mode === 'chat') {
      return []; // Pure chat mode: zero tools mounted
    }
    if (mode === 'readonly') {
      return this.getAllTools().filter((t) => t.securityLevel === 'safe');
    }
    return this.getAllTools();
  }

  getToolDefinitionsForMode(mode: SecurityMode): ToolDefinition[] {
    const tools = this.getToolsForMode(mode);
    return tools.map(toToolDefinition);
  }
}
