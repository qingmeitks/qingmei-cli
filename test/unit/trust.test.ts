import { describe, it, expect } from 'vitest';
import path from 'path';
import { isWorkspaceTrusted, isPathContained } from '../../src/core/security/trust.js';
import { SecurityGuard } from '../../src/core/security.js';
import { AgentTool, ToolExecutionContext } from '../../src/tools/types.js';

describe('Workspace Trust & Path Sandboxing', () => {
  const trustedList = ['/Users/test/workspace/my-app', '/Users/test/projects'];

  it('should verify trusted workspace for exact match and subfolders', () => {
    // Exact match
    expect(isWorkspaceTrusted('/Users/test/workspace/my-app', trustedList)).toBe(true);
    // Subfolder match
    expect(isWorkspaceTrusted('/Users/test/workspace/my-app/src/components', trustedList)).toBe(true);
    expect(isWorkspaceTrusted('/Users/test/projects/repo-a', trustedList)).toBe(true);

    // Untrusted folders
    expect(isWorkspaceTrusted('/Users/test/workspace/other-app', trustedList)).toBe(false);
    expect(isWorkspaceTrusted('/Users/test/Downloads/malicious-repo', trustedList)).toBe(false);
    expect(isWorkspaceTrusted('/Users/test', trustedList)).toBe(false);
    expect(isWorkspaceTrusted('', trustedList)).toBe(false);
  });

  it('should validate path containment to prevent path traversal', () => {
    const root = '/Users/test/workspace/my-app';

    // Valid paths within workspace
    expect(isPathContained('src/index.ts', root)).toBe(true);
    expect(isPathContained('./package.json', root)).toBe(true);
    expect(isPathContained('/Users/test/workspace/my-app/README.md', root)).toBe(true);
    expect(isPathContained('/Users/test/workspace/my-app', root)).toBe(true);

    // Invalid paths outside workspace / traversals
    expect(isPathContained('../other-folder/secret.txt', root)).toBe(false);
    expect(isPathContained('../../etc/passwd', root)).toBe(false);
    expect(isPathContained('/etc/shadow', root)).toBe(false);
    expect(isPathContained('/Users/test/.ssh/id_rsa', root)).toBe(false);
  });

  it('should enforce security guard rules in untrusted workspace', async () => {
    const guard = new SecurityGuard();
    const mutatingTool: AgentTool = {
      name: 'write_to_file',
      description: 'Write file',
      parameters: {},
      source: 'builtin',
      securityLevel: 'mutating',
      execute: async () => ({ success: true, output: 'ok' }),
    };

    const safeTool: AgentTool = {
      name: 'read_file',
      description: 'Read file',
      parameters: {},
      source: 'builtin',
      securityLevel: 'safe',
      execute: async () => ({ success: true, output: 'ok' }),
    };

    const untrustedCtx: ToolExecutionContext = {
      workingDirectory: '/Users/test/untrusted-repo',
      securityMode: 'interactive',
      isWorkspaceTrusted: false,
    };

    // Safe read tool is allowed in untrusted workspace
    const safeRes = await guard.checkPermission(safeTool, { path: 'README.md' }, untrustedCtx);
    expect(safeRes.allowed).toBe(true);

    // Mutating tool is strictly blocked in untrusted workspace
    const mutatingRes = await guard.checkPermission(mutatingTool, { path: 'index.ts' }, untrustedCtx);
    expect(mutatingRes.allowed).toBe(false);
    expect(mutatingRes.reason).toContain('untrusted');

    // Mutating tool with path traversal outside workspace is blocked
    const trustedCtx: ToolExecutionContext = {
      workingDirectory: '/Users/test/trusted-repo',
      securityMode: 'auto',
      isWorkspaceTrusted: true,
    };
    const traversalRes = await guard.checkPermission(mutatingTool, { path: '../../etc/hosts' }, trustedCtx);
    expect(traversalRes.allowed).toBe(false);
    expect(traversalRes.reason).toContain('Path traversal');
  });
});
