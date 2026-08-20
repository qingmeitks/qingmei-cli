import { describe, it, expect } from 'vitest';
import { parseSkillContent } from '../../src/skills/parser.js';
import { SkillManager } from '../../src/skills/manager.js';

describe('Skill Parser & Manager', () => {
  it('should parse SKILL.md with YAML frontmatter properly', () => {
    const raw = `---
name: test-skill
description: A test skill description
version: 1.2.0
author: tester
tags: [test, mock]
required_tools: [read_file]
---

# Instructions
Follow these steps carefully.
`;

    const parsed = parseSkillContent(raw, '/dummy/path/SKILL.md', 'global');
    expect(parsed).not.toBeNull();
    expect(parsed!.metadata.name).toBe('test-skill');
    expect(parsed!.metadata.description).toBe('A test skill description');
    expect(parsed!.metadata.version).toBe('1.2.0');
    expect(parsed!.metadata.required_tools).toEqual(['read_file']);
    expect(parsed!.instructions).toContain('Follow these steps carefully.');
  });

  it('should load builtin skills and generate system prompt section', () => {
    const manager = new SkillManager();
    const all = manager.getAllSkills();
    expect(all.length).toBeGreaterThanOrEqual(3);

    const promptSection = manager.buildSystemPromptSection();
    expect(promptSection).toContain('Active Domain Skills');
    expect(promptSection).toContain('code-review');
    expect(promptSection).toContain('git-assistant');

    // Test disable
    manager.disableSkill('code-review');
    expect(manager.isSkillEnabled('code-review')).toBe(false);
    const updatedSection = manager.buildSystemPromptSection();
    expect(updatedSection).not.toContain('## Skill: code-review');
  });
});
