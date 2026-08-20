export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  required_tools?: string[];
  enabled?: boolean;
}

export interface Skill {
  metadata: SkillMetadata;
  instructions: string;
  source: 'builtin' | 'global';
  path: string;
}
