import { AgentTool, ToolExecutionContext } from '../tools/types.js';
import { SecurityMode } from '../config/types.js';
import { isPathContained } from './security/trust.js';

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
}

export class SecurityGuard {
  private sessionApprovedTools: Set<string> = new Set();

  constructor() {}

  /**
   * Check whether a tool call is permitted under the current mode and workspace trust status
   */
  async checkPermission(
    tool: AgentTool,
    args: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<SecurityCheckResult> {
    const mode = context.securityMode;
    const isTrusted = context.isWorkspaceTrusted !== false;

    // 0. Path Sandboxing Check
    const pathArg = args.path || args.filePath || args.file_path || args.dirPath || args.targetPath;
    if (typeof pathArg === 'string' && context.workingDirectory) {
      if (!isPathContained(pathArg, context.workingDirectory)) {
        if (tool.securityLevel !== 'safe') {
          return {
            allowed: false,
            reason: `Security Alert: Path traversal blocked. Cannot mutate file outside workspace: "${pathArg}".`,
          };
        }
        if (!isTrusted) {
          return {
            allowed: false,
            reason: `Security Alert: Accessing file outside untrusted workspace is blocked: "${pathArg}".`,
          };
        }
      }
    }

    // 1. Untrusted Workspace Restriction: Mutating tools strictly blocked unless trusted
    if (!isTrusted && tool.securityLevel !== 'safe') {
      return {
        allowed: false,
        reason: `Execution blocked: Current workspace is untrusted. Use "/trust" to trust this workspace and enable mutating tools.`,
      };
    }

    // 2. Chat Mode: No tools permitted
    if (mode === 'chat') {
      return {
        allowed: false,
        reason: 'Execution blocked: Agent is currently in [chat] mode with all tools disabled.',
      };
    }

    // 3. ReadOnly Mode: Only 'safe' tools allowed
    if (mode === 'readonly') {
      if (tool.securityLevel !== 'safe') {
        return {
          allowed: false,
          reason: `Execution blocked: Tool '${tool.name}' is a mutating/system tool, not permitted in [readonly] mode.`,
        };
      }
      return { allowed: true };
    }

    // 4. Auto Mode: Everything allowed (in trusted workspace)
    if (mode === 'auto') {
      return { allowed: true };
    }

    // 5. Interactive Mode:
    // Safe tools are allowed automatically
    if (tool.securityLevel === 'safe') {
      return { allowed: true };
    }

    // Check if user already permanently approved this tool for this session
    if (this.sessionApprovedTools.has(tool.name)) {
      return { allowed: true };
    }

    // If confirmation callback is provided, prompt user
    if (context.confirmAction) {
      const desc =
        tool.name === 'run_command'
          ? `Execute shell command: "${args.command}"`
          : `Call mutating tool: ${tool.name} (${JSON.stringify(args)})`;

      const approved = await context.confirmAction(desc);
      if (approved) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'User denied permission to execute this action.',
      };
    }

    return { allowed: true };
  }


  approveForSession(toolName: string): void {
    this.sessionApprovedTools.add(toolName);
  }

  clearSessionApprovals(): void {
    this.sessionApprovedTools.clear();
  }
}
