import { ipcMain, BrowserWindow } from 'electron'
import { TaskManager, TaskStatusInfo } from '../service/task-manager'
import { TaskRunner, TaskRunConfig, TaskRunnerStatus } from '../service/task-runner'
import { store, StorageKey } from '../utils/storage'
import type { FeedAcSettingsV3, FeedAcSettingsV2 } from '../../shared/feed-ac-setting'
import { migrateToV3 } from '../../shared/feed-ac-setting'
import type { Platform, TaskType } from '../../shared/platform'
import log from 'electron-log/main'

// 全局 TaskManager 实例
let taskManager: TaskManager | null = null

function getTaskManager(): TaskManager {
  if (!taskManager) {
    taskManager = new TaskManager()
    taskManager.init().catch(err => {
      log.error('[TaskIPC] TaskManager init error:', err)
    })
    taskManager.setBrowserExecPath(store.get(StorageKey.BROWSER_EXEC_PATH) as string || '')

    // 转发事件到渲染进程
    taskManager.on('progress', (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('task:progress', data)
      })
    })

    taskManager.on('action', (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('task:action', data)
      })
    })

    taskManager.on('paused', (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('task:paused', data)
      })
    })

    taskManager.on('resumed', (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('task:resumed', data)
      })
    })

    taskManager.on('taskStarted', (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('task:started', data)
      })
    })

    taskManager.on('taskStopped', (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('task:stopped', data)
      })
    })

    taskManager.on('queued', (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('task:queued', data)
      })
    })

    taskManager.on('scheduleTriggered', (data: any) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((win) => {
        win.webContents.send('task:scheduleTriggered', data)
      })
    })
  }
  return taskManager
}

export function registerTaskIPC(): void {
  ipcMain.handle('task:start', async (_event, config: {
    settings: FeedAcSettingsV2 | FeedAcSettingsV3
    accountId?: string
    platform?: Platform
    taskType?: TaskType
    taskName?: string
  }) => {
    try {
      log.info('[TaskIPC] Received task:start request', JSON.stringify({
        hasSettings: !!config.settings,
        settingsVersion: (config.settings as any)?.version,
        accountId: config.accountId,
        platform: config.platform,
        taskType: config.taskType
      }))

      const browserExecPath = store.get(StorageKey.BROWSER_EXEC_PATH) as string | null
      if (!browserExecPath) {
        log.error('[TaskIPC] Browser path not configured')
        return { success: false, error: 'Browser path not configured' }
      }

      const settings = (config.settings as any).version === 'v2'
        ? migrateToV3(config.settings as FeedAcSettingsV2)
        : config.settings as FeedAcSettingsV3

      const platform = config.platform || 'douyin'
      const taskType = settings.taskType || config.taskType || 'comment'

      log.info('[TaskIPC] Starting task with platform:', platform, 'taskType:', taskType, 'accountId:', config.accountId)

      const manager = getTaskManager()
      manager.setBrowserExecPath(browserExecPath)

      const taskId = await manager.startTask(
        {
          browserExecPath,
          platform,
          taskType,
          settings,
          accountId: config.accountId
        },
        config.taskName
      )

      return { success: true, taskId }
    } catch (error) {
      log.error('Failed to start task:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:stop', async (_event, taskId?: string) => {
    try {
      const manager = getTaskManager()
      if (taskId) {
        return await manager.stopTask(taskId)
      } else {
        // 兼容旧调用：停止所有任务
        await manager.stopAll()
        return { success: true }
      }
    } catch (error) {
      log.error('Failed to stop task:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:pause', async (_event, taskId: string) => {
    try {
      const manager = getTaskManager()
      return await manager.pauseTask(taskId)
    } catch (error) {
      log.error('Failed to pause task:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:resume', async (_event, taskId: string) => {
    try {
      const manager = getTaskManager()
      return await manager.resumeTask(taskId)
    } catch (error) {
      log.error('Failed to resume task:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:status', async (_event, taskId?: string) => {
    const manager = getTaskManager()
    if (taskId) {
      const status = manager.getTaskStatus(taskId)
      return status || { running: false }
    }
    // 兼容旧调用
    const runningTasks = manager.getAllRunningTasks()
    return { running: runningTasks.length > 0, tasks: runningTasks }
  })

  ipcMain.handle('task:list-running', async () => {
    const manager = getTaskManager()
    return manager.getAllRunningTasks()
  })

  ipcMain.handle('task:get-status', async (_event, taskId: string) => {
    const manager = getTaskManager()
    return manager.getTaskStatus(taskId)
  })

  ipcMain.handle('task:queue-size', async () => {
    const manager = getTaskManager()
    return { size: manager.getQueueSize() }
  })

  ipcMain.handle('task:remove-from-queue', async (_event, queueId: string) => {
    const manager = getTaskManager()
    return { success: manager.removeFromQueue(queueId) }
  })

  ipcMain.handle('task:schedule', async (_event, taskId: string, cron: string) => {
    try {
      const manager = getTaskManager()
      return await manager.scheduleTask(taskId, cron)
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('task:cancel-schedule', async (_event, taskId: string) => {
    const manager = getTaskManager()
    return manager.cancelSchedule(taskId)
  })

  ipcMain.handle('task:get-schedules', async () => {
    const manager = getTaskManager()
    return manager.getSchedules()
  })

  ipcMain.handle('task:set-concurrency', async (_event, max: number) => {
    const manager = getTaskManager()
    manager.setMaxConcurrency(max)
    return { success: true }
  })

  ipcMain.handle('task:get-concurrency', async () => {
    const manager = getTaskManager()
    return { maxConcurrency: manager.getMaxConcurrency() }
  })

  ipcMain.handle('task:stop-all', async () => {
    try {
      const manager = getTaskManager()
      await manager.stopAll()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}

export { getTaskManager }
