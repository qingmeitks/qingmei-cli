import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/tools/registry.js';
import { readFileTool, writeFileTool, listDirTool } from '../../src/tools/builtin/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Builtin Tools & ToolRegistry', () => {
  it('should filter tools based on 4-tier security modes', () => {
    const registry = new ToolRegistry(true);

    // Chat mode: 0 tools
    expect(registry.getToolsForMode('chat')).toHaveLength(0);
    expect(registry.getToolDefinitionsForMode('chat')).toHaveLength(0);

    // Readonly mode: only safe tools
    const readOnlyTools = registry.getToolsForMode('readonly');
    expect(readOnlyTools.every((t) => t.securityLevel === 'safe')).toBe(true);
    expect(readOnlyTools.some((t) => t.name === 'read_file')).toBe(true);
    expect(readOnlyTools.some((t) => t.name === 'write_file')).toBe(false);

    // Interactive & Auto mode: all tools
    const allTools = registry.getToolsForMode('interactive');
    expect(allTools.length).toBeGreaterThan(readOnlyTools.length);
    expect(allTools.some((t) => t.name === 'write_file')).toBe(true);
  });

  it('should write and read files correctly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-test-'));
    const testFile = 'hello.txt';

    const writeRes = await writeFileTool.execute(
      { path: testFile, content: 'Line 1\nLine 2\nLine 3' },
      { workingDirectory: tmpDir, securityMode: 'interactive' }
    );
    expect(writeRes.success).toBe(true);

    const readRes = await readFileTool.execute(
      { path: testFile, startLine: 2, endLine: 2 },
      { workingDirectory: tmpDir, securityMode: 'interactive' }
    );
    expect(readRes.success).toBe(true);
    expect(readRes.output).toContain('2: Line 2');

    const listRes = await listDirTool.execute(
      { path: '.' },
      { workingDirectory: tmpDir, securityMode: 'interactive' }
    );
    expect(listRes.success).toBe(true);
    expect(listRes.output).toContain('hello.txt');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
