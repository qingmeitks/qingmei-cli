import fs from 'fs';
import yaml from 'yaml';
import { Skill, SkillMetadata } from './types.js';

export function parseSkillContent(content: string, filePath: string, source: 'builtin' | 'global'): Skill | null {
  try {
    const trimmed = content.trim();
    if (!trimmed.startsWith('---')) {
      // Fallback: entire file as instruction with default name
      const basename = filePath.split(/[/\\]/).slice(-2, -1)[0] || 'custom-skill';
      return {
        metadata: {
          name: basename,
          description: 'Custom Skill',
          enabled: true,
        },
        instructions: trimmed,
        source,
        path: filePath,
      };
    }

    const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      return null;
    }

    const frontmatterRaw = match[1];
    const instructions = match[2].trim();

    const parsedYaml = (yaml.parse(frontmatterRaw) || {}) as Partial<SkillMetadata>;

    const metadata: SkillMetadata = {
      name: parsedYaml.name || 'unnamed-skill',
      description: parsedYaml.description || 'No description provided',
      version: parsedYaml.version || '1.0.0',
      author: parsedYaml.author,
      tags: Array.isArray(parsedYaml.tags) ? parsedYaml.tags : [],
      required_tools: Array.isArray(parsedYaml.required_tools) ? parsedYaml.required_tools : [],
      enabled: parsedYaml.enabled ?? true,
    };

    return {
      metadata,
      instructions,
      source,
      path: filePath,
    };
  } catch {
    return null;
  }
}

export function parseSkillFile(filePath: string, source: 'builtin' | 'global'): Skill | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseSkillContent(content, filePath, source);
  } catch {
    return null;
  }
}
