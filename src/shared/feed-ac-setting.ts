export type RuleField = 'nickName' | 'videoDesc' | 'videoTag'
export type RuleType = 'ai' | 'manual'

export interface FeedAcRule {
  field: RuleField
  keyword: string
}

export interface FeedAcRuleGroups {
  id: string
  type: RuleType
  name: string
  children?: FeedAcRuleGroups[]
  aiPrompt?: string
  relation?: 'and' | 'or'
  rules?: FeedAcRule[]
  commentTexts?: string[]
  commentImagePath?: string
  commentImageType?: 'folder' | 'file'
}

export interface FeedAcSettingsV2 {
  version: 'v2'
  ruleGroups: FeedAcRuleGroups[]
  blockKeywords: string[]
  authorBlockKeywords: string[]
  simulateWatchBeforeComment: boolean
  watchTimeRangeSeconds: [number, number]
  onlyCommentActiveVideo: boolean
  maxCount: number
  aiCommentEnabled: boolean
  aiStyle?: string
}

export function getDefaultFeedAcSettings(): FeedAcSettingsV2 {
  return {
    version: 'v2',
    ruleGroups: [],
    blockKeywords: [],
    authorBlockKeywords: [],
    simulateWatchBeforeComment: false,
    watchTimeRangeSeconds: [5, 15],
    onlyCommentActiveVideo: false,
    maxCount: 10,
    aiCommentEnabled: false
  }
}

export function generateRuleGroupId(): string {
  return `rg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}