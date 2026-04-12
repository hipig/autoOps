import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'
import { TaskHistoryRecord } from '../../shared/task-history'

export function registerTaskDetailIPC(): void {
  ipcMain.handle('task-detail:get', async (_event, id: string) => {
    const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] || []
    const record = history.find((h) => h.id === id)
    return record || null
  })

  ipcMain.handle('task-detail:addVideoRecord', async (_event, taskId: string, videoRecord: TaskHistoryRecord['videoRecords'][0]) => {
    const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] || []
    const index = history.findIndex((h) => h.id === taskId)
    if (index !== -1) {
      history[index].videoRecords.push(videoRecord)
      if (videoRecord.isCommented) {
        history[index].commentCount++
      }
      store.set(StorageKey.TASK_HISTORY, history)
      return { success: true }
    }
    return { success: false, error: 'Task not found' }
  })

  ipcMain.handle('task-detail:updateStatus', async (_event, taskId: string, status: TaskHistoryRecord['status']) => {
    const history = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] || []
    const index = history.findIndex((h) => h.id === taskId)
    if (index !== -1) {
      history[index].status = status
      if (status === 'completed' || status === 'stopped' || status === 'error') {
        history[index].endTime = Date.now()
      }
      store.set(StorageKey.TASK_HISTORY, history)
      return { success: true }
    }
    return { success: false, error: 'Task not found' }
  })
}