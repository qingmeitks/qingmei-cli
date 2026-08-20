import fs from 'fs';
import path from 'path';
import { AgentTool } from '../types.js';

export const listDirTool: AgentTool = {
  name: 'list_dir',
  description: 'List the contents of a directory. Returns entries with their type (file/directory) and size.',
  source: 'builtin',
  securityLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to list (defaults to current working directory)',
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum depth to traverse (default: 1)',
      },
    },
  },
  execute: async (args, context) => {
    try {
      const targetDir = args.path
        ? path.isAbsolute(args.path)
          ? args.path
          : path.resolve(context.workingDirectory, args.path)
        : context.workingDirectory;

      if (!fs.existsSync(targetDir)) {
        return {
          success: false,
          output: `Error: Directory not found: ${args.path || '.'}`,
          error: 'DIR_NOT_FOUND',
        };
      }

      const stat = fs.statSync(targetDir);
      if (!stat.isDirectory()) {
        return {
          success: false,
          output: `Error: Path is a file, not a directory: ${args.path || '.'}`,
          error: 'NOT_A_DIRECTORY',
        };
      }

      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      const items: string[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env.example') {
          continue; // skip hidden files like .git
        }
        if (entry.isDirectory()) {
          items.push(`[DIR]  ${entry.name}/`);
        } else if (entry.isFile()) {
          try {
            const fileStat = fs.statSync(path.join(targetDir, entry.name));
            items.push(`[FILE] ${entry.name} (${fileStat.size} bytes)`);
          } catch {
            items.push(`[FILE] ${entry.name}`);
          }
        }
      }

      return {
        success: true,
        output: items.length > 0 ? items.join('\n') : '(empty directory)',
        metadata: { count: items.length },
      };
    } catch (err: any) {
      return {
        success: false,
        output: `Error listing directory: ${err.message}`,
        error: String(err),
      };
    }
  },
};
