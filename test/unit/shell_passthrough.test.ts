import { describe, it, expect } from 'vitest';
import child_process from 'child_process';

describe('Shell Passthrough Execution (!<command>)', () => {
  it('should execute simple shell command and return stdout', () => {
    const output = child_process.execSync('echo "hello from shell"', {
      encoding: 'utf-8',
    });
    expect(output.trim()).toBe('hello from shell');
  });

  it('should capture exit code and error for failing command', () => {
    let failed = false;
    try {
      child_process.execSync('exit 1', { encoding: 'utf-8' });
    } catch (err: any) {
      failed = true;
      expect(err.status).toBe(1);
    }
    expect(failed).toBe(true);
  });
});
