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

export interface FeedAcSettingsV3 {
  version: 'v3'
  taskType: 'comment' | 'like' | 'collect' | 'follow' | 'watch' | 'combo'
  ruleGroups: FeedAcRuleGroups[]
  blockKeywords: string[]
  authorBlockKeywords: string[]
  simulateWatchBeforeComment: boolean
  watchTimeRangeSeconds: [number, number]
  onlyCommentActiveVideo: boolean
  maxCount: number
  aiCommentEnabled: boolean
  aiStyle?: string
  operations: Array<{
    type: 'comment' | 'like' | 'collect' | 'follow' | 'watch'
    enabled: boolean
    probability: number
    maxCount?: number
    aiEnabled?: boolean
    commentTexts?: string[]
    aiPrompt?: string
  }>
  comboStopOnFirstSuccess?: boolean
}

export type FeedAcSettings = FeedAcSettingsV2 | FeedAcSettingsV3

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

export function getDefaultFeedAcSettingsV3(): FeedAcSettingsV3 {
  return {
    version: 'v3',
    taskType: 'comment',
    ruleGroups: [],
    blockKeywords: [],
    authorBlockKeywords: [],
    simulateWatchBeforeComment: false,
    watchTimeRangeSeconds: [5, 15],
    onlyCommentActiveVideo: false,
    maxCount: 10,
    aiCommentEnabled: false,
    operations: [
      {
        type: 'comment',
        enabled: true,
        probability: 1.0,
        commentTexts: [],
        aiEnabled: false
      }
    ]
  }
}

export function migrateToV3(settings: FeedAcSettingsV2): FeedAcSettingsV3 {
  return {
    ...settings,
    version: 'v3',
    taskType: 'comment',
    operations: [
      {
        type: 'comment',
        enabled: true,
        probability: 1.0,
        commentTexts: settings.ruleGroups.flatMap(rg => rg.commentTexts || []),
        aiEnabled: settings.aiCommentEnabled,
        aiPrompt: settings.ruleGroups.find(rg => rg.type === 'ai')?.aiPrompt
      }
    ],
    comboStopOnFirstSuccess: false
  }
}

export function generateRuleGroupId(): string {
  return `rg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}