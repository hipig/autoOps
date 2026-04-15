import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { FeedAcSettingsV2 } from '../../../shared/feed-ac-setting'
import type { AISettings } from '../../../shared/ai-setting'
import { getDefaultFeedAcSettings } from '../../../shared/feed-ac-setting'
import { getDefaultAISettings } from '../../../shared/ai-setting'

export const useSettingsStore = defineStore('settings', () => {
  const feedAcSettings = ref<FeedAcSettingsV2 | null>(null)
  const aiSettings = ref<AISettings | null>(null)

  async function loadSettings() {
    feedAcSettings.value = await window.api['feed-ac-settings'].get() as FeedAcSettingsV2
  }

  async function updateFeedAcSettings(settings: FeedAcSettingsV2) {
    feedAcSettings.value = await window.api['feed-ac-settings'].update(toRaw(settings)) as FeedAcSettingsV2
  }

  async function resetFeedAcSettings() {
    feedAcSettings.value = await window.api['feed-ac-settings'].reset() as FeedAcSettingsV2
  }

  async function loadAISettings() {
    aiSettings.value = await window.api['ai-settings'].get() as AISettings
  }

  async function updateAISettings(settings: AISettings) {
    aiSettings.value = await window.api['ai-settings'].update(toRaw(settings)) as AISettings
  }

  async function resetAISettings() {
    aiSettings.value = await window.api['ai-settings'].reset() as AISettings
  }

  return {
    feedAcSettings,
    aiSettings,
    loadSettings,
    updateFeedAcSettings,
    resetFeedAcSettings,
    loadAISettings,
    updateAISettings,
    resetAISettings
  }
})