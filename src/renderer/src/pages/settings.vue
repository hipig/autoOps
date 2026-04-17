<script setup lang="ts">
import { ref, onMounted, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'vue-sonner'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import type { AISettings, AIPlatform } from '@/../../shared/ai-setting'
import { PLATFORM_MODELS } from '@/../../shared/ai-setting'
import { RefreshCw, Loader2, FolderOpen, Chrome, Globe, Search } from 'lucide-vue-next'

const router = useRouter()
const settingsStore = useSettingsStore()
const appStore = useAppStore()

const aiSettings = ref<AISettings>({
  platform: 'deepseek',
  apiKeys: {
    volcengine: '',
    bailian: '',
    openai: '',
    deepseek: ''
  },
  model: 'deepseek-chat',
  temperature: 0.9
})

const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

// 浏览器设置相关状态
interface DetectedBrowser {
  path: string
  name: string
  version: string
}
const browsers = ref<DetectedBrowser[]>([])
const selectedBrowser = ref<DetectedBrowser | null>(null)
const isLoadingBrowsers = ref(false)
const isSavingBrowser = ref(false)

onMounted(async () => {
  await settingsStore.loadAISettings()
  if (settingsStore.aiSettings) {
    aiSettings.value = { ...aiSettings.value, ...settingsStore.aiSettings }
  }
  // 加载浏览器路径
  await appStore.syncBrowserPath()
})

async function saveAISettings() {
  try {
    const rawData = JSON.parse(JSON.stringify(toRaw(aiSettings.value)))
    await settingsStore.updateAISettings(rawData)
    toast.success('设置已保存')
  } catch (error) {
    console.error('[Settings] Save failed:', error)
    toast.error('保存失败: ' + String(error))
  }
}

async function testAI() {
  testing.value = true
  testResult.value = null
  try {
    const result = await window.api['ai-settings'].test({
      platform: aiSettings.value.platform,
      apiKey: aiSettings.value.apiKeys[aiSettings.value.platform],
      model: aiSettings.value.model
    })
    testResult.value = result
  } catch (e) {
    testResult.value = { success: false, message: String(e) }
  }
  testing.value = false
}

// 浏览器相关方法
async function detectBrowsers() {
  isLoadingBrowsers.value = true
  try {
    const detected = await window.api.browser.detect()
    browsers.value = detected
    if (detected.length > 0) {
      selectedBrowser.value = detected[0]
    }
  } catch (error) {
    toast.error('检测浏览器失败')
  } finally {
    isLoadingBrowsers.value = false
  }
}

async function browseForBrowser() {
  const result = await window.api['file-picker'].selectFile({
    filters: [{ name: 'Executable', extensions: ['exe'] }]
  })
  
  if (!result.canceled && result.filePath) {
    selectedBrowser.value = {
      path: result.filePath,
      name: result.fileName || 'Custom Browser',
      version: 'unknown'
    }
    browsers.value = [] // 清空自动检测结果，使用手动选择
  }
}

async function saveBrowserPath() {
  if (!selectedBrowser.value) return
  
  isSavingBrowser.value = true
  try {
    await appStore.setBrowserPath(selectedBrowser.value.path)
    toast.success('浏览器路径已保存')
    browsers.value = []
    selectedBrowser.value = null
  } catch (error) {
    toast.error('保存失败: ' + String(error))
  } finally {
    isSavingBrowser.value = false
  }
}

function getBrowserIcon(name: string) {
  if (name.toLowerCase().includes('chrome')) return Chrome
  if (name.toLowerCase().includes('edge')) return Globe
  return Search
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-2xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold">设置</h2>
        <Button variant="outline" @click="router.push('/')">返回</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI 设置</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <Label>AI 平台</Label>
            <Select v-model="aiSettings.platform" @update:modelValue="() => {
              const models = PLATFORM_MODELS[aiSettings.platform]
              aiSettings.model = models[0]
            }">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
                <SelectItem value="volcengine">火山引擎 (豆包)</SelectItem>
                <SelectItem value="bailian">阿里云百炼</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>API Key</Label>
            <Input
              v-model="aiSettings.apiKeys[aiSettings.platform]"
              type="password"
              placeholder="输入 API Key"
            />
          </div>

          <div class="space-y-2">
            <Label>模型</Label>
            <Select v-model="aiSettings.model">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="model in PLATFORM_MODELS[aiSettings.platform]" :key="model" :value="model">
                  {{ model }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>温度 (0-2)</Label>
            <Input
              type="number"
              v-model.number="aiSettings.temperature"
              min="0"
              max="2"
              step="0.1"
            />
            <p class="text-sm text-muted-foreground">
              较高的值会使输出更加随机，较低的值会使输出更加确定
            </p>
          </div>

          <div class="flex gap-2">
            <Button @click="saveAISettings">保存 AI 设置</Button>
            <Button variant="outline" @click="testAI" :disabled="testing">
              {{ testing ? '测试中...' : '测试连接' }}
            </Button>
          </div>

          <div v-if="testResult" class="p-3 rounded" :class="testResult.success ? 'bg-green-100' : 'bg-red-100'">
            <p :class="testResult.success ? 'text-green-800' : 'text-red-800'">
              {{ testResult.message }}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>浏览器设置</CardTitle>
          <CardDescription>配置用于自动化操作的浏览器</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 当前浏览器路径 -->
          <div v-if="appStore.browserPath" class="space-y-2">
            <Label>当前浏览器路径</Label>
            <div class="flex items-center gap-2 p-3 bg-muted rounded-md">
              <Chrome class="w-5 h-5 text-slate-600" />
              <span class="text-sm flex-1 truncate">{{ appStore.browserPath }}</span>
            </div>
          </div>
      
          <!-- 检测浏览器 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label>检测到的浏览器</Label>
              <Button variant="outline" size="sm" @click="detectBrowsers" :disabled="isLoadingBrowsers">
                <RefreshCw :class="['w-4 h-4', isLoadingBrowsers && 'animate-spin']" />
              </Button>
            </div>
                  
            <div v-if="isLoadingBrowsers" class="flex items-center justify-center py-4">
              <Loader2 class="w-6 h-6 animate-spin text-slate-400" />
            </div>
                  
            <div v-else-if="browsers.length === 0" class="text-center py-4 text-sm text-muted-foreground">
              <p>点击刷新按钮检测浏览器</p>
            </div>
      
            <div v-else class="space-y-2">
              <button
                v-for="browser in browsers"
                :key="browser.path"
                @click="selectedBrowser = browser"
                :class="[
                  'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                  selectedBrowser?.path === browser.path
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-200 hover:border-slate-300'
                ]"
              >
                <component :is="getBrowserIcon(browser.name)" class="w-6 h-6 text-slate-600" />
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm">{{ browser.name }}</p>
                  <p class="text-xs text-slate-500 truncate">{{ browser.path }}</p>
                </div>
                <Badge variant="outline" class="text-xs">{{ browser.version }}</Badge>
              </button>
            </div>
          </div>
      
          <!-- 手动选择 -->
          <div class="space-y-2">
            <Label>手动选择</Label>
            <div class="flex gap-2">
              <Input
                :model-value="selectedBrowser?.path || ''"
                placeholder="点击浏览选择浏览器可执行文件..."
                readonly
                class="flex-1"
              />
              <Button variant="outline" @click="browseForBrowser">
                <FolderOpen class="w-4 h-4 mr-1" />
                浏览
              </Button>
            </div>
          </div>
      
          <!-- 保存按钮 -->
          <div class="flex gap-2">
            <Button
              :disabled="!selectedBrowser || isSavingBrowser"
              @click="saveBrowserPath"
            >
              <Loader2 v-if="isSavingBrowser" class="w-4 h-4 mr-2 animate-spin" />
              {{ isSavingBrowser ? '保存中...' : '保存浏览器路径' }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>