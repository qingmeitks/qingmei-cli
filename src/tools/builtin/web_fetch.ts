import { AgentTool } from '../types.js';

export const webFetchTool: AgentTool = {
  name: 'fetch_url',
  description: 'Fetch text content from a web URL (HTTP/HTTPS).',
  source: 'builtin',
  securityLevel: 'safe',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
    },
    required: ['url'],
  },
  execute: async (args) => {
    try {
      const response = await fetch(args.url, {
        headers: {
          'User-Agent': 'Qingmei-Agent-CLI/1.0',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          success: false,
          output: `HTTP Error: ${response.status} ${response.statusText}`,
          error: `HTTP_${response.status}`,
        };
      }

      const text = await response.text();
      const maxBytes = 25 * 1024;
      let output = text;
      if (Buffer.byteLength(output, 'utf-8') > maxBytes) {
        output = output.slice(0, maxBytes) + '\n\n[... Web content truncated ...]';
      }

      return {
        success: true,
        output: output.trim(),
      };
    } catch (err: any) {
      return {
        success: false,
        output: `Failed to fetch URL: ${err.message}`,
        error: String(err),
      };
    }
  },
};
