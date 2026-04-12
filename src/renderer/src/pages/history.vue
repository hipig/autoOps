<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TaskHistoryRecord } from '@/../../shared/task-history'

const router = useRouter()
const history = ref<TaskHistoryRecord[]>([])

onMounted(async () => {
  await loadHistory()
})

async function loadHistory() {
  history.value = await window.api['task-history'].getAll() as TaskHistoryRecord[]
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-green-600'
    case 'running':
      return 'text-blue-600'
    case 'stopped':
      return 'text-yellow-600'
    case 'error':
      return 'text-red-600'
    default:
      return ''
  }
}

async function clearHistory() {
  await window.api['task-history'].clear()
  history.value = []
}
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold">任务历史</h2>
        <div class="flex gap-2">
          <Button variant="outline" @click="loadHistory">刷新</Button>
          <Button variant="outline" @click="router.push('/')">返回</Button>
        </div>
      </div>

      <div v-if="history.length === 0" class="text-center py-12 text-muted-foreground">
        暂无任务记录
      </div>

      <div v-else class="space-y-4">
        <Card v-for="record in history" :key="record.id">
          <CardHeader class="flex flex-row items-center justify-between">
            <div>
              <CardTitle>任务 #{{ record.id.slice(0, 8) }}</CardTitle>
              <CardDescription>
                开始时间: {{ formatTime(record.startTime) }}
                <span v-if="record.endTime">
                  - 结束时间: {{ formatTime(record.endTime) }}
                </span>
              </CardDescription>
            </div>
            <div class="flex items-center gap-2">
              <span :class="getStatusColor(record.status)" class="font-medium">
                {{ record.status }}
              </span>
              <span class="text-muted-foreground">
                评论: {{ record.commentCount }}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground">
              处理视频: {{ record.videoRecords.length }} 个
            </p>
            <div v-if="record.videoRecords.length > 0" class="mt-2 text-sm">
              <p class="font-medium">最近处理:</p>
              <ul class="list-disc list-inside text-muted-foreground">
                <li v-for="video in record.videoRecords.slice(-3)" :key="video.videoId">
                  @{{ video.authorName }} - {{ video.isCommented ? '已评论' : '跳过' }}
                  <span v-if="video.skipReason"> ({{ video.skipReason }})</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div class="flex justify-center">
          <Button variant="destructive" @click="clearHistory">清空历史</Button>
        </div>
      </div>
    </div>
  </div>
</template>