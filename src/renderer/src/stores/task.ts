import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Task, TaskTemplate } from '../../../shared/task'
import type { FeedAcSettingsV3 } from '../../../shared/feed-ac-setting'
import type { TaskType } from '../../../shared/platform'

interface LogEntry {
  message: string
  timestamp: number
  taskId?: string
}

interface RunningTaskInfo {
  taskId: string
  taskName?: string
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed'
  platform: string
  accountId?: string
  startedAt: number
  progress?: string
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const templates = ref<TaskTemplate[]>([])
  const currentTaskId = ref<string | null>(null)
  const isRunning = ref(false)
  const taskId = ref<string | null>(null)
  const logs = ref<LogEntry[]>([])
  const runningTasks = ref<RunningTaskInfo[]>([])
  const maxConcurrency = ref(3)

  let unsubscribeProgress: (() => void) | null = null
  let unsubscribeAction: (() => void) | null = null
  let unsubscribePaused: (() => void) | null = null
  let unsubscribeResumed: (() => void) | null = null
  let unsubscribeStarted: (() => void) | null = null
  let unsubscribeStopped: (() => void) | null = null
  let unsubscribeQueued: (() => void) | null = null

  async function loadTasks() {
    tasks.value = await window.api.taskCRUD.getAll() as Task[]
  }

  async function loadTemplates() {
    templates.value = await window.api['task-template'].getAll() as TaskTemplate[]
  }

  async function createTask(name: string, accountId: string, taskType: TaskType = 'comment', config?: FeedAcSettingsV3) {
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

  async function saveAsTemplate(name: string, config: FeedAcSettingsV3) {
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
    if (status.tasks) {
      runningTasks.value = status.tasks as RunningTaskInfo[]
    }
  }

  async function loadRunningTasks() {
    runningTasks.value = await window.api.task.listRunning() as RunningTaskInfo[]
    isRunning.value = runningTasks.value.length > 0
  }

  async function loadConcurrency() {
    const result = await window.api.task.getConcurrency()
    maxConcurrency.value = result.maxConcurrency
  }

  function cleanupListeners() {
    const cleanup = (fn: (() => void) | null) => fn ? fn() : null
    cleanup(unsubscribeProgress)
    cleanup(unsubscribeAction)
    cleanup(unsubscribePaused)
    cleanup(unsubscribeResumed)
    cleanup(unsubscribeStarted)
    cleanup(unsubscribeStopped)
    cleanup(unsubscribeQueued)
    unsubscribeProgress = null
    unsubscribeAction = null
    unsubscribePaused = null
    unsubscribeResumed = null
    unsubscribeStarted = null
    unsubscribeStopped = null
    unsubscribeQueued = null
  }

  async function start(settings: FeedAcSettingsV3, accountId?: string, taskType?: TaskType, taskName?: string) {
    cleanupListeners()
    logs.value = []
    addLog('正在启动任务...')

    let result
    try {
      result = await window.api.task.start({ settings, accountId, taskType, taskName })
    } catch (error) {
      addLog(`启动异常: ${error}`)
      return { success: false, error: String(error) }
    }

    if (result.success) {
      taskId.value = result.taskId || null
      isRunning.value = true
      addLog('任务已启动')

      await loadRunningTasks()
    } else {
      addLog(`启动失败: ${result.error}`)
    }

    // 注册全局事件监听
    unsubscribeProgress = window.api.task.onProgress((data: any) => {
      addLog(data.message, data.taskId)
    })

    unsubscribeAction = window.api.task.onAction((data: any) => {
      const actionNames: Record<string, string> = {
        comment: '已评论',
        like: '已点赞',
        collect: '已收藏',
        follow: '已关注'
      }
      addLog(`${actionNames[data.action] || data.action}: ${data.success ? '成功' : '失败'}`, data.taskId)
    })

    unsubscribePaused = window.api.task.onPaused((data: any) => {
      addLog(`任务已暂停: ${data.taskId}`, data.taskId)
      loadRunningTasks()
    })

    unsubscribeResumed = window.api.task.onResumed((data: any) => {
      addLog(`任务已恢复: ${data.taskId}`, data.taskId)
      loadRunningTasks()
    })

    unsubscribeStarted = window.api.task.onStarted((data: any) => {
      addLog(`任务启动: ${data.taskName || data.taskId}`, data.taskId)
      loadRunningTasks()
    })

    unsubscribeStopped = window.api.task.onStopped((data: any) => {
      addLog(`任务停止: ${data.taskId}`, data.taskId)
      loadRunningTasks()
    })

    unsubscribeQueued = window.api.task.onQueued((data: any) => {
      addLog(`任务已加入队列: ${data.taskName || data.queueId}`)
    })

    return result
  }

  async function stop(taskId?: string) {
    const result = await window.api.task.stop(taskId)
    if (result.success) {
      await loadRunningTasks()
      if (!taskId || runningTasks.value.length === 0) {
        isRunning.value = false
        addLog('所有任务已停止')
      } else {
        addLog(`任务 ${taskId} 已停止`)
      }
    } else {
      addLog(`停止失败: ${result.error}`)
    }
    return result
  }

  async function pauseTask(tid: string) {
    const result = await window.api.task.pause(tid)
    if (result.success) {
      addLog(`任务已暂停`, tid)
      await loadRunningTasks()
    }
    return result
  }

  async function resumeTask(tid: string) {
    const result = await window.api.task.resume(tid)
    if (result.success) {
      addLog(`任务已恢复`, tid)
      await loadRunningTasks()
    }
    return result
  }

  async function scheduleTask(tid: string, cron: string) {
    return await window.api.task.schedule(tid, cron)
  }

  async function cancelSchedule(tid: string) {
    return await window.api.task.cancelSchedule(tid)
  }

  async function setConcurrency(max: number) {
    const result = await window.api.task.setConcurrency(max)
    if (result.success) {
      maxConcurrency.value = max
    }
    return result
  }

  async function stopAll() {
    const result = await window.api.task.stopAll()
    if (result.success) {
      isRunning.value = false
      runningTasks.value = []
      cleanupListeners()
      addLog('所有任务已停止')
    }
    return result
  }

  function addLog(message: string, tid?: string) {
    logs.value.push({
      message,
      timestamp: Date.now(),
      taskId: tid
    })
    if (logs.value.length > 200) {
      logs.value = logs.value.slice(-100)
    }
  }

  function getLogsForTask(tid?: string): LogEntry[] {
    if (!tid) return logs.value
    return logs.value.filter(l => !l.taskId || l.taskId === tid)
  }

  return {
    tasks,
    templates,
    currentTaskId,
    isRunning,
    taskId,
    logs,
    runningTasks,
    maxConcurrency,
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
    loadRunningTasks,
    loadConcurrency,
    start,
    stop,
    pauseTask,
    resumeTask,
    scheduleTask,
    cancelSchedule,
    setConcurrency,
    stopAll,
    addLog,
    getLogsForTask
  }
})
