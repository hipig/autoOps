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
}

export function getDefaultTaskHistory(): TaskHistoryRecord[] {
  return []
}