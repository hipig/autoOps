import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'

export function registerBrowserExecIPC(): void {
  ipcMain.handle('browser-exec:get', async () => {
    return store.get(StorageKey.BROWSER_EXEC_PATH) as string | null
  })

  ipcMain.handle('browser-exec:set', async (_event, path: string) => {
    store.set(StorageKey.BROWSER_EXEC_PATH, path)
    return { success: true }
  })
}