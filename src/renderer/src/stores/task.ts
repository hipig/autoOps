import { defineStore } from 'pinia'
import { ref } from 'vue'

interface LogEntry {
  message: string
  timestamp: number
}

export const useTaskStore = defineStore('task', () => {
  const isRunning = ref(false)
  const taskId = ref<string | null>(null)
  const logs = ref<LogEntry[]>([])

  async function checkStatus() {
    const status = await window.api.task.status()
    isRunning.value = status.running
  }

  async function start(settings: unknown, accountId?: string) {
    logs.value = []
    addLog('正在启动任务...')

    const result = await window.api.task.start({ settings, accountId })
    if (result.success) {
      taskId.value = result.taskId || null
      isRunning.value = true
      addLog('任务已启动')

      window.api.task.onProgress((data: { message: string; timestamp: number }) => {
        addLog(data.message)
      })

      window.api.task.onCommented((data: { videoId: string; comment: string }) => {
        addLog(`已评论: ${data.comment}`)
      })
    } else {
      addLog(`启动失败: ${result.error}`)
    }

    return result
  }

  async function stop() {
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
    isRunning,
    taskId,
    logs,
    checkStatus,
    start,
    stop
  }
})