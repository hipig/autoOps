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
  /**
   * @deprecated 评论内容应该在 operations 级别定义，此字段仅用于向后兼容旧数据
   */
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
  prioritizeAI: boolean      // 优先使用AI判断（而非关键词）
  aiPrompt?: string          // AI分析提示词
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
    useAI: false,
    prioritizeAI: true,
    aiPrompt: '判断这个视频是否属于目标分类。请综合考虑视频描述、标签和热门评论的内容。'
  }
}

export interface FeedAcSettingsV3 {
  version: 'v3'
  /**
   * @deprecated 此字段已废弃，任务类型由 Task.taskType 唯一确定
   * 保留此字段仅为向后兼容旧数据，新代码请勿使用
   */
  taskType?: 'comment' | 'like' | 'collect' | 'follow' | 'combo'
  ruleGroups: FeedAcRuleGroups[]
  blockKeywords: string[]
  authorBlockKeywords: string[]
  simulateWatchBeforeComment: boolean
  watchTimeRangeSeconds: [number, number]
  watchTimeMode?: 'fixed' | 'percentage'  // 观看时长模式：固定时长或视频百分比
  watchTimePercentageRange?: [number, number]  // 视频时长百分比范围 [0.1, 0.5] 表示 10%-50%
  onlyCommentActiveVideo: boolean
  /**
   * 目标操作数：
   * - 单类型任务（comment/like/collect/follow/watch）：该操作的执行次数
   * - combo 组合任务：总操作次数（按 probability 分配各操作）
   */
  maxCount: number
  aiCommentEnabled: boolean
  aiStyle?: string
  operations: Array<{
    type: 'comment' | 'like' | 'collect' | 'follow'
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
  videoSwitchWaitRange: [number, number]  // 切换视频后等待时间范围(秒)（默认 [5, 10]）
  // AI评论控制
  commentReferenceCount: number  // AI评论参考热门评论条数（默认 5）
  commentStyle: CommentStyle     // 评论风格（默认 mixed）
  commentMaxLength: number       // 评论最大字数（默认 50）
  commentSystemPrompt?: string   // 评论生成系统提示词（可自定义）
  // 长视频处理
  longVideoThreshold: number         // 长视频阈值（秒），超过此时长视为长视频（默认 120）
  longVideoAction: 'skip' | 'speed' | 'normal'  // 长视频处理方式：跳过/倍速/正常（默认 skip）
  longVideoSpeed: number             // 长视频倍速（默认 2.0）
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
    simulateWatchBeforeComment: true,
    watchTimeRangeSeconds: [5, 15],
    onlyCommentActiveVideo: false,
    maxCount: 10,
    aiCommentEnabled: false
  }
}

export function getDefaultFeedAcSettingsV3(taskType?: 'comment' | 'like' | 'collect' | 'follow' | 'combo'): FeedAcSettingsV3 {
  let operations: FeedAcSettingsV3['operations'] = []

  if (taskType === 'combo') {
    // 组合任务：包含所有操作类型
    operations = [
      { type: 'comment', enabled: true, probability: 0.5, commentTexts: [], aiEnabled: false },
      { type: 'like', enabled: true, probability: 0.8, aiEnabled: false },
      { type: 'collect', enabled: false, probability: 0.3, aiEnabled: false },
      { type: 'follow', enabled: false, probability: 0.2, aiEnabled: false }
    ]
  } else {
    // 单一任务类型：只包含对应的操作
    const opType = taskType || 'comment'
    operations = [{
      type: opType as any,
      enabled: true,
      probability: 1.0,
      commentTexts: opType === 'comment' ? [] : undefined,
      aiEnabled: false
    }]
  }

  return {
    version: 'v3',
    ruleGroups: [],
    blockKeywords: [],
    authorBlockKeywords: [],
    simulateWatchBeforeComment: true,
    watchTimeRangeSeconds: [5, 15],
    watchTimeMode: 'fixed',
    watchTimePercentageRange: [0.2, 0.5],
    onlyCommentActiveVideo: false,
    maxCount: 10,
    aiCommentEnabled: false,
    operations,
    skipAdVideo: true,
    skipLiveVideo: true,
    skipImageSet: false,
    maxConsecutiveSkips: 20,
    videoSwitchWaitRange: [5, 10],
    commentReferenceCount: 5,
    commentStyle: 'mixed',
    commentMaxLength: 50,
    longVideoThreshold: 120,
    longVideoAction: 'skip',
    longVideoSpeed: 2.0,
    videoCategories: getDefaultVideoCategoryConfig()
  }
}

export function migrateToV3(settings: FeedAcSettingsV2): FeedAcSettingsV3 {
  // 注意：taskType 由调用方在 Task 层面设置，不再存储在 config 中

  return {
    ...settings,
    version: 'v3',
    // taskType 已移除，由 Task.taskType 作为唯一来源
    watchTimeMode: 'fixed',
    watchTimePercentageRange: [0.2, 0.5],
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
    videoSwitchWaitRange: [5, 10],
    commentReferenceCount: 5,
    commentStyle: 'mixed',
    commentMaxLength: 50,
    longVideoThreshold: 120,
    longVideoAction: 'skip',
    longVideoSpeed: 2.0,
    videoCategories: getDefaultVideoCategoryConfig()
  }
}

export function generateRuleGroupId(): string {
  return `rg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
