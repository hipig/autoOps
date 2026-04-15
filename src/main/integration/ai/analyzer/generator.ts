import type { AIService } from '../base'
import type {
  VideoAnalysisResult,
  CommentAnalysisResult,
  CommentGenerationInput,
  CommentGenerationResult
} from './types'

export class CommentGenerator {
  private aiService: AIService | null = null
  private videoAnalysis: VideoAnalysisResult | null = null
  private commentAnalysis: CommentAnalysisResult | null = null

  setAIService(service: AIService): void {
    this.aiService = service
  }

  setVideoAnalysis(analysis: VideoAnalysisResult): void {
    this.videoAnalysis = analysis
  }

  setCommentAnalysis(analysis: CommentAnalysisResult): void {
    this.commentAnalysis = analysis
  }

  async generate(input: CommentGenerationInput): Promise<CommentGenerationResult> {
    if (!this.aiService) {
      return this.getDefaultComment(input)
    }

    const style = input.style || 'mixed'
    const maxLength = input.maxLength || 50

    const systemPrompt = this.buildSystemPrompt(style, maxLength)
    const userPrompt = this.buildUserPrompt(input)

    try {
      const result = await (this.aiService as any).request(userPrompt, systemPrompt)

      if (!result) return this.getDefaultComment(input)

      const content = result.trim()

      return {
        content,
        score: this.calculateScore(content, input),
        suggestedEmoji: this.extractEmojis(content),
        avoidWords: this.videoAnalysis?.avoidKeywords || []
      }
    } catch {
      return this.getDefaultComment(input)
    }
  }

  private buildSystemPrompt(style: string, maxLength: number): string {
    const styleInstructions: Record<string, string> = {
      humorous: '你的评论风格幽默风趣，善于用轻松的方式表达观点，喜欢用一些俏皮话和网络梗。',
      serious: '你的评论风格认真专业，会给出建设性的意见或真诚的称赞。',
      question: '你的评论风格是提问式，会对视频内容提出有趣的问题来引导互动。',
      praise: '你的评论风格是真诚赞美，会表达对视频内容的喜爱和认可。',
      mixed: '你的评论风格多变，可以幽默、提问或赞美，根据视频内容灵活变化。'
    }

    return `你是一个抖音网友，喜欢发表有趣、简短、有创意的评论。
要求：
- 评论长度控制在${maxLength}字以内
- 口语化、通俗易懂
- 可以适当使用emoji
- 语气轻松活泼
- 不要太长，简洁有力
- 直接输出评论内容，不要加引号或其他格式
- ${styleInstructions[style] || styleInstructions.mixed}`
  }

  private buildUserPrompt(input: CommentGenerationInput): string {
    let prompt = `视频信息：${input.videoContext}\n\n`

    if (this.videoAnalysis) {
      prompt += `视频分析：
- 分类：${this.videoAnalysis.category}
- 主题：${this.videoAnalysis.topic}
- 目标受众：${this.videoAnalysis.targetAudience}
- 互动级别：${this.videoAnalysis.engagementLevel}
- 建议评论风格：${this.videoAnalysis.recommendedCommentStyles.join(', ')}
- 避免词汇：${this.videoAnalysis.avoidKeywords.join(', ') || '无'}\n\n`
    }

    if (this.commentAnalysis) {
      prompt += `评论分析：
- 热门话题：${this.commentAnalysis.popularTopics.join(', ') || '无'}
- 常用表达：${this.commentAnalysis.trendingExpressions.join(', ') || '无'}
- 受众性格：${this.commentAnalysis.audiencePersonality}
- 建议语气：${this.commentAnalysis.recommendedEngagementTone}
- 可借鉴评论：${this.commentAnalysis.commentExamples.join('; ') || '无'}\n\n`
    }

    if (input.commentExamples?.length) {
      prompt += `参考评论：${input.commentExamples.join('; ')}\n\n`
    }

    if (input.userRequirements) {
      prompt += `用户要求：${input.userRequirements}\n\n`
    }

    prompt += `请根据以上信息，生成一条适合该视频的评论。`

    return prompt
  }

  private getDefaultComment(input: CommentGenerationInput): CommentGenerationResult {
    const defaults = [
      '路过，点个赞吧~',
      '这个视频真不错！',
      '学习了，感谢分享！',
      '涨知识了，厉害！',
      '说得有道理！'
    ]

    const content = defaults[Math.floor(Math.random() * defaults.length)]

    return {
      content,
      score: 0.5,
      suggestedEmoji: ['👍', '❤️'],
      avoidWords: this.videoAnalysis?.avoidKeywords || []
    }
  }

  private calculateScore(content: string, input: CommentGenerationInput): number {
    let score = 0.5

    const maxLength = input.maxLength || 50
    if (content.length <= maxLength && content.length >= 5) {
      score += 0.1
    }

    if (content.includes('?') || content.includes('？')) {
      score += 0.05
    }

    if (/[\u4e00-\u9fa5]/.test(content)) {
      score += 0.1
    }

    const hasEmoji = /[\uD83C-\uD83D\uD83E-\uDBFF]/.test(content)
    if (hasEmoji) {
      score += 0.1
    }

    if (this.videoAnalysis?.avoidKeywords) {
      const hasAvoid = this.videoAnalysis.avoidKeywords.some(kw =>
        content.includes(kw)
      )
      if (hasAvoid) {
        score -= 0.3
      }
    }

    return Math.max(0, Math.min(1, score))
  }

  private extractEmojis(content: string): string[] {
    const emojiRegex = /[\uD83C-\uD83D\uD83E-\uDBFF][\uDC00-\uDFFF]?/g
    const matches = content.match(emojiRegex)
    return matches || []
  }
}

export function generateMultipleComments(
  generator: CommentGenerator,
  input: CommentGenerationInput,
  count: number = 3
): Promise<CommentGenerationResult[]> {
  const promises: Promise<CommentGenerationResult>[] = []
  for (let i = 0; i < count; i++) {
    promises.push(generator.generate(input))
  }
  return Promise.all(promises)
}
