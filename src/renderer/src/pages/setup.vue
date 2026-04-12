<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Chrome, Globe, Search, RefreshCw, ChevronRight, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

interface DetectedBrowser {
  path: string
  name: string
  version: string
}

const router = useRouter()
const appStore = useAppStore()

const step = ref<'welcome' | 'browser' | 'complete'>('welcome')
const browsers = ref<DetectedBrowser[]>([])
const selectedBrowser = ref<DetectedBrowser | null>(null)
const customPath = ref('')
const isLoading = ref(false)
const isVerifying = ref(false)

onMounted(async () => {
  // Don't auto-detect on mount to avoid triggering browser launch
  // User can click refresh button to detect
})

const detectBrowsers = async () => {
  isLoading.value = true
  try {
    const detected = await window.api.browser.detect()
    browsers.value = detected
    if (detected.length > 0) {
      selectedBrowser.value = detected[0]
    }
  } catch (error) {
    toast.error('检测浏览器失败')
  } finally {
    isLoading.value = false
  }
}

const browseForBrowser = async () => {
  const result = await window.api['file-picker'].selectFile({
    filters: [{ name: 'Executable', extensions: ['exe'] }]
  })
  
  if (!result.canceled && result.filePath) {
    customPath.value = result.filePath
    selectedBrowser.value = {
      path: result.filePath,
      name: result.fileName || 'Custom Browser',
      version: 'unknown'
    }
  }
}

const verifyAndSave = async () => {
  if (!selectedBrowser.value) return
  
  isVerifying.value = true
  try {
    await appStore.setBrowserPath(selectedBrowser.value.path)
    toast.success('浏览器配置成功')
    step.value = 'complete'
  } catch (error) {
    toast.error('浏览器配置失败')
  } finally {
    isVerifying.value = false
  }
}

const goToApp = () => {
  router.push('/')
}

const getBrowserIcon = (name: string) => {
  if (name.toLowerCase().includes('chrome')) return Chrome
  if (name.toLowerCase().includes('edge')) return Globe
  return Search
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-8">
    <div class="w-full max-w-2xl">
      <!-- Welcome Step -->
      <div v-if="step === 'welcome'" class="text-center space-y-6">
        <div class="space-y-2">
          <h1 class="text-4xl font-bold text-slate-900">Welcome to AutoOps</h1>
          <p class="text-lg text-slate-600">多平台自动化运营桌面应用</p>
        </div>
        <Card>
          <CardContent class="pt-6">
            <div class="space-y-4">
              <div class="flex items-start gap-3">
                <CheckCircle class="w-5 h-5 text-green-500 mt-0.5" />
                <div>
                  <p class="font-medium">浏览器自动化</p>
                  <p class="text-sm text-slate-500">支持 Chrome、Edge 等主流浏览器</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <CheckCircle class="w-5 h-5 text-green-500 mt-0.5" />
                <div>
                  <p class="font-medium">多账号管理</p>
                  <p class="text-sm text-slate-500">安全隔离的账号环境</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <CheckCircle class="w-5 h-5 text-green-500 mt-0.5" />
                <div>
                  <p class="font-medium">智能评论</p>
                  <p class="text-sm text-slate-500">AI 驱动的评论生成</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Button size="lg" @click="step = 'browser'" class="px-8">
          开始配置
          <ChevronRight class="w-4 h-4 ml-2" />
        </Button>
      </div>

      <!-- Browser Selection Step -->
      <div v-else-if="step === 'browser'" class="space-y-6">
        <div class="text-center">
          <h2 class="text-2xl font-bold">选择浏览器</h2>
          <p class="text-slate-600">选择一个浏览器用于自动化操作</p>
        </div>

        <Card>
          <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <CardTitle class="text-lg">检测到的浏览器</CardTitle>
              <Button variant="outline" size="sm" @click="detectBrowsers" :disabled="isLoading">
                <RefreshCw :class="['w-4 h-4', isLoading && 'animate-spin']" />
              </Button>
            </div>
            <CardDescription>系统上已安装的浏览器</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div v-if="isLoading" class="flex items-center justify-center py-8">
              <Loader2 class="w-8 h-8 animate-spin text-slate-400" />
            </div>
            
            <div v-else-if="browsers.length === 0" class="text-center py-8 text-slate-500">
              <Search class="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>未检测到浏览器</p>
              <p class="text-sm">请手动选择浏览器路径</p>
            </div>

            <div v-else class="space-y-2">
              <button
                v-for="browser in browsers"
                :key="browser.path"
                @click="selectedBrowser = browser; customPath = ''"
                :class="[
                  'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                  selectedBrowser?.path === browser.path && !customPath
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-200 hover:border-slate-300'
                ]"
              >
                <component :is="getBrowserIcon(browser.name)" class="w-8 h-8 text-slate-600" />
                <div class="flex-1">
                  <p class="font-medium">{{ browser.name }}</p>
                  <p class="text-xs text-slate-500">{{ browser.path }}</p>
                </div>
                <Badge variant="outline">{{ browser.version }}</Badge>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-lg">自定义路径</CardTitle>
            <CardDescription>手动选择浏览器可执行文件</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex gap-2">
              <input
                v-model="customPath"
                @focus="selectedBrowser = null"
                type="text"
                placeholder="浏览或输入浏览器路径..."
                class="flex-1 px-3 py-2 border rounded-md text-sm"
              />
              <Button variant="outline" @click="browseForBrowser">
                浏览
              </Button>
            </div>
          </CardContent>
        </Card>

        <div class="flex gap-3">
          <Button variant="outline" @click="step = 'welcome'">
            返回
          </Button>
          <Button
            class="flex-1"
            :disabled="!selectedBrowser || isVerifying"
            @click="verifyAndSave"
          >
            <Loader2 v-if="isVerifying" class="w-4 h-4 mr-2 animate-spin" />
            {{ isVerifying ? '验证中...' : '验证并保存' }}
          </Button>
        </div>
      </div>

      <!-- Complete Step -->
      <div v-else-if="step === 'complete'" class="text-center space-y-6">
        <div class="flex justify-center">
          <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle class="w-10 h-10 text-green-500" />
          </div>
        </div>
        <div class="space-y-2">
          <h2 class="text-2xl font-bold">配置完成!</h2>
          <p class="text-slate-600">
            浏览器已配置为: <span class="font-medium">{{ selectedBrowser?.name }}</span>
          </p>
        </div>
        <Card class="text-left">
          <CardContent class="pt-6">
            <p class="text-sm text-slate-600">
              您已准备好使用 AutoOps。添加抖音账号后即可开始自动化运营。
            </p>
          </CardContent>
        </Card>
        <Button size="lg" @click="goToApp" class="px-8">
          进入应用
          <ChevronRight class="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  </div>
</template>
