import { describe, it, expect } from 'vitest';
import { SecurityGuard } from '../../src/core/security.js';
import { readFileTool, writeFileTool, runCommandTool } from '../../src/tools/builtin/index.js';

describe('SecurityGuard & 4-Tier Security Modes', () => {
  const guard = new SecurityGuard();

  it('should block all tools in [chat] mode', async () => {
    const res = await guard.checkPermission(readFileTool, { path: 'a.txt' }, {
      workingDirectory: '.',
      securityMode: 'chat',
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('[chat]');
  });

  it('should permit safe tools but block mutating/dangerous tools in [readonly] mode', async () => {
    const safeRes = await guard.checkPermission(readFileTool, { path: 'a.txt' }, {
      workingDirectory: '.',
      securityMode: 'readonly',
    });
    expect(safeRes.allowed).toBe(true);

    const writeRes = await guard.checkPermission(writeFileTool, { path: 'a.txt', content: 'x' }, {
      workingDirectory: '.',
      securityMode: 'readonly',
    });
    expect(writeRes.allowed).toBe(false);
    expect(writeRes.reason).toContain('[readonly]');
  });

  it('should allow everything in [auto] mode', async () => {
    const cmdRes = await guard.checkPermission(runCommandTool, { command: 'echo hello' }, {
      workingDirectory: '.',
      securityMode: 'auto',
    });
    expect(cmdRes.allowed).toBe(true);
  });

  it('should prompt user in [interactive] mode for mutating/dangerous tools', async () => {
    let promptTriggered = false;
    const confirmCallback = async () => {
      promptTriggered = true;
      return true;
    };

    const res = await guard.checkPermission(runCommandTool, { command: 'echo test' }, {
      workingDirectory: '.',
      securityMode: 'interactive',
      confirmAction: confirmCallback,
    });

    expect(promptTriggered).toBe(true);
    expect(res.allowed).toBe(true);
  });
});
