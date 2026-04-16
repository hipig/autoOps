import { ipcMain, BrowserWindow } from 'electron'
import { TaskRunner } from '../service/task-runner'
import { store, StorageKey } from '../utils/storage'
import type { FeedAcSettingsV3, FeedAcSettingsV2 } from '../../shared/feed-ac-setting'
import { migrateToV3 } from '../../shared/feed-ac-setting'
import type { Platform, TaskType } from '../../shared/platform'
import log from 'electron-log/main'

let currentTaskRunner: TaskRunner | null = null

export function registerTaskIPC(): void {
  ipcMain.handle('task:start', async (_event, config: {
    settings: FeedAcSettingsV2 | FeedAcSettingsV3
    accountId?: string
    platform?: Platform
    taskType?: TaskType
  }) => {
    try {
      log.info('[TaskIPC] Received task:start request', JSON.stringify({
        hasSettings: !!config.settings,
        settingsVersion: (config.settings as any)?.version,
        accountId: config.accountId,
        platform: config.platform,
        taskType: config.taskType
      }))

      if (currentTaskRunner) {
        log.warn('[TaskIPC] Task already running')
        return { success: false, error: 'Task already running' }
      }

      const browserExecPath = store.get(StorageKey.BROWSER_EXEC_PATH) as string | null
      if (!browserExecPath) {
        log.error('[TaskIPC] Browser path not configured')
        return { success: false, error: 'Browser path not configured' }
      }

      log.info('[TaskIPC] Browser path configured:', browserExecPath)

      const settings = config.settings.version === 'v2'
        ? migrateToV3(config.settings as FeedAcSettingsV2)
        : config.settings as FeedAcSettingsV3

      const platform = config.platform || 'douyin'
      const taskType = settings.taskType || config.taskType || 'comment'

      log.info('[TaskIPC] Starting task with platform:', platform, 'taskType:', taskType, 'accountId:', config.accountId)

      currentTaskRunner = new TaskRunner()

      currentTaskRunner.on('progress', (data: { message: string; timestamp: number }) => {
        const windows = BrowserWindow.getAllWindows()
        windows.forEach((win) => {
          win.webContents.send('task:progress', data)
        })
      })

      currentTaskRunner.on('action', (data: { videoId: string; action: string; success: boolean }) => {
        const windows = BrowserWindow.getAllWindows()
        windows.forEach((win) => {
          win.webContents.send('task:action', data)
        })
      })

      const taskId = await currentTaskRunner.start({
        browserExecPath,
        platform,
        taskType,
        settings,
        accountId: config.accountId
      })

      currentTaskRunner.on('stopped', () => {
        currentTaskRunner = null
        log.info('Task stopped')
      })

      return { success: true, taskId }
    } catch (error) {
      log.error('Failed to start task:', error)
      currentTaskRunner = null
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:stop', async () => {
    try {
      if (currentTaskRunner) {
        await currentTaskRunner.stop()
        currentTaskRunner = null
        return { success: true }
      }
      return { success: false, error: 'No task running' }
    } catch (error) {
      log.error('Failed to stop task:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:status', async () => {
    return { running: currentTaskRunner !== null }
  })
}
