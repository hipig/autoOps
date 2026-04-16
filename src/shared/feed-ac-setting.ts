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

export type CommentStyle = 'humorous' | 'serious' | 'question' | 'praise' | 'mixed'
export type CategoryMode = 'whitelist' | 'blacklist'

export interface VideoCategoryConfig {
  enabled: boolean
  mode: CategoryMode
  categories: string[]       // 预定义分类
  customKeywords: string[]   // 自定义关键词
  useAI: boolean             // 是否使用AI分析
}

export const PRESET_CATEGORIES = [
  '美食', '旅行', '科技', '游戏', '音乐',
  '舞蹈', '体育', '教育', '搞笑', '生活',
  '时尚', '汽车', '宠物', '影视', '知识'
]

export function getDefaultVideoCategoryConfig(): VideoCategoryConfig {
  return {
    enabled: false,
    mode: 'whitelist',
    categories: [],
    customKeywords: [],
    useAI: false
  }
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
  // 视频类型跳过控制
  skipAdVideo: boolean           // 自动跳过广告视频（默认 true）
  skipLiveVideo: boolean         // 自动跳过直播视频（默认 true）
  skipImageSet: boolean          // 自动跳过图集（默认 false）
  // 视频切换控制
  maxConsecutiveSkips: number    // 连续跳过最大次数（默认 20），超过后暂停任务
  videoSwitchWaitMs: number      // 切换视频后等待时间(ms)（默认 2000）
  // AI评论控制
  commentReferenceCount: number  // AI评论参考热门评论条数（默认 5）
  commentStyle: CommentStyle     // 评论风格（默认 mixed）
  commentMaxLength: number       // 评论最大字数（默认 50）
  // 视频分类筛选
  videoCategories: VideoCategoryConfig
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
    ],
    skipAdVideo: true,
    skipLiveVideo: true,
    skipImageSet: false,
    maxConsecutiveSkips: 20,
    videoSwitchWaitMs: 2000,
    commentReferenceCount: 5,
    commentStyle: 'mixed',
    commentMaxLength: 50,
    videoCategories: getDefaultVideoCategoryConfig()
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
    comboStopOnFirstSuccess: false,
    skipAdVideo: true,
    skipLiveVideo: true,
    skipImageSet: false,
    maxConsecutiveSkips: 20,
    videoSwitchWaitMs: 2000,
    commentReferenceCount: 5,
    commentStyle: 'mixed',
    commentMaxLength: 50,
    videoCategories: getDefaultVideoCategoryConfig()
  }
}

export function generateRuleGroupId(): string {
  return `rg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
