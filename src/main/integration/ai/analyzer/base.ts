import type { AIService } from '../base'
import type {
  VideoAnalysisInput,
  VideoAnalysisResult,
  CommentAnalysisInput,
  CommentAnalysisResult,
  SentimentAnalysisResult
} from './types'

export abstract class BaseAnalyzer {
  protected aiService: AIService | null = null

  setAIService(service: AIService): void {
    this.aiService = service
  }

  abstract analyzeVideo(input: VideoAnalysisInput): Promise<VideoAnalysisResult>

  abstract analyzeComments(input: CommentAnalysisInput): Promise<CommentAnalysisResult>

  abstract analyzeSentiment(text: string): Promise<SentimentAnalysisResult>
}

export class DefaultAnalyzer extends BaseAnalyzer {
  async analyzeVideo(input: VideoAnalysisInput): Promise<VideoAnalysisResult> {
    if (!this.aiService) {
      return this.getDefaultVideoAnalysis()
    }

    const prompt = this.buildVideoAnalysisPrompt(input)

    try {
      const systemPrompt = `你是一个专业的视频内容分析师。根据视频信息，分析视频的特点并给出评论建议。
请返回JSON格式：
{
  "category": "视频分类",
  "topic": "视频主题",
  "targetAudience": "目标受众",
  "engagementLevel": "high/medium/low",
  "commentSentiment": "positive/neutral/negative",
  "recommendedCommentStyles": ["风格1", "风格2", "风格3"],
  "avoidKeywords": ["避免的词1", "避免的词2"],
  "analysisConfidence": 0.0-1.0之间的置信度
}`

      const result = await (this.aiService as any).request(prompt, systemPrompt)

      if (!result) return this.getDefaultVideoAnalysis()

      const parsed = JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, ''))

      return {
        category: parsed.category || '未知',
        topic: parsed.topic || '未知',
        targetAudience: parsed.targetAudience || '普通用户',
        engagementLevel: parsed.engagementLevel || 'medium',
        commentSentiment: parsed.commentSentiment || 'neutral',
        recommendedCommentStyles: parsed.recommendedCommentStyles || ['通用评论'],
        avoidKeywords: parsed.avoidKeywords || [],
        trendingPhrases: parsed.trendingPhrases || [],
        analysisConfidence: parsed.analysisConfidence || 0.5
      }
    } catch {
      return this.getDefaultVideoAnalysis()
    }
  }

  async analyzeComments(input: CommentAnalysisInput): Promise<CommentAnalysisResult> {
    if (!this.aiService) {
      return this.getDefaultCommentAnalysis()
    }

    const commentsText = input.comments
      .slice(0, 20)
      .map((c, i) => `${i + 1}. [${c.likeCount}赞] ${c.content}`)
      .join('\n')

    const prompt = `视频背景：${input.videoContext || '无'}\n\n评论列表：\n${commentsText}`

    try {
      const systemPrompt = `你是一个评论分析师。分析评论列表，找出评论规律和热门话题。
请返回JSON格式：
{
  "popularTopics": ["热门话题1", "热门话题2"],
  "sentimentDistribution": {
    "positive": 0.0-1.0的概率,
    "neutral": 0.0-1.0的概率,
    "negative": 0.0-1.0的概率
  },
  "topCommentStyles": ["评论风格1", "评论风格2"],
  "trendingExpressions": ["热门表达1", "热门表达2"],
  "audiencePersonality": "受众性格描述",
  "recommendedEngagementTone": "建议互动语气",
  "commentExamples": ["可借鉴的评论1", "可借鉴的评论2"]
}`

      const result = await (this.aiService as any).request(prompt, systemPrompt)

      if (!result) return this.getDefaultCommentAnalysis()

      const parsed = JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, ''))

      return {
        popularTopics: parsed.popularTopics || [],
        sentimentDistribution: parsed.sentimentDistribution || { positive: 0.5, neutral: 0.3, negative: 0.2 },
        topCommentStyles: parsed.topCommentStyles || ['一般评论'],
        trendingExpressions: parsed.trendingExpressions || [],
        audiencePersonality: parsed.audiencePersonality || '普通用户',
        recommendedEngagementTone: parsed.recommendedEngagementTone || '友好',
        commentExamples: parsed.commentExamples || []
      }
    } catch {
      return this.getDefaultCommentAnalysis()
    }
  }

  async analyzeSentiment(text: string): Promise<SentimentAnalysisResult> {
    if (!this.aiService) {
      return { overallSentiment: 'neutral', score: 0.5, keywords: [] }
    }

    const prompt = `文本内容：${text}`

    try {
      const systemPrompt = `你是一个情感分析专家。分析文本的情感倾向。
请返回JSON格式：
{
  "overallSentiment": "positive/neutral/negative",
  "score": 0.0-1.0之间的情感得分(1最积极，0最消极),
  "keywords": ["情感关键词1", "情感关键词2"]
}`

      const result = await (this.aiService as any).request(prompt, systemPrompt)

      if (!result) return { overallSentiment: 'neutral', score: 0.5, keywords: [] }

      const parsed = JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, ''))

      return {
        overallSentiment: parsed.overallSentiment || 'neutral',
        score: parsed.score || 0.5,
        keywords: parsed.keywords || []
      }
    } catch {
      return { overallSentiment: 'neutral', score: 0.5, keywords: [] }
    }
  }

  private buildVideoAnalysisPrompt(input: VideoAnalysisInput): string {
    return `视频信息：
- 标题/描述：${input.title || input.description}
- 作者：${input.author.name}
- 标签：${input.tags.join(', ') || '无'}
- 互动数据：点赞 ${input.likeCount || 0}，收藏 ${input.collectCount || 0}，分享 ${input.shareCount || 0}
${input.commentExamples?.length ? `- 参考评论：${input.commentExamples.join('; ')}` : ''}`
  }

  private getDefaultVideoAnalysis(): VideoAnalysisResult {
    return {
      category: '一般',
      topic: '一般视频',
      targetAudience: '普通用户',
      engagementLevel: 'medium',
      commentSentiment: 'neutral',
      recommendedCommentStyles: ['路过，点个赞吧'],
      avoidKeywords: [],
      analysisConfidence: 0.3
    }
  }

  private getDefaultCommentAnalysis(): CommentAnalysisResult {
    return {
      popularTopics: [],
      sentimentDistribution: { positive: 0.5, neutral: 0.3, negative: 0.2 },
      topCommentStyles: ['一般评论'],
      trendingExpressions: [],
      audiencePersonality: '普通用户',
      recommendedEngagementTone: '友好',
      commentExamples: []
    }
  }
}
