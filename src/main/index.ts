import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerAuthIPC } from './ipc/auth'
import { registerTaskIPC } from './ipc/task'
import { registerFeedAcSettingIPC } from './ipc/feed-ac-setting'
import { registerAISettingIPC } from './ipc/ai-setting'
import { registerBrowserExecIPC } from './ipc/browser-exec'
import { registerBrowserDetectIPC } from './ipc/browser-detect'
import { registerAccountIPC } from './ipc/account'
import { registerLoginIPC } from './ipc/login'
import { registerFilePickerIPC } from './ipc/file-picker'
import { registerTaskHistoryIPC } from './ipc/task-history'
import { registerTaskDetailIPC } from './ipc/task-detail'
import { registerDebugIPC } from './ipc/debug'
import { registerTaskIPC as registerTaskCrudIPC } from './ipc/task-crud'
import log from 'electron-log/main'

log.initialize()
log.info('AutoOps starting...')

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  log.info('App ready, registering IPC handlers...')

  electronApp.setAppUserModelId('com.autoops.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAuthIPC()
  registerTaskIPC()
  registerFeedAcSettingIPC()
  registerAISettingIPC()
  registerBrowserExecIPC()
  registerBrowserDetectIPC()
  registerAccountIPC()
  registerLoginIPC()
  registerFilePickerIPC()
  registerTaskHistoryIPC()
  registerTaskDetailIPC()
  registerDebugIPC()
  registerTaskCrudIPC()

  log.info('All IPC handlers registered')

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('log', (_event, level: string, message: string) => {
  switch (level) {
    case 'error':
      log.error('[Renderer]', message)
      break
    case 'warn':
      log.warn('[Renderer]', message)
      break
    case 'debug':
      log.debug('[Renderer]', message)
      break
    default:
      log.info('[Renderer]', message)
  }
})