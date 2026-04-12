import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'
import { AISettings, getDefaultAISettings } from '../../shared/ai-setting'

export function registerAISettingIPC(): void {
  ipcMain.handle('ai-settings:get', async () => {
    const settings = store.get(StorageKey.AI_SETTINGS) as AISettings | null
    return settings || getDefaultAISettings()
  })

  ipcMain.handle('ai-settings:update', async (_event, settings: Partial<AISettings>) => {
    const current = store.get(StorageKey.AI_SETTINGS) as AISettings || getDefaultAISettings()
    const updated = { ...current, ...settings }
    store.set(StorageKey.AI_SETTINGS, updated)
    return updated
  })

  ipcMain.handle('ai-settings:reset', async () => {
    const defaults = getDefaultAISettings()
    store.set(StorageKey.AI_SETTINGS, defaults)
    return defaults
  })

  ipcMain.handle('ai-settings:test', async (_event, config: { platform: string; apiKey: string; model: string }) => {
    return { success: true, message: 'AI settings test not implemented yet' }
  })
}