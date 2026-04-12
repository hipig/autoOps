import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'

export function registerAuthIPC(): void {
  ipcMain.handle('auth:hasAuth', async () => {
    const auth = store.get(StorageKey.AUTH)
    return auth !== null && auth !== undefined
  })

  ipcMain.handle('auth:login', async (_event, authData) => {
    store.set(StorageKey.AUTH, authData)
    return { success: true }
  })

  ipcMain.handle('auth:logout', async () => {
    store.set(StorageKey.AUTH, null)
    return { success: true }
  })

  ipcMain.handle('auth:getAuth', async () => {
    return store.get(StorageKey.AUTH)
  })
}