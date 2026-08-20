import fs from 'fs';
import path from 'path';
import { SKILLS_DIR } from '../config/defaults.js';
import { Skill } from './types.js';
import { getBuiltinSkills } from './builtin/index.js';
import { parseSkillFile } from './parser.js';

export class SkillLoader {
  constructor() {}

  loadAll(): Skill[] {
    const skills: Skill[] = [...getBuiltinSkills()];
    const seenNames = new Set(skills.map((s) => s.metadata.name));

    if (fs.existsSync(SKILLS_DIR)) {
      const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        let skillFilePath: string | null = null;

        if (entry.isDirectory()) {
          const possible = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
          const possibleLower = path.join(SKILLS_DIR, entry.name, 'skill.md');
          if (fs.existsSync(possible)) {
            skillFilePath = possible;
          } else if (fs.existsSync(possibleLower)) {
            skillFilePath = possibleLower;
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          skillFilePath = path.join(SKILLS_DIR, entry.name);
        }

        if (skillFilePath) {
          const parsed = parseSkillFile(skillFilePath, 'global');
          if (parsed) {
            // Global overrides or adds
            if (seenNames.has(parsed.metadata.name)) {
              const idx = skills.findIndex((s) => s.metadata.name === parsed.metadata.name);
              skills[idx] = parsed;
            } else {
              skills.push(parsed);
              seenNames.add(parsed.metadata.name);
            }
          }
        }
      }
    }

    return skills;
  }
}
