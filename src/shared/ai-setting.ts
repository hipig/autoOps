export type AIPlatform = 'volcengine' | 'bailian' | 'openai' | 'deepseek'

export interface AISettings {
  platform: AIPlatform
  apiKeys: Record<AIPlatform, string>
  model: string
  temperature: number
}

export function getDefaultAISettings(): AISettings {
  return {
    platform: 'deepseek',
    apiKeys: {
      volcengine: '',
      bailian: '',
      openai: '',
      deepseek: ''
    },
    model: 'deepseek-chat',
    temperature: 0.9
  }
}

export const PLATFORM_MODELS: Record<AIPlatform, string[]> = {
  volcengine: ['doubao-seed-1.6-250615', 'doubao-pro-4k-250519'],
  bailian: ['qwen-plus', 'qwen-max'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner']
}