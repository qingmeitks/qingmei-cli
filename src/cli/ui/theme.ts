import chalk from 'chalk';
import { SecurityMode, ModelMetadata } from '../../config/types.js';
import { getContextDisplayBadge } from '../../config/loader.js';

export const theme = {
  primary: chalk.cyan,
  secondary: chalk.gray,
  success: chalk.green,
  warning: chalk.yellow,
  danger: chalk.red,
  dim: chalk.dim,
  bold: chalk.bold,
  highlight: chalk.cyanBright,

  badgeMode: (mode: SecurityMode) => {
    switch (mode) {
      case 'auto':
        return chalk.yellow('[auto]');
      case 'readonly':
        return chalk.magenta('[readonly]');
      case 'chat':
        return chalk.blue('[chat]');
      case 'interactive':
      default:
        return chalk.green('[interactive]');
    }
  },

  badgeModel: (modelName: string) => {
    return chalk.cyan(`[${modelName}]`);
  },

  badgeContext: (meta: ModelMetadata) => {
    const badge = getContextDisplayBadge(meta);
    if (!badge) return '';
    return meta.is1MContext ? chalk.yellowBright(`[${badge}]`) : chalk.dim(`[${badge}]`);
  },

  formatPrompt: (mode: SecurityMode, model: ModelMetadata) => {
    const modeStr = theme.badgeMode(mode);
    const modelStr = theme.badgeModel(model.id);
    const contextStr = theme.badgeContext(model);
    const parts = [chalk.bold('qingmei'), modeStr, modelStr];
    if (contextStr) parts.push(contextStr);
    return `${parts.join(' ')} > `;
  },
};

