import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Task, TaskTemplate } from '../../../shared/task'
import type { FeedAcSettingsV2, FeedAcSettingsV3 } from '../../../shared/feed-ac-setting'
import { getDefaultFeedAcSettings } from '../../../shared/feed-ac-setting'
import type { TaskType } from '../../../shared/platform'

interface LogEntry {
  message: string
  timestamp: number
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const templates = ref<TaskTemplate[]>([])
  const currentTaskId = ref<string | null>(null)
  const isRunning = ref(false)
  const taskId = ref<string | null>(null)
  const logs = ref<LogEntry[]>([])

  let unsubscribeProgress: (() => void) | null = null
  let unsubscribeAction: (() => void) | null = null

  async function loadTasks() {
    tasks.value = await window.api.taskCRUD.getAll() as Task[]
  }

  async function loadTemplates() {
    templates.value = await window.api['task-template'].getAll() as TaskTemplate[]
  }

  async function createTask(name: string, accountId: string, taskType: TaskType = 'comment', config?: FeedAcSettingsV2) {
    const task = await window.api.taskCRUD.create({ name, accountId, taskType, config }) as Task
    tasks.value.push(task)
    return task
  }

  async function updateTask(id: string, updates: Partial<Task>) {
    const updated = await window.api.taskCRUD.update(id, updates) as Task | null
    if (updated) {
      const index = tasks.value.findIndex((t) => t.id === id)
      if (index !== -1) {
        tasks.value[index] = updated
      }
    }
    return updated
  }

  async function deleteTask(id: string) {
    await window.api.taskCRUD.delete(id)
    tasks.value = tasks.value.filter((t) => t.id !== id)
  }

  async function duplicateTask(id: string) {
    const newTask = await window.api.taskCRUD.duplicate(id) as Task | null
    if (newTask) {
      tasks.value.push(newTask)
    }
    return newTask
  }

  async function saveAsTemplate(name: string, config: FeedAcSettingsV2) {
    const template = await window.api['task-template'].save(name, config) as TaskTemplate
    templates.value.push(template)
    return template
  }

  async function deleteTemplate(id: string) {
    await window.api['task-template'].delete(id)
    templates.value = templates.value.filter((t) => t.id !== id)
  }

  function setCurrentTask(id: string | null) {
    currentTaskId.value = id
  }

  function getTaskById(id: string): Task | undefined {
    return tasks.value.find((t) => t.id === id)
  }

  function getTasksByAccount(accountId: string): Task[] {
    return tasks.value.filter((t) => t.accountId === accountId)
  }

  async function checkStatus() {
    const status = await window.api.task.status()
    isRunning.value = status.running
  }

  function cleanupListeners() {
    if (unsubscribeProgress) {
      unsubscribeProgress()
      unsubscribeProgress = null
    }
    if (unsubscribeAction) {
      unsubscribeAction()
      unsubscribeAction = null
    }
  }

  async function start(settings: FeedAcSettingsV2 | FeedAcSettingsV3, accountId?: string, taskType?: TaskType) {
    cleanupListeners()
    logs.value = []
    addLog('正在启动任务...')

    console.log('[TaskStore] Calling window.api.task.start with:', { settings, accountId, taskType })

    let result
    try {
      result = await window.api.task.start({ settings, accountId, taskType })
    } catch (error) {
      console.error('[TaskStore] Exception calling task.start:', error)
      addLog(`启动异常: ${error}`)
      return { success: false, error: String(error) }
    }

    console.log('[TaskStore] task.start returned:', result)

    if (result.success) {
      taskId.value = result.taskId || null
      isRunning.value = true
      addLog('任务已启动')

      unsubscribeProgress = window.api.task.onProgress((data: { message: string; timestamp: number }) => {
        console.log('[TaskStore] onProgress:', data)
        addLog(data.message)
      })

      unsubscribeAction = window.api.task.onAction((data: { videoId: string; action: string; success: boolean }) => {
        console.log('[TaskStore] onAction:', data)
        const actionNames: Record<string, string> = {
          comment: '已评论',
          like: '已点赞',
          collect: '已收藏',
          follow: '已关注'
        }
        addLog(`${actionNames[data.action] || data.action}: ${data.success ? '成功' : '失败'}`)
      })
    } else {
      addLog(`启动失败: ${result.error}`)
      console.error('[TaskStore] Task start failed:', result.error)
    }

    return result
  }

  async function stop() {
    cleanupListeners()
    addLog('正在停止任务...')
    const result = await window.api.task.stop()
    if (result.success) {
      isRunning.value = false
      addLog('任务已停止')
    } else {
      addLog(`停止失败: ${result.error}`)
    }
    return result
  }

  function addLog(message: string) {
    logs.value.push({
      message,
      timestamp: Date.now()
    })
    if (logs.value.length > 100) {
      logs.value = logs.value.slice(-50)
    }
  }

  return {
    tasks,
    templates,
    currentTaskId,
    isRunning,
    taskId,
    logs,
    loadTasks,
    loadTemplates,
    createTask,
    updateTask,
    deleteTask,
    duplicateTask,
    saveAsTemplate,
    deleteTemplate,
    setCurrentTask,
    getTaskById,
    getTasksByAccount,
    checkStatus,
    start,
    stop
  }
})
