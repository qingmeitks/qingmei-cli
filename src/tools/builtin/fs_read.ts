import fs from 'fs';
import path from 'path';
import { AgentTool } from '../types.js';

export const readFileTool: AgentTool = {
  name: 'read_file',
  description: 'Read the contents of a file. Supports line range filtering.',
  source: 'builtin',
  securityLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The relative or absolute path of the file to read',
      },
      startLine: {
        type: 'number',
        description: 'Optional starting line number (1-indexed)',
      },
      endLine: {
        type: 'number',
        description: 'Optional ending line number (inclusive)',
      },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    try {
      const filePath = path.isAbsolute(args.path)
        ? args.path
        : path.resolve(context.workingDirectory, args.path);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          output: `Error: File not found: ${args.path}`,
          error: 'FILE_NOT_FOUND',
        };
      }

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        return {
          success: false,
          output: `Error: Path is a directory, not a file: ${args.path}`,
          error: 'IS_DIRECTORY',
        };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      let start = (args.startLine ?? 1) - 1;
      let end = args.endLine ?? lines.length;

      start = Math.max(0, start);
      end = Math.min(lines.length, end);

      const selectedLines = lines.slice(start, end);
      const numberedContent = selectedLines
        .map((line, idx) => `${start + idx + 1}: ${line}`)
        .join('\n');

      return {
        success: true,
        output: numberedContent,
        metadata: { totalLines: lines.length, linesReturned: selectedLines.length },
      };
    } catch (err: any) {
      return {
        success: false,
        output: `Error reading file: ${err.message}`,
        error: String(err),
      };
    }
  },
};
