import fs from 'fs';
import path from 'path';
import { SKILLS_DIR } from '../config/defaults.js';
import { Skill } from './types.js';
import { SkillLoader } from './loader.js';

export class SkillManager {
  private loader: SkillLoader;
  private skills: Map<string, Skill> = new Map();
  private enabledSkills: Set<string> = new Set();

  constructor(loader?: SkillLoader) {
    this.loader = loader || new SkillLoader();
    this.reload();
  }

  reload(): void {
    this.skills.clear();
    const loaded = this.loader.loadAll();
    for (const skill of loaded) {
      this.skills.set(skill.metadata.name, skill);
      if (skill.metadata.enabled !== false) {
        this.enabledSkills.add(skill.metadata.name);
      }
    }
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  enableSkill(name: string): boolean {
    if (this.skills.has(name)) {
      this.enabledSkills.add(name);
      return true;
    }
    return false;
  }

  disableSkill(name: string): boolean {
    if (this.skills.has(name)) {
      this.enabledSkills.delete(name);
      return true;
    }
    return false;
  }

  isSkillEnabled(name: string): boolean {
    return this.enabledSkills.has(name);
  }

  getActiveSkills(): Skill[] {
    return Array.from(this.skills.values()).filter((s) => this.enabledSkills.has(s.metadata.name));
  }

  buildSystemPromptSection(): string {
    const active = this.getActiveSkills();
    if (active.length === 0) return '';

    const sections: string[] = ['# Active Domain Skills & Protocols:'];

    for (const skill of active) {
      sections.push(`## Skill: ${skill.metadata.name}`);
      sections.push(`Description: ${skill.metadata.description}`);
      sections.push(skill.instructions);
      sections.push('---');
    }

    return sections.join('\n\n');
  }

  createSkillTemplate(name: string, description?: string): string {
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }

    const skillFolder = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillFolder)) {
      fs.mkdirSync(skillFolder, { recursive: true });
    }

    const skillFilePath = path.join(skillFolder, 'SKILL.md');
    const templateContent = `---
name: ${name}
description: ${description || 'Custom skill description'}
version: 1.0.0
author: user
tags: [${name}]
required_tools: [read_file, run_command]
---

# ${name} Protocol

Describe step-by-step instructions for the Agent when performing this skill:
1. First step...
2. Second step...
`;

    fs.writeFileSync(skillFilePath, templateContent, 'utf-8');
    this.reload();
    return skillFilePath;
  }
}
