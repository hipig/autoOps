import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'
import type { Task, TaskTemplate } from '../../shared/task'
import { generateTaskId, generateTemplateId } from '../../shared/task'

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

  ipcMain.handle('task:create', async (_event, data: { name: string; accountId: string; config?: Task['config'] }) => {
    const tasks = store.get(StorageKey.TASKS) as Task[] || []
    const newTask: Task = {
      id: generateTaskId(),
      name: data.name,
      accountId: data.accountId,
      config: data.config || {
        version: 'v2',
        ruleGroups: [],
        blockKeywords: [],
        authorBlockKeywords: [],
        simulateWatchBeforeComment: false,
        watchTimeRangeSeconds: [5, 15],
        onlyCommentActiveVideo: false,
        maxCount: 10,
        aiCommentEnabled: false
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    tasks.push(newTask)
    store.set(StorageKey.TASKS, tasks)
    return newTask
  })

  ipcMain.handle('task:update', async (_event, id: string, updates: Partial<Task>) => {
    const tasks = store.get(StorageKey.TASKS) as Task[] || []
    const index = tasks.findIndex((t) => t.id === id)
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...updates, updatedAt: Date.now() }
      store.set(StorageKey.TASKS, tasks)
      return tasks[index]
    }
    return null
  })

  ipcMain.handle('task:delete', async (_event, id: string) => {
    const tasks = store.get(StorageKey.TASKS) as Task[] || []
    const filtered = tasks.filter((t) => t.id !== id)
    store.set(StorageKey.TASKS, filtered)
    return { success: true }
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

  ipcMain.handle('task-template:save', async (_event, name: string, config: Task['config']) => {
    const templates = store.get(StorageKey.TASK_TEMPLATES) as TaskTemplate[] || []
    const template: TaskTemplate = {
      id: generateTemplateId(),
      name,
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
