export interface VideoAnalysisInput {
  title: string
  description: string
  author: {
    name: string
    followers?: number
    verified?: boolean
  }
  tags: string[]
  likeCount?: number
  collectCount?: number
  shareCount?: number
  commentExamples?: string[]
}

export interface VideoAnalysisResult {
  category: string
  topic: string
  targetAudience: string
  engagementLevel: 'high' | 'medium' | 'low'
  commentSentiment: 'positive' | 'neutral' | 'negative'
  recommendedCommentStyles: string[]
  avoidKeywords: string[]
  trendingPhrases?: string[]
  analysisConfidence: number
}

export interface CommentAnalysisInput {
  comments: Array<{
    content: string
    likeCount: number
    sentiment?: 'positive' | 'neutral' | 'negative'
  }>
  videoContext?: string
}

export interface CommentAnalysisResult {
  popularTopics: string[]
  sentimentDistribution: {
    positive: number
    neutral: number
    negative: number
  }
  topCommentStyles: string[]
  trendingExpressions: string[]
  audiencePersonality: string
  recommendedEngagementTone: string
  commentExamples: string[]
}

export interface SentimentAnalysisResult {
  overallSentiment: 'positive' | 'neutral' | 'negative'
  score: number
  keywords: string[]
}

export interface CommentGenerationInput extends VideoAnalysisResult {
  videoContext: string
  userRequirements?: string
  commentExamples?: string[]
  maxLength?: number
  style?: 'humorous' | 'serious' | 'question' | 'praise' | 'mixed'
  includeEmoji?: boolean
}

export interface CommentGenerationResult {
  content: string
  score: number
  suggestedEmoji?: string[]
  avoidWords?: string[]
  reasoning?: string
}
