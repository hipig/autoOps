<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'vue-sonner'
import { useSettingsStore } from '@/stores/settings'
import type { AISettings, AIPlatform } from '@/../../shared/ai-setting'
import { PLATFORM_MODELS } from '@/../../shared/ai-setting'

const router = useRouter()
const settingsStore = useSettingsStore()

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

onMounted(async () => {
  await settingsStore.loadAISettings()
  if (settingsStore.aiSettings) {
    aiSettings.value = { ...aiSettings.value, ...settingsStore.aiSettings }
  }
})

async function saveAISettings() {
  await settingsStore.updateAISettings(aiSettings.value)
  toast.success('设置已保存')
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
        </CardHeader>
        <CardContent class="space-y-4">
          <p class="text-sm text-muted-foreground">
            浏览器路径已在首次启动时配置。如需更改，请在任务页面重新设置。
          </p>
          <Button variant="outline" @click="router.push('/setup')">
            前往设置
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>