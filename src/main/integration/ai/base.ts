export interface AIAnalysisResult {
  shouldWatch: boolean
  reason?: string
}

export interface AICommentResult {
  content: string
}

export interface AIService {
  analyzeVideoType(videoInfo: string, customPrompt: string): Promise<AIAnalysisResult>
  generateComment(videoInfo: string, customPrompt: string): Promise<AICommentResult>
}

export abstract class BaseAIService implements AIService {
  protected apiKey: string
  protected model: string
  protected temperature: number

  constructor(apiKey: string, model: string, temperature: number = 0.8) {
    this.apiKey = apiKey
    this.model = model
    this.temperature = temperature
  }

  protected abstract request(prompt: string, systemPrompt: string): Promise<string | null>

  async analyzeVideoType(videoInfo: string, customPrompt: string): Promise<AIAnalysisResult> {
    const systemPrompt = `你是一个视频筛选助手。根据视频信息判断是否需要对该视频进行评论引流。
规则：${customPrompt}
请返回JSON格式：{"shouldWatch": true/false, "reason": "判断理由"}`

    const userPrompt = `视频信息：${videoInfo}`

    try {
      const result = await this.request(userPrompt, systemPrompt)
      if (!result) return { shouldWatch: false, reason: 'AI请求失败' }

      const parsed = JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, ''))
      return {
        shouldWatch: parsed.shouldWatch === true,
        reason: parsed.reason || ''
      }
    } catch (e) {
      return { shouldWatch: false, reason: `解析失败: ${e}` }
    }
  }

  async generateComment(videoInfo: string, customPrompt: string): Promise<AICommentResult> {
    const systemPrompt = `你是一个抖音网友，喜欢发表有趣、简短、有创意的评论。
要求：
- 评论长度控制在15-50字
- 口语化、通俗易懂
- 可以适当使用emoji
- 语气轻松活泼
- 不要太长，简洁有力
- 直接输出评论内容，不要加引号或其他格式`

    const userPrompt = `视频信息：${videoInfo}
评论要求：${customPrompt}`

    try {
      const result = await this.request(userPrompt, systemPrompt)
      if (!result) return { content: '路过，点个赞吧' }

      return { content: result.trim() }
    } catch (e) {
      return { content: '路过，点个赞吧' }
    }
  }
}