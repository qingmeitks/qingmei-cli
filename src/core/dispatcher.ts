import { ToolRegistry } from '../tools/registry.js';
import { ToolExecutionContext, ToolExecutionResult } from '../tools/types.js';
import { SecurityGuard } from './security.js';

export interface DispatchResult {
  toolName: string;
  args: Record<string, any>;
  result: ToolExecutionResult;
  durationMs: number;
}

export class ToolDispatcher {
  public registry: ToolRegistry;
  public security: SecurityGuard;

  constructor(registry?: ToolRegistry, security?: SecurityGuard) {
    this.registry = registry || new ToolRegistry();
    this.security = security || new SecurityGuard();
  }

  async dispatch(
    toolName: string,
    argsJson: string | Record<string, any>,
    context: ToolExecutionContext
  ): Promise<DispatchResult> {
    const startTime = Date.now();

    // 1. Find tool
    const tool = this.registry.getTool(toolName);
    if (!tool) {
      return {
        toolName,
        args: typeof argsJson === 'string' ? {} : argsJson,
        result: {
          success: false,
          output: `Error: Tool '${toolName}' not found. Available tools: ${this.registry
            .getToolsForMode(context.securityMode)
            .map((t) => t.name)
            .join(', ')}`,
          error: 'TOOL_NOT_FOUND',
        },
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Parse arguments
    let args: Record<string, any> = {};
    try {
      args = typeof argsJson === 'string' ? (argsJson ? JSON.parse(argsJson) : {}) : argsJson;
    } catch (err: any) {
      return {
        toolName,
        args: {},
        result: {
          success: false,
          output: `Error: Failed to parse tool arguments as JSON: ${err.message}. Raw: ${argsJson}`,
          error: 'JSON_PARSE_ERROR',
        },
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Check security permission
    const permission = await this.security.checkPermission(tool, args, context);
    if (!permission.allowed) {
      return {
        toolName,
        args,
        result: {
          success: false,
          output: permission.reason || 'Permission denied.',
          error: 'PERMISSION_DENIED',
        },
        durationMs: Date.now() - startTime,
      };
    }

    // 4. Execute tool
    try {
      const result = await tool.execute(args, context);
      return {
        toolName,
        args,
        result,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        toolName,
        args,
        result: {
          success: false,
          output: `Tool execution threw an exception: ${err.message || String(err)}`,
          error: String(err),
        },
        durationMs: Date.now() - startTime,
      };
    }
  }
}
