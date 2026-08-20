import chalk from 'chalk';
import { SkillManager } from '../../skills/manager.js';

export function skillList(): void {
  const manager = new SkillManager();
  const skills = manager.getAllSkills();

  console.log(chalk.bold('\nQingmei Agent Skills:'));

  if (skills.length === 0) {
    console.log(chalk.gray('  No skills found.\n'));
    return;
  }

  for (const skill of skills) {
    const isEnabled = manager.isSkillEnabled(skill.metadata.name);
    const statusStr = isEnabled ? chalk.green('[enabled]') : chalk.gray('[disabled]');
    const sourceStr = chalk.dim(`(${skill.source})`);

    console.log(
      `  * ${chalk.bold(skill.metadata.name)} ${sourceStr} ${statusStr} - ${skill.metadata.description}`
    );
    if (skill.metadata.required_tools && skill.metadata.required_tools.length > 0) {
      console.log(chalk.dim(`    Required tools: ${skill.metadata.required_tools.join(', ')}`));
    }
  }
  console.log();
}

export function skillNew(name: string): void {
  const manager = new SkillManager();
  const filePath = manager.createSkillTemplate(name);
  console.log(chalk.green(`\nNew skill template created at:`));
  console.log(chalk.cyan(`  ${filePath}\n`));
  console.log(chalk.dim(`Edit the SKILL.md file to customize the agent's instructions and SOP.\n`));
}

export function skillInfo(name: string): void {
  const manager = new SkillManager();
  const skill = manager.getSkill(name);

  if (!skill) {
    console.log(chalk.yellow(`\nSkill '${name}' not found.\n`));
    return;
  }

  console.log(chalk.bold(`\nSkill: ${skill.metadata.name}`));
  console.log(`Description: ${skill.metadata.description}`);
  console.log(`Source:      ${skill.source}`);
  console.log(`Path:        ${skill.path}`);
  if (skill.metadata.tags && skill.metadata.tags.length > 0) {
    console.log(`Tags:        ${skill.metadata.tags.join(', ')}`);
  }
  console.log(chalk.bold('\nInstructions:'));
  console.log(chalk.dim('---'));
  console.log(skill.instructions);
  console.log(chalk.dim('---\n'));
}
