import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'
import {
  FeedAcSettingsV3,
  FeedAcSettingsV2,
  getDefaultFeedAcSettingsV3,
  migrateToV3
} from '../../shared/feed-ac-setting'

function ensureV3(settings: FeedAcSettingsV2 | FeedAcSettingsV3 | null): FeedAcSettingsV3 {
  if (!settings) return getDefaultFeedAcSettingsV3()
  if ((settings as any).version === 'v2') return migrateToV3(settings as FeedAcSettingsV2)
  return { ...getDefaultFeedAcSettingsV3(), ...(settings as FeedAcSettingsV3) }
}

export function registerFeedAcSettingIPC(): void {
  ipcMain.handle('feed-ac-settings:get', async () => {
    const settings = store.get(StorageKey.FEED_AC_SETTINGS)
    return ensureV3(settings as any)
  })

  ipcMain.handle('feed-ac-settings:update', async (_event, settings: Partial<FeedAcSettingsV3>) => {
    const current = ensureV3(store.get(StorageKey.FEED_AC_SETTINGS) as any)
    const updated = { ...current, ...settings }
    store.set(StorageKey.FEED_AC_SETTINGS, updated)
    return updated
  })

  ipcMain.handle('feed-ac-settings:reset', async () => {
    const defaults = getDefaultFeedAcSettingsV3()
    store.set(StorageKey.FEED_AC_SETTINGS, defaults)
    return defaults
  })

  ipcMain.handle('feed-ac-settings:export', async () => {
    return ensureV3(store.get(StorageKey.FEED_AC_SETTINGS) as any)
  })

  ipcMain.handle('feed-ac-settings:import', async (_event, settings: FeedAcSettingsV2 | FeedAcSettingsV3) => {
    const v3Settings = ensureV3(settings as any)
    store.set(StorageKey.FEED_AC_SETTINGS, v3Settings)
    return { success: true }
  })
}