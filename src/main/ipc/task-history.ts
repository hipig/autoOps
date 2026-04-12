import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'
import { TaskHistoryRecord } from '../../shared/task-history'

export function registerTaskHistoryIPC(): void {
  ipcMain.handle('task-history:getAll', async () => {
    const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] | null
    return history || []
  })

  ipcMain.handle('task-history:getById', async (_event, id: string) => {
    const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] || []
    return history.find((h) => h.id === id) || null
  })

  ipcMain.handle('task-history:add', async (_event, record: TaskHistoryRecord) => {
    const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] || []
    history.unshift(record)
    store.set(StorageKey.TASK_HISTORY, history)
    return { success: true }
  })

  ipcMain.handle('task-history:update', async (_event, id: string, updates: Partial<TaskHistoryRecord>) => {
    const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] || []
    const index = history.findIndex((h) => h.id === id)
    if (index !== -1) {
      history[index] = { ...history[index], ...updates }
      store.set(StorageKey.TASK_HISTORY, history)
      return { success: true }
    }
    return { success: false, error: 'Record not found' }
  })

  ipcMain.handle('task-history:delete', async (_event, id: string) => {
    const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] || []
    const filtered = history.filter((h) => h.id !== id)
    store.set(StorageKey.TASK_HISTORY, filtered)
    return { success: true }
  })

  ipcMain.handle('task-history:clear', async () => {
    store.set(StorageKey.TASK_HISTORY, [])
    return { success: true }
  })
}