import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'
import {
  FeedAcSettingsV2,
  getDefaultFeedAcSettings
} from '../../shared/feed-ac-setting'

export function registerFeedAcSettingIPC(): void {
  ipcMain.handle('feed-ac-settings:get', async () => {
    const settings = store.get(StorageKey.FEED_AC_SETTINGS) as FeedAcSettingsV2 | null
    return settings || getDefaultFeedAcSettings()
  })

  ipcMain.handle('feed-ac-settings:update', async (_event, settings: Partial<FeedAcSettingsV2>) => {
    const current = store.get(StorageKey.FEED_AC_SETTINGS) as FeedAcSettingsV2 || getDefaultFeedAcSettings()
    const updated = { ...current, ...settings }
    store.set(StorageKey.FEED_AC_SETTINGS, updated)
    return updated
  })

  ipcMain.handle('feed-ac-settings:reset', async () => {
    const defaults = getDefaultFeedAcSettings()
    store.set(StorageKey.FEED_AC_SETTINGS, defaults)
    return defaults
  })

  ipcMain.handle('feed-ac-settings:export', async () => {
    const settings = store.get(StorageKey.FEED_AC_SETTINGS) as FeedAcSettingsV2 | null
    return settings || getDefaultFeedAcSettings()
  })

  ipcMain.handle('feed-ac-settings:import', async (_event, settings: FeedAcSettingsV2) => {
    store.set(StorageKey.FEED_AC_SETTINGS, settings)
    return { success: true }
  })
}