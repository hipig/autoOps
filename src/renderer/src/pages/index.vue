<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTaskStore } from '@/stores/task-new'
import { useAccountStore } from '@/stores/account'
import type { TaskHistoryRecord } from '@/../../shared/task-history'
import {
  Play,
  Plus,
  UserCircle,
  Settings,
  Activity,
  MessageSquare,
  Clock,
  CheckCircle2
} from 'lucide-vue-next'

const router = useRouter()
const taskStore = useTaskStore()
const accountStore = useAccountStore()

const recentHistory = ref<TaskHistoryRecord[]>([])
const stats = computed(() => {
  const totalTasks = taskStore.tasks.length
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayHistory = recentHistory.value.filter(h => h.startTime >= today.getTime())
  const todayComments = todayHistory.reduce((sum, h) => sum + h.commentCount, 0)
  const runningTasks = todayHistory.filter(h => h.status === 'running').length

  return {
    totalTasks,
    todayExecutions: todayHistory.length,
    todayComments,
    runningTasks
  }
})

onMounted(async () => {
  await Promise.all([
    taskStore.loadTasks(),
    taskStore.loadTemplates(),
    accountStore.loadAccounts()
  ])
  recentHistory.value = await window.api['task-history'].getAll() as TaskHistoryRecord[]
  recentHistory.value = recentHistory.value.slice(0, 5)
})

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString('zh-CN')
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-500'
    case 'running': return 'bg-blue-500'
    case 'stopped': return 'bg-yellow-500'
    case 'error': return 'bg-red-500'
    default: return 'bg-gray-500'
  }
}

function goToTasks() {
  router.push('/tasks')
}

function goToAccounts() {
  router.push('/accounts')
}

function goToSettings() {
  router.push('/settings')
}

function createTask() {
  router.push('/tasks?action=create')
}
</script>

<template>
  <div class="container mx-auto px-4 py-6">
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">控制台</h1>
          <p class="text-sm text-muted-foreground">欢迎使用抖音自动化运营系统</p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" @click="createTask">
            <Plus class="w-4 h-4 mr-2" />
            新建任务
          </Button>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">总任务数</CardTitle>
            <ListTodo class="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats.totalTasks }}</div>
            <p class="text-xs text-muted-foreground">已配置任务</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">今日执行</CardTitle>
            <Activity class="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats.todayExecutions }}</div>
            <p class="text-xs text-muted-foreground">任务运行次数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">今日评论</CardTitle>
            <MessageSquare class="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats.todayComments }}</div>
            <p class="text-xs text-muted-foreground">AI 生成评论数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">正在运行</CardTitle>
            <Clock class="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats.runningTasks }}</div>
            <p class="text-xs text-muted-foreground">当前活跃任务</p>
          </CardContent>
        </Card>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <Card class="cursor-pointer hover:shadow-md transition-shadow" @click="goToTasks">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Play class="w-5 h-5" />
              任务管理
            </CardTitle>
            <CardDescription>创建、编辑和启动自动化任务</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground">
              {{ taskStore.tasks.length }} 个任务已配置
            </p>
          </CardContent>
        </Card>

        <Card class="cursor-pointer hover:shadow-md transition-shadow" @click="goToAccounts">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <UserCircle class="w-5 h-5" />
              账号管理
            </CardTitle>
            <CardDescription>管理多个抖音账号</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground">
              {{ accountStore.accounts.length }} 个账号已添加
            </p>
          </CardContent>
        </Card>

        <Card class="cursor-pointer hover:shadow-md transition-shadow" @click="goToSettings">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Settings class="w-5 h-5" />
              设置
            </CardTitle>
            <CardDescription>配置 AI 和浏览器设置</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground">
              AI 平台、浏览器路径等
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Clock class="w-5 h-5" />
            最近执行记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="recentHistory.length === 0" class="text-center py-8 text-muted-foreground">
            <Activity class="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>暂无执行记录</p>
            <p class="text-sm">创建任务后即可开始自动化运营</p>
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="record in recentHistory"
              :key="record.id"
              class="flex items-center justify-between p-3 bg-accent rounded-lg"
            >
              <div class="flex items-center gap-3">
                <div :class="['w-2 h-2 rounded-full', getStatusColor(record.status)]"></div>
                <div>
                  <p class="font-medium text-sm">任务 #{{ record.id.slice(0, 8) }}</p>
                  <p class="text-xs text-muted-foreground">
                    {{ formatTime(record.startTime) }} · {{ record.videoRecords.length }} 个视频
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Badge variant="secondary">
                  <MessageSquare class="w-3 h-3 mr-1" />
                  {{ record.commentCount }}
                </Badge>
                <span class="text-xs text-muted-foreground capitalize">
                  {{ record.status }}
                </span>
              </div>
            </div>
          </div>
          <div v-if="recentHistory.length > 0" class="mt-4 text-center">
            <Button variant="ghost" size="sm" @click="goToTasks">
              查看全部任务
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
