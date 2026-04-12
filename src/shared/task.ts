import type { FeedAcSettingsV2 } from './feed-ac-setting'
import { getDefaultFeedAcSettings } from './feed-ac-setting'

export interface Task {
  id: string
  name: string
  accountId: string
  config: FeedAcSettingsV2
  createdAt: number
  updatedAt: number
}

export interface TaskTemplate {
  id: string
  name: string
  config: FeedAcSettingsV2
  createdAt: number
}

export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function generateTemplateId(): string {
  return `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function getDefaultTask(accountId: string): Task {
  return {
    id: generateTaskId(),
    name: '新任务',
    accountId,
    config: getDefaultFeedAcSettings(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}
