import type { TaskType } from './platform'

export enum TaskOperation {
  COMMENT = 'comment',
  LIKE = 'like',
  COLLECT = 'collect',
  FOLLOW = 'follow',
  WATCH = 'watch'
}

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  comment: '评论',
  like: '点赞',
  collect: '收藏',
  follow: '关注',
  watch: '观看',
  combo: '组合'
}

export const TASK_OPERATION_LABELS: Record<TaskOperation, string> = {
  [TaskOperation.COMMENT]: '评论',
  [TaskOperation.LIKE]: '点赞',
  [TaskOperation.COLLECT]: '收藏',
  [TaskOperation.FOLLOW]: '关注',
  [TaskOperation.WATCH]: '观看'
}

export interface TaskOperationConfig {
  type: TaskOperation
  enabled: boolean
  probability: number
  maxCount?: number
  aiEnabled?: boolean
  commentTexts?: string[]
  aiPrompt?: string
}

export interface ComboTaskConfig {
  operations: TaskOperationConfig[]
  stopOnFirstSuccess?: boolean
}

export function isTaskOperation(value: string): value is TaskOperation {
  return Object.values(TaskOperation).includes(value as TaskOperation)
}

export function getTaskOperationConfig(
  type: TaskOperation,
  overrides?: Partial<TaskOperationConfig>
): TaskOperationConfig {
  return {
    type,
    enabled: true,
    probability: 1.0,
    ...overrides
  }
}
