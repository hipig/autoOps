import Store from 'electron-store'

interface StoreSchema {
  auth: unknown
  feedAcSettings: unknown
  aiSettings: unknown
  browserExecPath: string | null
  taskHistory: unknown
  accounts: unknown
  tasks: unknown
  taskTemplates: unknown
  taskConcurrency: number
  taskSchedules: unknown
}

const store = new Store<StoreSchema>({
  defaults: {
    auth: null,
    feedAcSettings: null,
    aiSettings: null,
    browserExecPath: null,
    taskHistory: [],
    accounts: [],
    tasks: [],
    taskTemplates: [],
    taskConcurrency: 3,
    taskSchedules: []
  }
})

export { store }

export enum StorageKey {
  AUTH = 'auth',
  FEED_AC_SETTINGS = 'feedAcSettings',
  AI_SETTINGS = 'aiSettings',
  BROWSER_EXEC_PATH = 'browserExecPath',
  TASK_HISTORY = 'taskHistory',
  ACCOUNTS = 'accounts',
  TASKS = 'tasks',
  TASK_TEMPLATES = 'taskTemplates',
  TASK_CONCURRENCY = 'taskConcurrency',
  TASK_SCHEDULES = 'taskSchedules'
}

export function get<T>(key: StorageKey): T | undefined {
  return store.get(key) as T | undefined
}

export function set<T>(key: StorageKey, value: T): void {
  store.set(key, value)
}
