export interface LogEntry {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  message: string
  data?: {
    comments?: Array<{ content: string; likeCount: number }>
    llmAnalysis?: { prompt: string; response: string }
    generatedComment?: string
    [key: string]: unknown
  }
}

export interface VideoRecord {
  videoId: string
  authorName: string
  authorId?: string
  videoDesc: string
  videoTags: string[]
  shareUrl: string
  watchDuration: number
  isLiked: boolean
  isCollected: boolean
  isFollowed: boolean
  isCommented: boolean
  commentText?: string
  skipReason?: string
  timestamp: number
  // AI分析相关
  aiFilterResult?: {
    matched: boolean
    reason: string
    prompt?: string
  }
  aiCommentResult?: {
    comment: string
    topComments?: Array<{ content: string; likeCount: number }>
    prompt?: string
  }
}

export interface TaskHistoryRecord {
  id: string
  taskId: string           // 关联原始任务ID (crudTaskId)
  taskName: string         // 任务名称
  accountId?: string       // 关联账号ID
  platform: string         // 平台标识
  startTime: number
  endTime: number | null
  status: 'running' | 'completed' | 'stopped' | 'error'
  commentCount: number
  likeCount: number
  collectCount: number
  followCount: number
  videoRecords: VideoRecord[]
  settings: Record<string, unknown>
  logs: LogEntry[]
}

export function getDefaultTaskHistory(): TaskHistoryRecord[] {
  return []
}