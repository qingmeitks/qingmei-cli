import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { expandMentions } from '../../src/core/context/mention.js';

describe('@mention File Context Expansion', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qingmei-mention-test-'));
    fs.mkdirSync(path.join(tempDir, 'src', 'core'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'core', 'agent.ts'), 'export class QingmeiAgent {}\n// Core Agent Code', 'utf-8');
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{\n  "name": "test-pkg"\n}\n', 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return unmodified prompt when no @mention exists', () => {
    const res = expandMentions('Hello world, please help me', tempDir);
    expect(res.referencedFiles.length).toBe(0);
    expect(res.expandedPrompt).toBe('Hello world, please help me');
  });

  it('should detect and expand valid @filepath into structured XML context', () => {
    const res = expandMentions('Please review @src/core/agent.ts and @package.json', tempDir);
    expect(res.referencedFiles.length).toBe(2);
    expect(res.referencedFiles[0].relativePath).toBe('src/core/agent.ts');
    expect(res.referencedFiles[0].content).toContain('export class QingmeiAgent');
    expect(res.referencedFiles[1].relativePath).toBe('package.json');
    expect(res.referencedFiles[1].content).toContain('"name": "test-pkg"');

    expect(res.expandedPrompt).toContain('<referenced_file path="src/core/agent.ts">');
    expect(res.expandedPrompt).toContain('<referenced_file path="package.json">');
    expect(res.expandedPrompt).toContain('Please review @src/core/agent.ts and @package.json');
  });

  it('should ignore non-existent files in @mention gracefully', () => {
    const res = expandMentions('Look at @non_existent.ts and @src/core/agent.ts', tempDir);
    expect(res.referencedFiles.length).toBe(1);
    expect(res.referencedFiles[0].relativePath).toBe('src/core/agent.ts');
  });

  it('should prevent path traversal outside workspace', () => {
    const res = expandMentions('Read @../../etc/passwd', tempDir);
    expect(res.referencedFiles.length).toBe(0);
  });
});
