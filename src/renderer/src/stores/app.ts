import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface AppState {
  initialized: boolean
  browserPath: string | null
  currentAccountId: string | null
  tasks: Record<string, TaskStatus>
}

interface TaskStatus {
  accountId: string
  accountName: string
  status: 'running' | 'stopped' | 'completed' | 'error'
  progress: { current: number; target: number }
}

export const useAppStore = defineStore('app', () => {
  const initialized = ref(false)
  const browserPath = ref<string | null>(null)
  const currentAccountId = ref<string | null>(null)
  const tasks = ref<Record<string, TaskStatus>>({})

  const isRunning = computed(() => {
    return Object.values(tasks.value).some(t => t.status === 'running')
  })

  const runningTaskCount = computed(() => {
    return Object.values(tasks.value).filter(t => t.status === 'running').length
  })

  async function checkInitialized() {
    const path = await window.api['browser-exec'].get()
    browserPath.value = path
    initialized.value = !!path
    return initialized.value
  }

  async function setBrowserPath(path: string) {
    await window.api['browser-exec'].set(path)
    browserPath.value = path
    initialized.value = true
  }

  function setCurrentAccount(accountId: string | null) {
    currentAccountId.value = accountId
  }

  function updateTaskStatus(taskId: string, status: TaskStatus) {
    tasks.value[taskId] = status
  }

  function removeTask(taskId: string) {
    delete tasks.value[taskId]
  }

  return {
    initialized,
    browserPath,
    currentAccountId,
    tasks,
    isRunning,
    runningTaskCount,
    checkInitialized,
    setBrowserPath,
    setCurrentAccount,
    updateTaskStatus,
    removeTask
  }
})
