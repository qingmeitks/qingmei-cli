import fs from 'fs';
import path from 'path';
import { AgentTool } from '../types.js';

export const writeFileTool: AgentTool = {
  name: 'write_file',
  description: 'Create a new file or overwrite an existing file with the provided content.',
  source: 'builtin',
  securityLevel: 'mutating',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The relative or absolute path of the file to write',
      },
      content: {
        type: 'string',
        description: 'The exact content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  execute: async (args, context) => {
    try {
      const filePath = path.isAbsolute(args.path)
        ? args.path
        : path.resolve(context.workingDirectory, args.path);

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, args.content, 'utf-8');

      return {
        success: true,
        output: `File written successfully: ${args.path} (${Buffer.byteLength(args.content, 'utf8')} bytes)`,
        metadata: { path: filePath, bytes: Buffer.byteLength(args.content, 'utf8') },
      };
    } catch (err: any) {
      return {
        success: false,
        output: `Error writing file: ${err.message}`,
        error: String(err),
      };
    }
  },
};
