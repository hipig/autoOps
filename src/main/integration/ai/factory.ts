import { AIPlatform } from '../../../shared/ai-setting'
import type { AIService } from './base'
import type { BaseAIService } from './base'
import { ArkService } from './ark'
import { DeepSeekService } from './deepseek'
import { QwenService } from './qwen'
import { OpenAIService } from './openai'

const serviceMap: Record<AIPlatform, new (apiKey: string, model: string, temperature: number) => BaseAIService> = {
  volcengine: ArkService,
  bailian: QwenService,
  openai: OpenAIService,
  deepseek: DeepSeekService
}

export function createAIService(
  platform: AIPlatform,
  config: { apiKey: string; model: string; temperature?: number }
): AIService {
  const ServiceClass = serviceMap[platform]
  if (!ServiceClass) {
    throw new Error(`不支持的AI平台: ${platform}`)
  }
  return new ServiceClass(config.apiKey, config.model, config.temperature || 0.8)
}

export type { AIService, BaseAIService }