import { BaseAIService } from './base'

export class QwenService extends BaseAIService {
  protected async request(prompt: string, systemPrompt: string): Promise<string | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: this.temperature,
            max_tokens: 500
          }),
          signal: controller.signal
        }
      )

      clearTimeout(timeout)

      if (!response.ok) {
        console.error(`[QwenService] 请求失败: ${response.status}`)
        return null
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || null
    } catch (e) {
      clearTimeout(timeout)
      console.error(`[QwenService] 请求异常: ${e}`)
      return null
    }
  }
}