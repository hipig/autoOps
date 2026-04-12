<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useAccountStore } from '@/stores/account'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from '@/components/ui/tooltip'
import { Circle, User, HardDrive } from 'lucide-vue-next'

const appStore = useAppStore()
const accountStore = useAccountStore()

const currentTime = ref(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))

let timeInterval: ReturnType<typeof setInterval>

onMounted(() => {
  timeInterval = setInterval(() => {
    currentTime.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }, 1000)
})

onUnmounted(() => {
  clearInterval(timeInterval)
})

const statusColor = computed(() => {
  if (appStore.isRunning) return 'bg-green-500'
  return 'bg-gray-400'
})

const statusText = computed(() => {
  return appStore.isRunning ? '运行中' : '空闲'
})
</script>

<template>
  <TooltipProvider>
    <footer class="flex items-center justify-between h-7 px-3 bg-sidebar border-t border-sidebar-border text-xs text-sidebar-foreground">
      <div class="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1.5">
              <Circle :class="['w-2 h-2 fill-current', statusColor]" />
              <span>{{ statusText }}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>任务状态</TooltipContent>
        </Tooltip>

        <Tooltip v-if="accountStore.defaultAccount">
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1.5">
              <User class="w-3 h-3" />
              <span>{{ (accountStore.defaultAccount as any).name || '未命名' }}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>当前账号</TooltipContent>
        </Tooltip>

        <Tooltip v-if="appStore.browserPath">
          <TooltipTrigger as-child>
            <div class="flex items-center gap-1.5">
              <HardDrive class="w-3 h-3" />
              <span class="max-w-[150px] truncate">{{ appStore.browserPath }}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{{ appStore.browserPath }}</TooltipContent>
        </Tooltip>
      </div>

      <div class="flex items-center gap-4">
        <Badge variant="outline" class="text-[10px] h-4 px-1.5">
          AutoOps v1.0.0
        </Badge>
        <span>{{ currentTime }}</span>
      </div>
    </footer>
  </TooltipProvider>
</template>
