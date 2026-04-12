export interface VideoRecord {
  videoId: string
  authorName: string
  videoDesc: string
  videoTags: string[]
  shareUrl: string
  watchDuration: number
  isCommented: boolean
  commentText?: string
  skipReason?: string
  timestamp: number
}

export interface TaskHistoryRecord {
  id: string
  startTime: number
  endTime: number | null
  status: 'running' | 'completed' | 'stopped' | 'error'
  commentCount: number
  videoRecords: VideoRecord[]
  settings: unknown
}

export function getDefaultTaskHistory(): TaskHistoryRecord[] {
  return []
}