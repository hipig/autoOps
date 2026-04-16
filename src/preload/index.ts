import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  auth: {
    hasAuth: () => Promise<boolean>
    login: (authData: unknown) => Promise<{ success: boolean }>
    logout: () => Promise<{ success: boolean }>
    getAuth: () => Promise<unknown>
  }
  task: {
    start: (config: { settings: unknown; accountId?: string; taskType?: string }) => Promise<{ success: boolean; taskId?: string; error?: string }>
    stop: () => Promise<{ success: boolean; error?: string }>
    status: () => Promise<{ running: boolean }>
    onProgress: (callback: (data: { message: string; timestamp: number }) => void) => void
    onAction: (callback: (data: { videoId: string; action: string; success: boolean }) => void) => void
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

const api: ElectronAPI = {
  auth: {
    hasAuth: () => ipcRenderer.invoke('auth:hasAuth'),
    login: (authData) => ipcRenderer.invoke('auth:login', authData),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getAuth: () => ipcRenderer.invoke('auth:getAuth')
  },
  task: {
    start: (config) => ipcRenderer.invoke('task:start', config),
    stop: () => ipcRenderer.invoke('task:stop'),
    status: () => ipcRenderer.invoke('task:status'),
    onProgress: (callback) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('task:progress', listener)
      return () => ipcRenderer.removeListener('task:progress', listener)
    },
    onAction: (callback) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('task:action', listener)
      return () => ipcRenderer.removeListener('task:action', listener)
    }
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
    getActiveAccounts: () => ipcRenderer.invoke('account:getActiveAccounts')
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