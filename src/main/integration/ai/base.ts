export interface AIAnalysisResult {
  shouldWatch: boolean
  reason?: string
}

export interface AIFilterContext {
  videoDesc: string
  videoTags: string[]
  topComments?: Array<{ content: string; likeCount: number }>
  targetCategories: string[]
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
  systemPrompt?: string
}

export interface AICommentResult {
  content: string
}

export interface AIService {
  analyzeVideoType(videoInfo: string, customPrompt: string): Promise<AIAnalysisResult>
  analyzeVideoCategory(context: AIFilterContext, customPrompt?: string): Promise<AIAnalysisResult>
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

  async analyzeVideoCategory(context: AIFilterContext, customPrompt?: string): Promise<AIAnalysisResult> {
    const defaultPrompt = customPrompt || '判断这个视频是否属于目标分类。请综合考虑视频描述、标签和热门评论的内容。'

    const systemPrompt = `你是一个视频分类筛选助手。根据视频信息判断该视频是否属于目标分类。
${defaultPrompt}
目标分类：${context.targetCategories.join('、')}
请返回JSON格式：{"shouldWatch": true/false, "reason": "判断理由"}`

    let userPrompt = ''
    if (context.videoDesc) userPrompt += `视频描述: ${context.videoDesc}\n`
    if (context.videoTags && context.videoTags.length > 0) {
      userPrompt += `视频标签: ${context.videoTags.join(', ')}\n`
    }

    if (context.topComments && context.topComments.length > 0) {
      userPrompt += `\n热门评论参考:\n`
      context.topComments.forEach((c, i) => {
        userPrompt += `${i + 1}. [${c.likeCount}赞] ${c.content}\n`
      })
    }

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
      humorous: '幽默风趣，善于用轻松的方式表达观点，可以使用俏皮话和网络梗',
      serious: '认真专业，给出建设性的意见或真诚的称赞',
      question: '提问式，对视频内容提出有趣的问题来引导互动',
      praise: '真诚赞美，表达对视频内容的喜爱和认可',
      mixed: '风格多变，可以幽默、提问或赞美，根据视频内容灵活变化'
    }

    const commentAngles = [
      '对视频描述中提到的话题发表看法',
      '针对视频标题或话题标签提一个问题',
      '表达对作者观点的认同或补充',
      '用简短的话表达看完标题的感受',
      '从热门评论中找到共鸣点，发表自己的看法',
      '调侃或吐槽视频标题或话题中的某个点',
      '@朋友式的评论，比如"这不就是我吗"',
      '根据话题标签聊一聊相关的事',
      '对视频标题表达好奇或期待'
    ]
    const randomAngle = commentAngles[Math.floor(Math.random() * commentAngles.length)]

    // 使用自定义系统提示词或默认提示词
    const systemPrompt = options.systemPrompt || `你是一个真实的抖音用户，正在刷视频时随手写评论。

你能看到的信息：视频标题/描述、话题标签、热门评论列表。你看不到视频画面，所以不要描述画面内容。

核心原则：
- 像真人一样说话，不要有AI味
- 大部分评论不要带emoji，偶尔自然地用一个
- 不要用"哈哈哈"开头，少用感叹号，不要用"真的"开头
- 评论长度${maxLength}字以内，很多好评论只有几个字
- 口语化、接地气，可以用网络用语
- 直接输出评论内容，不要加引号或任何格式标记

绝对禁止：
- 不要编造个人经历，比如"我去过""我来过""我也在那""这家店我知道"
- 不要假装和视频内容有直接的个人关系
- 不要说"这是哪里""这家店在哪"之类凑字数的话
- 不要描述视频画面，你看不到画面
- 不要生成模板化、千篇一律的评论

本次评论角度：${randomAngle}

风格：${styleInstructions[style] || styleInstructions.mixed}

多样性要求：
- 每次生成完全不同角度和句式的评论
- 重点参考热门评论的风格和话题方向来找灵感
- 评论要紧扣视频描述和话题标签`

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
      userPrompt += `\n请参考以上热门评论的风格和话题，但不要复制，生成一条新的评论。\n`
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