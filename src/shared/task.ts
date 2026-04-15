import type { FeedAcSettingsV2 } from './feed-ac-setting'
import { getDefaultFeedAcSettings } from './feed-ac-setting'
import type { Platform, TaskType } from './platform'

export interface Task {
  id: string
  name: string
  accountId: string
  platform: Platform
  taskType: TaskType
  config: FeedAcSettingsV2
  createdAt: number
  updatedAt: number
}

export interface TaskTemplate {
  id: string
  name: string
  platform: Platform
  taskType: TaskType
  config: FeedAcSettingsV2
  createdAt: number
}

export interface ComboTaskConfig extends FeedAcSettingsV2 {
  operations: Array<{
    type: TaskType
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
    config: getDefaultFeedAcSettings(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}
