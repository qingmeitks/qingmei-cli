import { z } from 'zod';

export type SecurityMode = 'interactive' | 'auto' | 'readonly' | 'chat';
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';

export interface ModelMetadata {
  id: string;
  name: string;
  provider: string;
  context?: string;
  contextWindow: number;
  is1MContext: boolean;
  hasExplicitContext?: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  isRecommended?: boolean;
}

export interface ModelConfig {
  id: string;
  name?: string;
  provider?: string;
  context?: string;
  contextWindow?: number;
  is1MContext?: boolean;
  hasExplicitContext?: boolean;
  supportsTools?: boolean;
  supportsReasoning?: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  models?: Array<ModelConfig | string>;
}

export interface CompactionConfig {
  enabled: boolean;
  thresholdPercentage: number;
  recentWindowMessages: number;
  maxToolOutputChars: number;
}

export interface QingmeiConfig {
  activeProvider: string;
  activeModel: string;
  securityMode: SecurityMode;
  thinkingEffort?: ThinkingEffort;
  compaction?: CompactionConfig;
  providers: Record<string, ProviderConfig>;
  models?: Array<ModelConfig>;
  trustedWorkspaces?: string[];
}

export const CompactionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  thresholdPercentage: z.number().min(10).max(95).default(60),
  recentWindowMessages: z.number().min(2).max(50).default(10),
  maxToolOutputChars: z.number().min(200).max(20000).default(1500),
});

export const ModelConfigSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  provider: z.string().optional(),
  context: z.string().optional(),
  contextWindow: z.number().optional(),
  is1MContext: z.boolean().optional(),
  hasExplicitContext: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  supportsReasoning: z.boolean().optional(),
});



export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  defaultModel: z.string().optional(),
  models: z.array(z.union([z.string(), ModelConfigSchema])).optional(),
});

export const QingmeiConfigSchema = z.object({
  activeProvider: z.string().default('deepseek'),
  activeModel: z.string().default('deepseek-chat'),
  securityMode: z.enum(['interactive', 'auto', 'readonly', 'chat']).default('interactive'),
  thinkingEffort: z.enum(['off', 'low', 'medium', 'high']).default('medium'),
  compaction: CompactionConfigSchema.default({
    enabled: true,
    thresholdPercentage: 60,
    recentWindowMessages: 10,
    maxToolOutputChars: 1500,
  }),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  models: z.array(ModelConfigSchema).optional(),
  trustedWorkspaces: z.array(z.string()).default([]),
});



