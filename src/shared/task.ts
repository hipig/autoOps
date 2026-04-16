import type { FeedAcSettingsV3 } from './feed-ac-setting'
import { getDefaultFeedAcSettingsV3 } from './feed-ac-setting'
import type { Platform, TaskType } from './platform'

export interface TaskSchedule {
  enabled: boolean
  cron: string              // cron 表达式
  nextRunAt?: number        // 下次执行时间
  lastRunAt?: number        // 上次执行时间
}

export interface Task {
  id: string
  name: string
  accountId: string
  platform: Platform
  taskType: TaskType
  config: FeedAcSettingsV3
  schedule?: TaskSchedule
  createdAt: number
  updatedAt: number
}

export interface TaskTemplate {
  id: string
  name: string
  platform: Platform
  taskType: TaskType
  config: FeedAcSettingsV3
  createdAt: number
}

export interface ComboTaskConfig extends Omit<FeedAcSettingsV3, 'operations'> {
  operations: Array<{
    type: Exclude<TaskType, 'combo'>
    enabled: boolean
    probability: number
    maxCount?: number
  }>
}

export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function generateTemplateId(): string {
  return `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function getDefaultTask(accountId: string, platform: Platform = 'douyin'): Task {
  return {
    id: generateTaskId(),
    name: '新任务',
    accountId,
    platform,
    taskType: 'comment',
    config: getDefaultFeedAcSettingsV3(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}
