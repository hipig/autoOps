import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'
import type { Task, TaskTemplate } from '../../shared/task'
import { generateTaskId, generateTemplateId } from '../../shared/task'
import type { Platform, TaskType } from '../../shared/platform'
import { getDefaultFeedAcSettingsV3 } from '../../shared/feed-ac-setting'
import type { TaskHistoryRecord } from '../../shared/task-history'

export function registerTaskIPC(): void {
  ipcMain.handle('task:getAll', async () => {
    const tasks = store.get(StorageKey.TASKS) as Task[] | null
    return tasks || []
  })

  ipcMain.handle('task:getById', async (_event, id: string) => {
    const tasks = store.get(StorageKey.TASKS) as Task[] || []
    return tasks.find((t) => t.id === id) || null
  })

  ipcMain.handle('task:getByAccount', async (_event, accountId: string) => {
    const tasks = store.get(StorageKey.TASKS) as Task[] || []
    return tasks.filter((t) => t.accountId === accountId)
  })

  ipcMain.handle('task:getByPlatform', async (_event, platform: Platform) => {
    const tasks = store.get(StorageKey.TASKS) as Task[] || []
    return tasks.filter((t) => t.platform === platform)
  })

  ipcMain.handle('task:create', async (_event, data: { name: string; accountId: string; platform?: Platform; taskType?: TaskType; config?: Task['config'] }) => {
    try {
      const tasks = store.get(StorageKey.TASKS) as Task[] || []
      const taskType = data.taskType || 'comment'
      const newTask: Task = {
        id: generateTaskId(),
        name: data.name,
        accountId: data.accountId,
        platform: data.platform || 'douyin',
        taskType,
        config: data.config || getDefaultFeedAcSettingsV3(taskType),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      tasks.push(newTask)
      store.set(StorageKey.TASKS, tasks)
      return { success: true, data: newTask }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:update', async (_event, id: string, updates: Partial<Task>) => {
    try {
      const tasks = store.get(StorageKey.TASKS) as Task[] || []
      const index = tasks.findIndex((t) => t.id === id)
      if (index !== -1) {
        tasks[index] = { ...tasks[index], ...updates, updatedAt: Date.now() }
        store.set(StorageKey.TASKS, tasks)
        return { success: true, data: tasks[index] }
      }
      return { success: false, error: '任务不存在' }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:delete', async (_event, id: string) => {
    try {
      const tasks = store.get(StorageKey.TASKS) as Task[] || []
      const index = tasks.findIndex((t) => t.id === id)
      if (index === -1) {
        return { success: false, error: '任务不存在' }
      }
      const filtered = tasks.filter((t) => t.id !== id)
      store.set(StorageKey.TASKS, filtered)

      // 同时删除该任务的所有历史记录
      const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] || []
      const filteredHistory = history.filter((h) => h.taskId !== id)
      store.set(StorageKey.TASK_HISTORY, filteredHistory)

      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:duplicate', async (_event, id: string) => {
    const tasks = store.get(StorageKey.TASKS) as Task[] || []
    const original = tasks.find((t) => t.id === id)
    if (!original) return null

    const newTask: Task = {
      ...original,
      id: generateTaskId(),
      name: `${original.name} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    tasks.push(newTask)
    store.set(StorageKey.TASKS, tasks)
    return newTask
  })

  ipcMain.handle('task-template:getAll', async () => {
    const templates = store.get(StorageKey.TASK_TEMPLATES) as TaskTemplate[] | null
    return templates || []
  })

  ipcMain.handle('task-template:save', async (_event, name: string, config: Task['config'], platform?: Platform, taskType?: TaskType) => {
    const templates = store.get(StorageKey.TASK_TEMPLATES) as TaskTemplate[] || []
    const template: TaskTemplate = {
      id: generateTemplateId(),
      name,
      platform: platform || 'douyin',
      taskType: taskType || 'comment',
      config,
      createdAt: Date.now()
    }
    templates.push(template)
    store.set(StorageKey.TASK_TEMPLATES, templates)
    return template
  })

  ipcMain.handle('task-template:delete', async (_event, id: string) => {
    const templates = store.get(StorageKey.TASK_TEMPLATES) as TaskTemplate[] || []
    const filtered = templates.filter((t) => t.id !== id)
    store.set(StorageKey.TASK_TEMPLATES, filtered)
    return { success: true }
  })
}
