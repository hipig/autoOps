import { contextBridge, ipcRenderer } from 'electron'

export interface TaskStatusInfo {
  taskId: string
  taskName?: string
  crudTaskId?: string
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed'
  platform: string
  accountId?: string
  startedAt: number
  progress?: string
}

export interface ElectronAPI {
  auth: {
    hasAuth: () => Promise<boolean>
    login: (authData: unknown) => Promise<{ success: boolean }>
    logout: () => Promise<{ success: boolean }>
    getAuth: () => Promise<unknown>
  }
  task: {
    start: (config: { settings: unknown; accountId?: string; taskType?: string; taskName?: string; crudTaskId?: string }) => Promise<{ success: boolean; taskId?: string; error?: string }>
    stop: (taskId?: string) => Promise<{ success: boolean; error?: string }>
    pause: (taskId: string) => Promise<{ success: boolean; error?: string }>
    resume: (taskId: string) => Promise<{ success: boolean; error?: string }>
    status: (taskId?: string) => Promise<{ running: boolean; tasks?: TaskStatusInfo[] }>
    listRunning: () => Promise<TaskStatusInfo[]>
    getStatus: (taskId: string) => Promise<TaskStatusInfo | null>
    queueSize: () => Promise<{ size: number }>
    removeFromQueue: (queueId: string) => Promise<{ success: boolean }>
    schedule: (taskId: string, cron: string) => Promise<{ success: boolean; error?: string }>
    cancelSchedule: (taskId: string) => Promise<{ success: boolean }>
    getSchedules: () => Promise<Array<{ taskId: string; cron: string; enabled: boolean; nextRunAt?: number; lastRunAt?: number }>>
    setConcurrency: (max: number) => Promise<{ success: boolean }>
    getConcurrency: () => Promise<{ maxConcurrency: number }>
    stopAll: () => Promise<{ success: boolean; error?: string }>
    onProgress: (callback: (data: { message: string; timestamp: number; taskId?: string }) => void) => () => void
    onAction: (callback: (data: { videoId: string; action: string; success: boolean; taskId?: string }) => void) => () => void
    onPaused: (callback: (data: { taskId: string; timestamp: number }) => void) => () => void
    onResumed: (callback: (data: { taskId: string; timestamp: number }) => void) => () => void
    onStarted: (callback: (data: { taskId: string; taskName?: string }) => void) => () => void
    onStopped: (callback: (data: { taskId: string; status: string }) => void) => () => void
    onQueued: (callback: (data: { queueId: string; taskName?: string }) => void) => () => void
    onScheduleTriggered: (callback: (data: { taskId: string; cron: string }) => void) => () => void
  }
  'feed-ac-settings': {
    get: () => Promise<unknown>
    update: (settings: unknown) => Promise<unknown>
    reset: () => Promise<unknown>
    export: () => Promise<unknown>
    import: (settings: unknown) => Promise<{ success: boolean }>
  }
  'ai-settings': {
    get: () => Promise<unknown>
    update: (settings: unknown) => Promise<unknown>
    reset: () => Promise<unknown>
    test: (config: unknown) => Promise<{ success: boolean; message: string }>
  }
  'browser-exec': {
    get: () => Promise<string | null>
    set: (path: string) => Promise<{ success: boolean }>
  }
  browser: {
    detect: () => Promise<{ path: string; name: string; version: string }[]>
  }
  account: {
    list: () => Promise<unknown[]>
    add: (account: unknown) => Promise<unknown>
    update: (id: string, updates: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ success: boolean }>
    setDefault: (id: string) => Promise<{ success: boolean }>
    getDefault: () => Promise<unknown | null>
    getById: (id: string) => Promise<unknown | null>
    getByPlatform: (platform: string) => Promise<unknown[]>
    getActiveAccounts: () => Promise<unknown[]>
    checkStatus: (id: string) => Promise<{ status: string; expiresAt?: number }>
  }
  login: {
    douyin: () => Promise<{ success: boolean; storageState?: string; error?: string; userInfo?: { nickname: string; avatar?: string; uniqueId?: string } }>
  }
  'file-picker': {
    selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<{
      canceled: boolean
      filePath: string | null
      fileName?: string
    }>
    selectDirectory: () => Promise<{
      canceled: boolean
      dirPath: string | null
      dirName?: string
    }>
  }
  'task-history': {
    getAll: () => Promise<unknown[]>
    getById: (id: string) => Promise<unknown | null>
    add: (record: unknown) => Promise<{ success: boolean }>
    update: (id: string, updates: unknown) => Promise<{ success: boolean }>
    delete: (id: string) => Promise<{ success: boolean }>
    clear: () => Promise<{ success: boolean }>
  }
  'task-detail': {
    get: (id: string) => Promise<unknown | null>
    addVideoRecord: (taskId: string, videoRecord: unknown) => Promise<{ success: boolean }>
    updateStatus: (taskId: string, status: string) => Promise<{ success: boolean }>
  }
  taskCRUD: {
    getAll: () => Promise<unknown[]>
    getById: (id: string) => Promise<unknown | null>
    getByAccount: (accountId: string) => Promise<unknown[]>
    create: (data: { name: string; accountId: string; taskType?: string; config?: unknown }) => Promise<unknown>
    update: (id: string, updates: unknown) => Promise<unknown | null>
    delete: (id: string) => Promise<{ success: boolean }>
    duplicate: (id: string) => Promise<unknown | null>
  }
  'task-template': {
    getAll: () => Promise<unknown[]>
    save: (name: string, config: unknown) => Promise<unknown>
    delete: (id: string) => Promise<{ success: boolean }>
  }
  debug: {
    getEnv: () => Promise<unknown>
  }
}

function createIPCListener(channel: string, callback: (data: any) => void): () => void {
  const listener = (_event: any, data: any) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ElectronAPI = {
  auth: {
    hasAuth: () => ipcRenderer.invoke('auth:hasAuth'),
    login: (authData) => ipcRenderer.invoke('auth:login', authData),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getAuth: () => ipcRenderer.invoke('auth:getAuth')
  },
  task: {
    start: (config) => ipcRenderer.invoke('task:start', config),
    stop: (taskId) => ipcRenderer.invoke('task:stop', taskId),
    pause: (taskId) => ipcRenderer.invoke('task:pause', taskId),
    resume: (taskId) => ipcRenderer.invoke('task:resume', taskId),
    status: (taskId) => ipcRenderer.invoke('task:status', taskId),
    listRunning: () => ipcRenderer.invoke('task:list-running'),
    getStatus: (taskId) => ipcRenderer.invoke('task:get-status', taskId),
    queueSize: () => ipcRenderer.invoke('task:queue-size'),
    removeFromQueue: (queueId) => ipcRenderer.invoke('task:remove-from-queue', queueId),
    schedule: (taskId, cron) => ipcRenderer.invoke('task:schedule', taskId, cron),
    cancelSchedule: (taskId) => ipcRenderer.invoke('task:cancel-schedule', taskId),
    getSchedules: () => ipcRenderer.invoke('task:get-schedules'),
    setConcurrency: (max) => ipcRenderer.invoke('task:set-concurrency', max),
    getConcurrency: () => ipcRenderer.invoke('task:get-concurrency'),
    stopAll: () => ipcRenderer.invoke('task:stop-all'),
    onProgress: (callback) => createIPCListener('task:progress', callback),
    onAction: (callback) => createIPCListener('task:action', callback),
    onPaused: (callback) => createIPCListener('task:paused', callback),
    onResumed: (callback) => createIPCListener('task:resumed', callback),
    onStarted: (callback) => createIPCListener('task:started', callback),
    onStopped: (callback) => createIPCListener('task:stopped', callback),
    onQueued: (callback) => createIPCListener('task:queued', callback),
    onScheduleTriggered: (callback) => createIPCListener('task:scheduleTriggered', callback)
  },
  'feed-ac-settings': {
    get: () => ipcRenderer.invoke('feed-ac-settings:get'),
    update: (settings) => ipcRenderer.invoke('feed-ac-settings:update', settings),
    reset: () => ipcRenderer.invoke('feed-ac-settings:reset'),
    export: () => ipcRenderer.invoke('feed-ac-settings:export'),
    import: (settings) => ipcRenderer.invoke('feed-ac-settings:import', settings)
  },
  'ai-settings': {
    get: () => ipcRenderer.invoke('ai-settings:get'),
    update: (settings) => ipcRenderer.invoke('ai-settings:update', settings),
    reset: () => ipcRenderer.invoke('ai-settings:reset'),
    test: (config) => ipcRenderer.invoke('ai-settings:test', config)
  },
  'browser-exec': {
    get: () => ipcRenderer.invoke('browser-exec:get'),
    set: (path) => ipcRenderer.invoke('browser-exec:set', path)
  },
  browser: {
    detect: () => ipcRenderer.invoke('browser:detect')
  },
  account: {
    list: () => ipcRenderer.invoke('account:list'),
    add: (account) => ipcRenderer.invoke('account:add', account),
    update: (id, updates) => ipcRenderer.invoke('account:update', id, updates),
    delete: (id) => ipcRenderer.invoke('account:delete', id),
    setDefault: (id) => ipcRenderer.invoke('account:setDefault', id),
    getDefault: () => ipcRenderer.invoke('account:getDefault'),
    getById: (id) => ipcRenderer.invoke('account:getById', id),
    getByPlatform: (platform) => ipcRenderer.invoke('account:getByPlatform', platform),
    getActiveAccounts: () => ipcRenderer.invoke('account:getActiveAccounts'),
    checkStatus: (id) => ipcRenderer.invoke('account:check-status', id)
  },
  login: {
    douyin: () => ipcRenderer.invoke('login:douyin')
  },
  'file-picker': {
    selectFile: (options) => ipcRenderer.invoke('file-picker:selectFile', options || {}),
    selectDirectory: () => ipcRenderer.invoke('file-picker:selectDirectory')
  },
  'task-history': {
    getAll: () => ipcRenderer.invoke('task-history:getAll'),
    getById: (id) => ipcRenderer.invoke('task-history:getById', id),
    add: (record) => ipcRenderer.invoke('task-history:add', record),
    update: (id, updates) => ipcRenderer.invoke('task-history:update', id, updates),
    delete: (id) => ipcRenderer.invoke('task-history:delete', id),
    clear: () => ipcRenderer.invoke('task-history:clear')
  },
  'task-detail': {
    get: (id) => ipcRenderer.invoke('task-detail:get', id),
    addVideoRecord: (taskId, videoRecord) => ipcRenderer.invoke('task-detail:addVideoRecord', taskId, videoRecord),
    updateStatus: (taskId, status) => ipcRenderer.invoke('task-detail:updateStatus', taskId, status)
  },
  taskCRUD: {
    getAll: () => ipcRenderer.invoke('task:getAll'),
    getById: (id) => ipcRenderer.invoke('task:getById', id),
    getByAccount: (accountId) => ipcRenderer.invoke('task:getByAccount', accountId),
    create: (data) => ipcRenderer.invoke('task:create', data),
    update: (id, updates) => ipcRenderer.invoke('task:update', id, updates),
    delete: (id) => ipcRenderer.invoke('task:delete', id),
    duplicate: (id) => ipcRenderer.invoke('task:duplicate', id)
  },
  'task-template': {
    getAll: () => ipcRenderer.invoke('task-template:getAll'),
    save: (name, config) => ipcRenderer.invoke('task-template:save', name, config),
    delete: (id) => ipcRenderer.invoke('task-template:delete', id)
  },
  debug: {
    getEnv: () => ipcRenderer.invoke('debug:getEnv')
  }
}

contextBridge.exposeInMainWorld('api', api)
