import { execa } from 'execa';
import { AgentTool } from '../types.js';

export const runCommandTool: AgentTool = {
  name: 'run_command',
  description: 'Execute a shell command in the current workspace directory. Returns stdout, stderr, and exit code.',
  source: 'builtin',
  securityLevel: 'dangerous',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeoutMs: {
        type: 'number',
        description: 'Command execution timeout in milliseconds (default: 60000)',
      },
    },
    required: ['command'],
  },
  execute: async (args, context) => {
    const timeout = args.timeoutMs || 60000;
    try {
      const subprocess = execa({
        shell: true,
        cwd: context.workingDirectory,
        timeout,
        reject: false,
        all: true,
      })`${args.command}`;

      const result = await subprocess;
      let output = result.all || result.stdout || result.stderr || '(no output)';

      // Output length truncation protection
      const maxOutputBytes = 30 * 1024;
      let truncated = false;
      if (Buffer.byteLength(output, 'utf-8') > maxOutputBytes) {
        output = output.slice(0, maxOutputBytes) + '\n\n[... Output truncated due to size limit ...]';
        truncated = true;
      }

      return {
        success: result.exitCode === 0,
        output: output.trim(),
        error: result.exitCode !== 0 ? `Process exited with code ${result.exitCode}` : undefined,
        metadata: {
          exitCode: result.exitCode,
          truncated,
          durationMs: (result as any).durationMs,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        output: `Command failed: ${err.message}`,
        error: String(err),
      };
    }
  },
};
