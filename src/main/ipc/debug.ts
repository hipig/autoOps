import { ipcMain } from 'electron'

export function registerDebugIPC(): void {
  ipcMain.handle('debug:getEnv', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      versions: process.versions,
      electron: process.versions.electron
    }
  })
}