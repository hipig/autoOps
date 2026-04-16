export interface AIAnalysisResult {
  shouldWatch: boolean
  reason?: string
}

export interface AICommentContext {
  author: string
  videoDesc: string
  videoTags: string[]
  topComments?: Array<{ content: string; likeCount: number }>
}

export interface AICommentOptions {
  style?: 'humorous' | 'serious' | 'question' | 'praise' | 'mixed'
  maxLength?: number
  customPrompt?: string
}

export interface AICommentResult {
  content: string
}

export interface AIService {
  analyzeVideoType(videoInfo: string, customPrompt: string): Promise<AIAnalysisResult>
  generateComment(context: AICommentContext | string, optionsOrPrompt: AICommentOptions | string): Promise<AICommentResult>
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

  async generateComment(context: AICommentContext | string, optionsOrPrompt: AICommentOptions | string): Promise<AICommentResult> {
    // 兼容旧版调用方式：直接传字符串
    const ctx: AICommentContext = typeof context === 'string'
      ? { author: '', videoDesc: context, videoTags: [] }
      : context

    const options: AICommentOptions = typeof optionsOrPrompt === 'string'
      ? { customPrompt: optionsOrPrompt }
      : optionsOrPrompt

    const style = options.style || 'mixed'
    const maxLength = options.maxLength || 50

    const styleInstructions: Record<string, string> = {
      humorous: '你的评论风格幽默风趣，善于用轻松的方式表达观点，喜欢用一些俏皮话和网络梗。',
      serious: '你的评论风格认真专业，会给出建设性的意见或真诚的称赞。',
      question: '你的评论风格是提问式，会对视频内容提出有趣的问题来引导互动。',
      praise: '你的评论风格是真诚赞美，会表达对视频内容的喜爱和认可。',
      mixed: '你的评论风格多变，可以幽默、提问或赞美，根据视频内容灵活变化。'
    }

    const systemPrompt = `你是一个抖音网友，喜欢发表有趣、简短、有创意的评论。
要求：
- 评论长度控制在15-${maxLength}字
- 口语化、通俗易懂
- 可以适当使用emoji
- 语气轻松活泼
- 不要太长，简洁有力
- 直接输出评论内容，不要加引号或其他格式
- ${styleInstructions[style] || styleInstructions.mixed}
- 参考该视频的热门评论风格和话题，生成符合当前评论区氛围的评论
- 不要简单复制热门评论，要融入自己的理解
- 每次生成不同风格和角度的评论，避免重复`

    let userPrompt = ''

    // 构建视频信息部分
    if (ctx.author) userPrompt += `视频作者: @${ctx.author}\n`
    if (ctx.videoDesc) userPrompt += `视频描述: ${ctx.videoDesc}\n`
    if (ctx.videoTags && ctx.videoTags.length > 0) userPrompt += `视频标签: ${ctx.videoTags.join(', ')}\n`

    // 构建热门评论参考部分
    if (ctx.topComments && ctx.topComments.length > 0) {
      userPrompt += `\n热门评论参考:\n`
      ctx.topComments.forEach((c, i) => {
        userPrompt += `${i + 1}. [${c.likeCount}赞] ${c.content}\n`
      })
      userPrompt += `\n请参考以上热门评论的风格和话题，但不要求复制，生成一条新的评论。\n`
    }

    if (options.customPrompt) {
      userPrompt += `\n评论要求: ${options.customPrompt}`
    }

    try {
      const result = await this.request(userPrompt, systemPrompt)
      if (!result) return { content: '路过，点个赞吧' }

      // 截断超长评论
      let content = result.trim()
      if (content.length > maxLength) {
        content = content.substring(0, maxLength)
      }

      return { content }
    } catch (e) {
      return { content: '路过，点个赞吧' }
    }
  }
}