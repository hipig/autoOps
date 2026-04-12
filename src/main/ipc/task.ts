import { ipcMain, BrowserWindow } from 'electron'
import { DouyinTask } from '../service/douyin-task'
import { store, StorageKey } from '../utils/storage'
import { FeedAcSettingsV2 } from '../../shared/feed-ac-setting'
import log from 'electron-log/main'

let currentTask: DouyinTask | null = null

export function registerTaskIPC(): void {
  ipcMain.handle('task:start', async (_event, config: { settings: FeedAcSettingsV2; accountId?: string }) => {
    try {
      if (currentTask) {
        return { success: false, error: 'Task already running' }
      }

      const browserExecPath = store.get(StorageKey.BROWSER_EXEC_PATH) as string | null
      if (!browserExecPath) {
        return { success: false, error: 'Browser path not configured' }
      }

      log.info('Starting Douyin task with settings:', config.settings, 'accountId:', config.accountId)
      currentTask = new DouyinTask()

      currentTask.on('progress', (data: { message: string; timestamp: number }) => {
        const windows = BrowserWindow.getAllWindows()
        windows.forEach((win) => {
          win.webContents.send('task:progress', data)
        })
      })

      currentTask.on('commented', (data: { videoId: string; comment: string }) => {
        const windows = BrowserWindow.getAllWindows()
        windows.forEach((win) => {
          win.webContents.send('task:commented', data)
        })
      })

      const taskId = await currentTask.start({
        browserExecPath,
        settings: config.settings,
        accountId: config.accountId
      })

      currentTask.on('stopped', () => {
        currentTask = null
        log.info('Task stopped')
      })

      return { success: true, taskId }
    } catch (error) {
      log.error('Failed to start task:', error)
      currentTask = null
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:stop', async () => {
    try {
      if (currentTask) {
        await currentTask.stop()
        currentTask = null
        return { success: true }
      }
      return { success: false, error: 'No task running' }
    } catch (error) {
      log.error('Failed to stop task:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:status', async () => {
    return { running: currentTask !== null }
  })
}