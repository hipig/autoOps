<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, toRaw, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Plus,
  MoreVertical,
  Play,
  Square,
  Trash2,
  Copy,
  Save,
  FolderOpen,
  Clock,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  XCircle,
  History,
  ListTodo,
  ThumbsUp,
  Bookmark,
  UserPlus,
  Pause,
  RotateCcw,
  Timer,
  Settings2
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useTaskStore } from '@/stores/task'
import { useAccountStore } from '@/stores/account'
import type { Task } from '@/../../shared/task'
import type { FeedAcSettingsV3, FeedAcRuleGroups, CommentStyle, CategoryMode, VideoCategoryConfig } from '@/../../shared/feed-ac-setting'
import { getDefaultFeedAcSettingsV3, migrateToV3, PRESET_CATEGORIES } from '@/../../shared/feed-ac-setting'
import type { TaskHistoryRecord } from '@/../../shared/task-history'
import type { TaskType } from '@/../../shared/platform'

const route = useRoute()
const router = useRouter()
const taskStore = useTaskStore()
const accountStore = useAccountStore()

const selectedTaskId = ref<string | null>(null)
const isCreating = ref(false)
const showCreateDialog = ref(false)
const showTemplateDialog = ref(false)
const showDeleteDialog = ref(false)
const showScheduleDialog = ref(false)
const showConcurrencyDialog = ref(false)
const showHistoryDetailDialog = ref(false)
const taskHistory = ref<TaskHistoryRecord[]>([])
const selectedHistoryRecord = ref<TaskHistoryRecord | null>(null)
const selectedAccountId = ref<string | null>(null)

const newTaskName = ref('')
const newTaskType = ref<TaskType>('comment')
const templateName = ref('')

const editingTask = ref<Task | null>(null)
const taskSettings = ref<FeedAcSettingsV3>(getDefaultFeedAcSettingsV3('comment'))

const selectedTaskType = ref<TaskType>('comment')

// 根据任务类型获取当前操作配置
const currentOperation = computed(() => {
  if (selectedTaskType.value === 'combo') {
    return null // 组合任务使用 operations 数组
  }
  const op = taskSettings.value.operations.find(op => op.type === selectedTaskType.value)
  if (op) {
    // 确保评论操作有commentTexts数组
    if (op.type === 'comment' && !op.commentTexts) {
      op.commentTexts = []
    }
    return op
  }
  return {
    type: selectedTaskType.value,
    enabled: true,
    probability: 1.0,
    commentTexts: selectedTaskType.value === 'comment' ? [] : undefined,
    aiEnabled: false
  }
})

// 确保操作配置存在
function ensureOperationConfig() {
  if (selectedTaskType.value === 'combo') return

  const existingOp = taskSettings.value.operations.find(op => op.type === selectedTaskType.value)
  if (!existingOp) {
    taskSettings.value.operations.push({
      type: selectedTaskType.value as any,
      enabled: true,
      probability: 1.0,
      commentTexts: selectedTaskType.value === 'comment' ? [] : undefined,
      aiEnabled: false
    })
  }
}

const newRuleGroup = ref<Partial<FeedAcRuleGroups>>({
  type: 'manual',
  name: '',
  rules: [],
  commentTexts: ['']
})

const activeComboTab = ref('comment')

const longVideoSpeedStr = computed({
  get: () => String(taskSettings.value.longVideoSpeed || 2),
  set: (val: string) => { taskSettings.value.longVideoSpeed = parseFloat(val) }
})

const newBlockKeyword = ref('')
const newAuthorBlockKeyword = ref('')
const newCustomCategoryKeyword = ref('')
const scheduleCron = ref('')
const concurrencyInput = ref(3)
const logContainer = ref<HTMLElement | null>(null)

const filteredTasks = computed(() => {
  if (!selectedAccountId.value || selectedAccountId.value === '__all__') return taskStore.tasks
  return taskStore.tasks.filter(t => t.accountId === selectedAccountId.value)
})

const selectedTask = computed(() => {
  if (!selectedTaskId.value) return null
  return taskStore.getTaskById(selectedTaskId.value)
})

const selectedTaskHistory = computed(() => {
  if (!selectedTaskId.value) return []
  // 使用 taskId 字段匹配（taskId 是 CRUD 任务的 ID）
  return taskHistory.value.filter(h => h.taskId === selectedTaskId.value)
})

const currentRunningTaskInfo = computed(() => {
  if (!selectedTaskId.value) return null
  // 优先用 crudTaskId 匹配，降级用 taskName 匹配
  return taskStore.runningTasks.find(t => t.crudTaskId === selectedTaskId.value || t.taskName === editingTask.value?.name)
})

onMounted(async () => {
  await Promise.all([
    taskStore.loadTasks(),
    taskStore.loadTemplates(),
    accountStore.loadAccounts(),
    taskStore.loadRunningTasks(),
    taskStore.loadConcurrency()
  ])
  taskHistory.value = await window.api['task-history'].getAll() as TaskHistoryRecord[]

  if (route.query.action === 'create') {
    showCreateDialog.value = true
    router.replace({ query: {} })
  }

  if (taskStore.tasks.length > 0 && !selectedTaskId.value) {
    selectedTaskId.value = taskStore.tasks[0].id
  }

  // 监听历史记录实时更新事件
  const unsubscribeHistoryUpdate = window.api.task.onHistoryUpdate((data: any) => {
    // 实时刷新历史记录
    window.api['task-history'].getAll().then((history) => {
      taskHistory.value = history as TaskHistoryRecord[]
    })
  })

  onUnmounted(() => {
    unsubscribeHistoryUpdate()
  })
})

watch(selectedTask, (task) => {
  if (task) {
    editingTask.value = { ...task }
    const config = task.config as any
    const taskType = (task as any).taskType || 'comment'

    if (config.version === 'v2') {
      taskSettings.value = migrateToV3(config)
    } else {
      taskSettings.value = { ...getDefaultFeedAcSettingsV3(taskType), ...config }
      // 确保 videoCategories 存在并有完整字段
      if (!taskSettings.value.videoCategories) {
        taskSettings.value.videoCategories = {
          enabled: false,
          mode: 'whitelist',
          categories: [],
          customKeywords: [],
          useAI: false,
          prioritizeAI: true,
          aiPrompt: '判断这个视频是否属于目标分类。请综合考虑视频描述、标签和热门评论的内容。'
        }
      } else {
        // 确保新字段存在
        if (taskSettings.value.videoCategories.prioritizeAI === undefined) {
          taskSettings.value.videoCategories.prioritizeAI = true
        }
        if (!taskSettings.value.videoCategories.aiPrompt) {
          taskSettings.value.videoCategories.aiPrompt = '判断这个视频是否属于目标分类。请综合考虑视频描述、标签和热门评论的内容。'
        }
      }
    }
    selectedTaskType.value = taskType
    ensureOperationConfig()
  } else {
    editingTask.value = null
  }
})

// 监听日志变化，自动滚动到底部
watch(() => taskStore.logs.length, () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
})

async function createTask() {
  if (!newTaskName.value.trim()) {
    toast.error('请输入任务名称')
    return
  }
  if (!selectedAccountId.value && accountStore.accounts.length > 0) {
    toast.error('请先选择账号')
    return
  }

  try {
    const task = await taskStore.createTask(
      newTaskName.value,
      selectedAccountId.value || accountStore.accounts[0]?.id || '',
      newTaskType.value
    )
    selectedTaskId.value = task.id
    selectedTaskType.value = newTaskType.value
    showCreateDialog.value = false
    newTaskName.value = ''
    newTaskType.value = 'comment'
    toast.success('任务创建成功')
  } catch (error) {
    toast.error('创建失败')
  }
}

async function saveTask() {
  if (!selectedTaskId.value) return

  try {
    const rawSettings = JSON.parse(JSON.stringify(toRaw(taskSettings.value)))
    await taskStore.updateTask(selectedTaskId.value, {
      name: editingTask.value?.name,
      config: rawSettings
    })
    toast.success('保存成功')
  } catch (error) {
    toast.error('保存失败')
  }
}

async function deleteTask() {
  if (!selectedTaskId.value) return

  try {
    await taskStore.deleteTask(selectedTaskId.value)
    selectedTaskId.value = taskStore.tasks[0]?.id || null
    showDeleteDialog.value = false
    toast.success('删除成功')
  } catch (error) {
    toast.error('删除失败')
  }
}

async function duplicateTask() {
  if (!selectedTaskId.value) return

  try {
    const newTask = await taskStore.duplicateTask(selectedTaskId.value)
    if (newTask) {
      selectedTaskId.value = newTask.id
      toast.success('复制成功')
    }
  } catch (error) {
    toast.error('复制失败')
  }
}

async function startTask() {
  if (!selectedTaskId.value || !selectedTask.value) {
    toast.error('请先选择任务')
    return
  }

  try {
    const settings = toRaw(taskSettings.value)
    const rawSettings = JSON.parse(JSON.stringify(settings))
    await taskStore.updateTask(selectedTaskId.value, {
      name: editingTask.value?.name,
      config: rawSettings
    })
    
    await taskStore.start(rawSettings, selectedTask.value.accountId, selectedTaskType.value, editingTask.value?.name, selectedTaskId.value)
    toast.success('任务启动成功')
  } catch (error) {
    toast.error('启动失败:' + error)
  }
}

async function stopTask() {
  if (currentRunningTaskInfo.value) {
    await taskStore.stop(currentRunningTaskInfo.value.taskId)
  } else {
    await taskStore.stop()
  }
  toast.info('任务已停止')
}

async function pauseCurrentTask() {
  if (!currentRunningTaskInfo.value) return
  const result = await taskStore.pauseTask(currentRunningTaskInfo.value.taskId)
  if (result.success) toast.info('任务已暂停')
  else toast.error('暂停失败: ' + result.error)
}

async function resumeCurrentTask() {
  if (!currentRunningTaskInfo.value) return
  const result = await taskStore.resumeTask(currentRunningTaskInfo.value.taskId)
  if (result.success) toast.info('任务已恢复')
  else toast.error('恢复失败: ' + result.error)
}

async function handleSchedule() {
  if (!selectedTaskId.value || !scheduleCron.value.trim()) {
    toast.error('请输入 Cron 表达式')
    return
  }
  const result = await taskStore.scheduleTask(selectedTaskId.value, scheduleCron.value)
  if (result.success) {
    toast.success('定时任务设置成功')
    showScheduleDialog.value = false
    scheduleCron.value = ''
  } else {
    toast.error('设置失败: ' + result.error)
  }
}

async function handleCancelSchedule() {
  if (!selectedTaskId.value) return
  const result = await taskStore.cancelSchedule(selectedTaskId.value)
  if (result.success) toast.success('定时任务已取消')
  else toast.error('取消失败')
}

async function handleSetConcurrency() {
  const result = await taskStore.setConcurrency(concurrencyInput.value)
  if (result.success) toast.success(`最大并行数设置为 ${concurrencyInput.value}`)
  else toast.error('设置失败')
  showConcurrencyDialog.value = false
}

async function saveAsTemplate() {
  if (!templateName.value.trim()) {
    toast.error('请输入模板名称')
    return
  }

  try {
    await taskStore.saveAsTemplate(templateName.value, taskSettings.value)
    showTemplateDialog.value = false
    templateName.value = ''
    toast.success('模板保存成功')
  } catch (error) {
    toast.error('保存失败')
  }
}

function applyTemplate(config: FeedAcSettingsV3) {
  taskSettings.value = JSON.parse(JSON.stringify(config))
  toast.success('模板已应用')
}

function addRuleGroup() {
  if (!newRuleGroup.value.name) return

  const ruleGroup: FeedAcRuleGroups = {
    id: `rg-${Date.now()}`,
    type: newRuleGroup.value.type || 'manual',
    name: newRuleGroup.value.name,
    relation: 'or',
    rules: newRuleGroup.value.rules || [],
    commentTexts: newRuleGroup.value.commentTexts || ['']
  }

  taskSettings.value.ruleGroups.push(ruleGroup)
  newRuleGroup.value = { type: 'manual', name: '', rules: [], commentTexts: [''] }
}

function removeRuleGroup(index: number) {
  taskSettings.value.ruleGroups.splice(index, 1)
}

function addBlockKeyword() {
  if (!newBlockKeyword.value) return
  taskSettings.value.blockKeywords.push(newBlockKeyword.value)
  newBlockKeyword.value = ''
}

function removeBlockKeyword(index: number) {
  taskSettings.value.blockKeywords.splice(index, 1)
}

function addAuthorBlockKeyword() {
  if (!newAuthorBlockKeyword.value) return
  taskSettings.value.authorBlockKeywords.push(newAuthorBlockKeyword.value)
  newAuthorBlockKeyword.value = ''
}

function removeAuthorBlockKeyword(index: number) {
  taskSettings.value.authorBlockKeywords.splice(index, 1)
}

function addCommentText(group: FeedAcRuleGroups) {
  if (!group.commentTexts) group.commentTexts = []
  group.commentTexts.push('')
}

function removeCommentText(group: FeedAcRuleGroups, index: number) {
  group.commentTexts?.splice(index, 1)
}

function addCustomCategoryKeyword() {
  if (!newCustomCategoryKeyword.value) return
  taskSettings.value.videoCategories.customKeywords.push(newCustomCategoryKeyword.value)
  newCustomCategoryKeyword.value = ''
}

function removeCustomCategoryKeyword(index: number) {
  taskSettings.value.videoCategories.customKeywords.splice(index, 1)
}

function togglePresetCategory(cat: string) {
  const idx = taskSettings.value.videoCategories.categories.indexOf(cat)
  if (idx >= 0) {
    taskSettings.value.videoCategories.categories.splice(idx, 1)
  } else {
    taskSettings.value.videoCategories.categories.push(cat)
  }
}

function addOperation() {
  // 找出还未添加的操作类型
  const allTypes: Array<'comment' | 'like' | 'collect' | 'follow'> = ['comment', 'like', 'collect', 'follow']
  const existingTypes = taskSettings.value.operations.map(op => op.type)
  const availableTypes = allTypes.filter(t => !existingTypes.includes(t))

  if (availableTypes.length === 0) {
    toast.info('所有操作类型已添加')
    return
  }

  const newType = availableTypes[0]
  taskSettings.value.operations.push({
    type: newType,
    enabled: false,
    probability: 0.5,
    commentTexts: newType === 'comment' ? [] : undefined,
    aiEnabled: false
  })
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-green-600'
    case 'running': return 'text-blue-600'
    case 'paused': return 'text-yellow-600'
    case 'stopped': return 'text-gray-600'
    case 'error': case 'failed': return 'text-red-600'
    default: return ''
  }
}

function getTaskStatusBadge(crudTaskId: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const running = taskStore.runningTasks.find(t => t.crudTaskId === crudTaskId)
  if (running) {
    if (running.status === 'paused') return { label: '暂停', variant: 'secondary' }
    return { label: '运行中', variant: 'default' }
  }
  return { label: '就绪', variant: 'default' }
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    running: '运行中',
    completed: '已完成',
    stopped: '已停止',
    paused: '已暂停',
    error: '错误',
    failed: '失败'
  }
  return statusMap[status] || status
}

function getStatusBadge(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'running': return 'default'
    case 'completed': return 'outline'
    case 'paused': return 'secondary'
    case 'stopped': return 'secondary'
    case 'error': case 'failed': return 'destructive'
    default: return 'outline'
  }
}

async function clearTaskHistory() {
  if (!selectedTaskId.value) return

  try {
    await window.api['task-history'].deleteByTaskId(selectedTaskId.value)
    taskHistory.value = await window.api['task-history'].getAll() as TaskHistoryRecord[]
    toast.success('历史记录已清空')
  } catch (error) {
    toast.error('清空失败')
  }
}

function viewHistoryDetail(record: TaskHistoryRecord) {
  selectedHistoryRecord.value = record
  showHistoryDetailDialog.value = true
}

function getAccountName(accountId: string): string {
  const account = accountStore.accounts.find(a => a.id === accountId)
  return account ? (account as any).name || '未命名账号' : '未知'
}

function getTaskName(taskId: string): string {
  const task = taskStore.getTaskById(taskId)
  return task ? task.name : taskId.slice(0, 8)
}
</script>

<template>
  <div class="flex h-full">
    <div class="w-80 border-r bg-card p-4 flex flex-col">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">任务列表</h2>
        <div class="flex gap-1">
          <Dialog v-model:open="showConcurrencyDialog">
            <DialogTrigger as-child>
              <Button size="sm" variant="ghost">
                <Settings2 class="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>并行设置</DialogTitle>
                <DialogDescription>设置同时运行的最大任务数</DialogDescription>
              </DialogHeader>
              <div class="py-4 space-y-4">
                <div class="space-y-2">
                  <Label>最大并行数</Label>
                  <Input type="number" v-model.number="concurrencyInput" min="1" max="10" />
                  <p class="text-xs text-muted-foreground">当前: {{ taskStore.maxConcurrency }}，推荐 2-3</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" @click="showConcurrencyDialog = false">取消</Button>
                <Button @click="handleSetConcurrency">设置</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog v-model:open="showCreateDialog">
            <DialogTrigger as-child>
              <Button size="sm">
                <Plus class="w-4 h-4 mr-1" />
                新建
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>创建新任务</DialogTitle>
                <DialogDescription>为任务选择一个账号、类型和名称</DialogDescription>
              </DialogHeader>
              <div class="space-y-4 py-4">
                <div class="space-y-2">
                  <Label>任务名称</Label>
                  <Input v-model="newTaskName" placeholder="输入任务名称" />
                </div>
                <div class="space-y-2">
                  <Label>关联账号</Label>
                  <Select v-model="selectedAccountId">
                    <SelectTrigger>
                      <SelectValue placeholder="选择账号" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="account in accountStore.accounts" :key="account.id" :value="account.id">
                        {{ (account as any).name || '未命名账号' }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label>任务类型</Label>
                  <Select v-model="newTaskType">
                    <SelectTrigger>
                      <SelectValue placeholder="选择任务类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comment">
                        <div class="flex items-center gap-2">
                          <MessageSquare class="w-4 h-4" /> 评论任务
                        </div>
                      </SelectItem>
                      <SelectItem value="like">
                        <div class="flex items-center gap-2">
                          <ThumbsUp class="w-4 h-4" /> 点赞任务
                        </div>
                      </SelectItem>
                      <SelectItem value="collect">
                        <div class="flex items-center gap-2">
                          <Bookmark class="w-4 h-4" /> 收藏任务
                        </div>
                      </SelectItem>
                      <SelectItem value="follow">
                        <div class="flex items-center gap-2">
                          <UserPlus class="w-4 h-4" /> 关注任务
                        </div>
                      </SelectItem>
                      <SelectItem value="combo">
                        <div class="flex items-center gap-2">
                          <ListTodo class="w-4 h-4" /> 组合任务
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" @click="showCreateDialog = false">取消</Button>
                <Button @click="createTask">创建</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div class="mb-3 flex items-center gap-2">
        <Badge v-if="taskStore.isRunning" variant="default" class="text-xs">
          {{ taskStore.runningTasks.length }} 运行中
        </Badge>
        <Badge v-else variant="outline" class="text-xs">空闲</Badge>
        <span class="text-xs text-muted-foreground">并行: {{ taskStore.maxConcurrency }}</span>
      </div>

      <div class="mb-4">
        <Select v-model="selectedAccountId" @update:modelValue="selectedTaskId = null">
          <SelectTrigger>
            <SelectValue placeholder="全部任务" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部任务</SelectItem>
            <SelectItem v-for="account in accountStore.accounts" :key="account.id" :value="account.id">
              {{ (account as any).name || '未命名账号' }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex-1 overflow-auto space-y-2">
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          :class="[
            'p-3 rounded-lg cursor-pointer transition-colors',
            selectedTaskId === task.id ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/80'
          ]"
          @click="selectedTaskId = task.id"
        >
          <div class="flex items-center justify-between">
            <div class="font-medium text-sm">{{ task.name }}</div>
            <div class="flex items-center gap-1">
              <Badge :variant="getTaskStatusBadge(task.id).variant" class="text-xs">
                {{ getTaskStatusBadge(task.id).label }}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger
                  :class="['p-1 rounded', selectedTaskId === task.id ? 'hover:bg-primary/80' : 'hover:bg-accent']"
                  @click.stop
                >
                  <MoreVertical class="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem @click="duplicateTask">
                    <Copy class="w-4 h-4 mr-2" />
                    复制
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="showScheduleDialog = true">
                    <Timer class="w-4 h-4 mr-2" />
                    定时任务
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive" @click="showDeleteDialog = true">
                    <Trash2 class="w-4 h-4 mr-2" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div :class="['text-xs mt-1', selectedTaskId === task.id ? 'text-primary-foreground/80' : 'text-muted-foreground']">
            {{ getAccountName(task.accountId) }}
          </div>
          <div v-if="task.schedule?.enabled" class="text-xs mt-1 flex items-center gap-1" :class="selectedTaskId === task.id ? 'text-primary-foreground/70' : 'text-orange-500'">
            <Timer class="w-3 h-3" /> {{ task.schedule.cron }}
          </div>
        </div>

        <div v-if="filteredTasks.length === 0" class="text-center py-8 text-muted-foreground">
          <ListTodo class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p class="text-sm">暂无任务</p>
          <Button variant="link" size="sm" @click="showCreateDialog = true">
            创建第一个任务
          </Button>
        </div>
      </div>
    </div>

    <div class="flex-1 p-6 overflow-auto" v-if="selectedTask">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold">{{ editingTask?.name }}</h2>
          <p class="text-sm text-muted-foreground">
            关联账号: {{ getAccountName(selectedTask.accountId) }}
          </p>
        </div>
        <div class="flex gap-2">
          <Button v-if="currentRunningTaskInfo?.status === 'running'" variant="outline" @click="pauseCurrentTask">
            <Pause class="w-4 h-4 mr-2" />
            暂停
          </Button>
          <Button v-if="currentRunningTaskInfo?.status === 'paused'" variant="outline" @click="resumeCurrentTask">
            <RotateCcw class="w-4 h-4 mr-2" />
            恢复
          </Button>
          <Button @click="startTask" :disabled="currentRunningTaskInfo?.status === 'running'">
            <Play class="w-4 h-4 mr-2" />
            启动
          </Button>
          <Button variant="destructive" @click="stopTask" :disabled="!currentRunningTaskInfo">
            <Square class="w-4 h-4 mr-2" />
            停止
          </Button>
        </div>
      </div>

      <Tabs default-value="config">
        <TabsList>
          <TabsTrigger value="config">配置</TabsTrigger>
          <TabsTrigger value="history">历史</TabsTrigger>
          <TabsTrigger value="templates">模板</TabsTrigger>
        </TabsList>

        <TabsContent value="config" class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="space-y-2 flex-1 mr-4">
              <Label>任务名称</Label>
              <Input v-model="editingTask!.name" placeholder="任务名称" />
            </div>
            <div class="flex gap-2 mt-6">
              <Button variant="outline" @click="saveTask">
                <Save class="w-4 h-4 mr-2" />
                保存
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>基础设置</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="font-medium text-sm text-muted-foreground">任务目标</div>
              <div class="space-y-2">
                <Label>目标操作数</Label>
                <Input type="number" v-model.number="taskSettings.maxCount" />
              </div>

              <Separator />

              <div class="font-medium text-sm text-muted-foreground">行为模拟</div>
              <div class="flex items-center justify-between">
                <Label>模拟观看</Label>
                <Switch v-model="taskSettings.simulateWatchBeforeComment" />
              </div>

              <div class="space-y-2">
                <Label>观看时长模式</Label>
                <Select v-model="taskSettings.watchTimeMode">
                  <SelectTrigger>
                    <SelectValue placeholder="选择模式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">固定时长</SelectItem>
                    <SelectItem value="percentage">视频百分比</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div v-if="taskSettings.watchTimeMode === 'fixed'" class="space-y-2">
                <Label>观看时长范围（秒）</Label>
                <div class="flex gap-2">
                  <Input type="number" v-model.number="taskSettings.watchTimeRangeSeconds[0]" />
                  <span class="self-center">-</span>
                  <Input type="number" v-model.number="taskSettings.watchTimeRangeSeconds[1]" />
                </div>
              </div>

              <div v-if="taskSettings.watchTimeMode === 'percentage'" class="space-y-2">
                <Label>观看视频百分比范围（%）</Label>
                <div class="flex gap-2">
                  <Input
                    type="number"
                    :model-value="(taskSettings.watchTimePercentageRange?.[0] || 0.2) * 100"
                    @update:model-value="taskSettings.watchTimePercentageRange = [($event as number) / 100, taskSettings.watchTimePercentageRange?.[1] || 0.5]"
                    :min="1"
                    :max="100"
                  />
                  <span class="self-center">-</span>
                  <Input
                    type="number"
                    :model-value="(taskSettings.watchTimePercentageRange?.[1] || 0.5) * 100"
                    @update:model-value="taskSettings.watchTimePercentageRange = [taskSettings.watchTimePercentageRange?.[0] || 0.2, ($event as number) / 100]"
                    :min="1"
                    :max="100"
                  />
                </div>
                <p class="text-sm text-muted-foreground">根据视频实际时长的百分比来观看，例如 20%-50% 表示观看视频时长的 20% 到 50%</p>
              </div>

              <Separator />

              <div class="font-medium text-sm text-muted-foreground">长视频处理</div>
              <div class="space-y-2">
                <Label>长视频阈值（秒）</Label>
                <Input type="number" v-model.number="taskSettings.longVideoThreshold" :min="10" />
                <p class="text-xs text-muted-foreground">超过此时长的视频视为长视频</p>
              </div>

              <div class="space-y-2">
                <Label>长视频处理方式</Label>
                <Select v-model="taskSettings.longVideoAction">
                  <SelectTrigger>
                    <SelectValue placeholder="选择处理方式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">跳过</SelectItem>
                    <SelectItem value="speed">倍速播放</SelectItem>
                    <SelectItem value="normal">正常观看</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div v-if="taskSettings.longVideoAction === 'speed'" class="space-y-2">
                <Label>倍速播放速度</Label>
                <Select v-model="longVideoSpeedStr">
                  <SelectTrigger>
                    <SelectValue placeholder="选择倍速" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.25">1.25x</SelectItem>
                    <SelectItem value="1.5">1.5x</SelectItem>
                    <SelectItem value="1.75">1.75x</SelectItem>
                    <SelectItem value="2">2.0x</SelectItem>
                    <SelectItem value="3">3.0x</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div class="font-medium text-sm text-muted-foreground">安全控制</div>
              <div class="space-y-2">
                <Label>视频切换等待时间范围（秒）</Label>
                <div class="flex gap-2">
                  <Input type="number" v-model.number="taskSettings.videoSwitchWaitRange[0]" :min="1" />
                  <span class="self-center">-</span>
                  <Input type="number" v-model.number="taskSettings.videoSwitchWaitRange[1]" :min="1" />
                </div>
                <p class="text-sm text-muted-foreground">切换到下一个视频后的随机等待时间，避免固定模式被检测</p>
              </div>

              <div class="space-y-2">
                <Label>连续跳过上限</Label>
                <Input type="number" v-model.number="taskSettings.maxConsecutiveSkips" />
                <p class="text-xs text-muted-foreground">连续跳过视频超过此数量将自动暂停任务</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>视频过滤设置</CardTitle>
              <CardDescription>决定哪些视频会被跳过</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs default-value="type-filter" class="w-full">
                <TabsList class="grid w-full grid-cols-3">
                  <TabsTrigger value="type-filter">类型过滤</TabsTrigger>
                  <TabsTrigger value="block-words">屏蔽词</TabsTrigger>
                  <TabsTrigger value="category-filter">分类筛选</TabsTrigger>
                </TabsList>

                <TabsContent value="type-filter" class="space-y-4 mt-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <Label>跳过广告视频</Label>
                      <p class="text-xs text-muted-foreground">自动跳过Feed中的广告内容</p>
                    </div>
                    <Switch v-model="taskSettings.skipAdVideo" />
                  </div>

                  <div class="flex items-center justify-between">
                    <div>
                      <Label>跳过直播视频</Label>
                      <p class="text-xs text-muted-foreground">自动跳过直播内容</p>
                    </div>
                    <Switch v-model="taskSettings.skipLiveVideo" />
                  </div>

                  <div class="flex items-center justify-between">
                    <div>
                      <Label>跳过图集</Label>
                      <p class="text-xs text-muted-foreground">自动跳过图片图集内容</p>
                    </div>
                    <Switch v-model="taskSettings.skipImageSet" />
                  </div>

                  <div class="flex items-center justify-between">
                    <div>
                      <Label>仅操作活跃视频</Label>
                      <p class="text-xs text-muted-foreground">跳过互动量较低的视频</p>
                    </div>
                    <Switch v-model="taskSettings.onlyCommentActiveVideo" />
                  </div>
                </TabsContent>

                <TabsContent value="block-words" class="space-y-4 mt-4">
                  <div class="space-y-2">
                    <Label>视频描述屏蔽词</Label>
                    <div class="flex gap-2">
                      <Input v-model="newBlockKeyword" placeholder="输入屏蔽词" @keyup.enter="addBlockKeyword" />
                      <Button @click="addBlockKeyword">添加</Button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <Badge v-for="(keyword, index) in taskSettings.blockKeywords" :key="index" variant="secondary">
                        {{ keyword }}
                        <button @click="removeBlockKeyword(index)" class="ml-1 hover:text-destructive">×</button>
                      </Badge>
                    </div>
                  </div>

                  <div class="space-y-2">
                    <Label>作者名屏蔽词</Label>
                    <div class="flex gap-2">
                      <Input v-model="newAuthorBlockKeyword" placeholder="输入屏蔽词" @keyup.enter="addAuthorBlockKeyword" />
                      <Button @click="addAuthorBlockKeyword">添加</Button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <Badge v-for="(keyword, index) in taskSettings.authorBlockKeywords" :key="index" variant="secondary">
                        {{ keyword }}
                        <button @click="removeAuthorBlockKeyword(index)" class="ml-1 hover:text-destructive">×</button>
                      </Badge>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="category-filter" class="space-y-4 mt-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <Label>启用分类筛选</Label>
                      <p class="text-xs text-muted-foreground">指定只操作特定分类的视频</p>
                    </div>
                    <Switch v-model="taskSettings.videoCategories.enabled" />
                  </div>

                  <template v-if="taskSettings.videoCategories.enabled">
                    <div class="space-y-2">
                      <Label>筛选模式</Label>
                      <Select v-model="taskSettings.videoCategories.mode">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whitelist">白名单（只操作匹配的视频）</SelectItem>
                          <SelectItem value="blacklist">黑名单（跳过匹配的视频）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div class="space-y-2">
                      <Label>预定义分类</Label>
                      <div class="flex flex-wrap gap-2">
                        <Badge
                          v-for="cat in PRESET_CATEGORIES"
                          :key="cat"
                          :variant="taskSettings.videoCategories.categories.includes(cat) ? 'default' : 'outline'"
                          class="cursor-pointer"
                          @click="togglePresetCategory(cat)"
                        >
                          {{ cat }}
                        </Badge>
                      </div>
                      <p class="text-xs text-muted-foreground">点击选择/取消分类</p>
                    </div>

                    <div class="space-y-2">
                      <Label>自定义关键词</Label>
                      <div class="flex gap-2">
                        <Input v-model="newCustomCategoryKeyword" placeholder="输入关键词" @keyup.enter="addCustomCategoryKeyword" />
                        <Button size="sm" @click="addCustomCategoryKeyword">添加</Button>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <Badge v-for="(kw, index) in taskSettings.videoCategories.customKeywords" :key="index" variant="secondary">
                          {{ kw }}
                          <button @click="removeCustomCategoryKeyword(index)" class="ml-1 hover:text-destructive">×</button>
                        </Badge>
                      </div>
                    </div>

                    <div class="flex items-center justify-between">
                      <div>
                        <Label>启用 AI 分析</Label>
                        <p class="text-xs text-muted-foreground">使用 AI 判断视频是否属于目标分类</p>
                      </div>
                      <Switch v-model="taskSettings.videoCategories.useAI" />
                    </div>

                    <div v-if="taskSettings.videoCategories.useAI" class="space-y-2">
                      <div class="flex items-center justify-between">
                        <div>
                          <Label>优先使用 AI 判断</Label>
                          <p class="text-xs text-muted-foreground">优先使用 AI 而非关键词匹配（推荐）</p>
                        </div>
                        <Switch v-model="taskSettings.videoCategories.prioritizeAI" />
                      </div>

                      <div class="space-y-2">
                        <Label>AI 分析提示词</Label>
                        <Input
                          v-model="taskSettings.videoCategories.aiPrompt"
                          placeholder="自定义 AI 分析提示词（可选）"
                        />
                        <p class="text-xs text-muted-foreground">
                          AI 将根据此提示词、视频描述、标签和热门评论来判断视频是否属于目标分类
                        </p>
                      </div>
                    </div>
                  </template>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <!-- 任务操作配置 -->
          <Card v-if="selectedTaskType === 'comment'">
            <CardHeader>
              <CardTitle>评论配置</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="space-y-2">
                <Label>评论来源</Label>
                <div class="flex gap-2">
                  <Button
                    :variant="!taskSettings.aiCommentEnabled ? 'default' : 'outline'"
                    size="sm"
                    @click="taskSettings.aiCommentEnabled = false"
                  >评论列表随机</Button>
                  <Button
                    :variant="taskSettings.aiCommentEnabled ? 'default' : 'outline'"
                    size="sm"
                    @click="taskSettings.aiCommentEnabled = true"
                  >AI 生成</Button>
                </div>
              </div>

              <div v-if="!taskSettings.aiCommentEnabled" class="space-y-2">
                <Label>评论内容列表</Label>
                <div v-if="currentOperation" class="space-y-2">
                  <div v-for="(text, index) in (currentOperation.commentTexts || [])" :key="index" class="flex gap-2">
                    <Input v-model="currentOperation.commentTexts![index]" placeholder="输入评论内容" />
                    <Button variant="ghost" size="sm" @click="currentOperation.commentTexts?.splice(index, 1)">
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" @click="currentOperation.commentTexts?.push('')">
                    <Plus class="w-4 h-4 mr-2" />
                    添加评论
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">随机从列表中选择一条评论发送</p>
              </div>

              <div v-else class="space-y-4">
                <div class="space-y-2">
                  <Label>自定义系统提示词（可选）</Label>
                  <textarea
                    v-model="taskSettings.commentSystemPrompt"
                    class="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md"
                    placeholder="留空使用默认提示词。自定义提示词可以更灵活地控制评论生成风格，减少模板化..."
                  />
                </div>
                <p class="text-xs text-muted-foreground">
                  评论内容将由 AI 根据视频内容与热门评论实时生成
                </p>

                <Separator />

                <div class="space-y-2">
                  <Label>评论风格</Label>
                  <Select v-model="taskSettings.commentStyle">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mixed">混合风格</SelectItem>
                      <SelectItem value="humorous">幽默风趣</SelectItem>
                      <SelectItem value="serious">认真专业</SelectItem>
                      <SelectItem value="question">提问互动</SelectItem>
                      <SelectItem value="praise">真诚赞美</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div class="space-y-2">
                  <Label>评论最大字数</Label>
                  <Input type="number" v-model.number="taskSettings.commentMaxLength" />
                </div>

                <div class="space-y-2">
                  <Label>参考热门评论条数</Label>
                  <Input type="number" v-model.number="taskSettings.commentReferenceCount" />
                  <p class="text-xs text-muted-foreground">AI生成评论时参考该视频的热门评论风格和话题</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card v-else-if="selectedTaskType === 'combo'">
            <CardHeader>
              <CardTitle>组合操作配置</CardTitle>
              <CardDescription>配置多种操作及其执行概率</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <Label>首次成功后停止</Label>
                  <p class="text-xs text-muted-foreground">任意操作成功后立即停止，不再执行其他操作</p>
                </div>
                <Switch v-model="taskSettings.comboStopOnFirstSuccess" />
              </div>

              <Tabs v-model="activeComboTab" class="w-full">
                <div class="flex items-center gap-2">
                  <TabsList>
                    <TabsTrigger v-for="op in taskSettings.operations" :key="op.type" :value="op.type">
                      <span :class="{ 'opacity-50': !op.enabled }">{{ { comment: '评论', like: '点赞', collect: '收藏', follow: '关注' }[op.type] }}</span>
                    </TabsTrigger>
                  </TabsList>
                  <Button variant="outline" size="sm" @click="addOperation">
                    <Plus class="w-4 h-4" />
                  </Button>
                </div>

                <TabsContent v-for="op in taskSettings.operations" :key="op.type" :value="op.type" class="space-y-4 mt-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Switch v-model="op.enabled" />
                      <Label>启用{{ { comment: '评论', like: '点赞', collect: '收藏', follow: '关注' }[op.type] }}</Label>
                    </div>
                    <Button v-if="taskSettings.operations.length > 1" variant="ghost" size="sm" @click="taskSettings.operations.splice(taskSettings.operations.indexOf(op), 1)">
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>

                  <div v-if="op.enabled" class="space-y-4">
                    <div class="space-y-2">
                      <Label>执行概率 ({{ (op.probability * 100).toFixed(0) }}%)</Label>
                      <Slider :model-value="[op.probability * 100]" @update:model-value="op.probability = $event[0] / 100" :min="0" :max="100" :step="10" class="w-full" />
                    </div>

                    <!-- 评论操作特有配置 -->
                    <template v-if="op.type === 'comment'">
                      <Separator />

                      <div class="space-y-2">
                        <Label>评论来源</Label>
                        <div class="flex gap-2">
                          <Button
                            :variant="!op.aiEnabled ? 'default' : 'outline'"
                            size="sm"
                            @click="op.aiEnabled = false"
                          >评论列表随机</Button>
                          <Button
                            :variant="op.aiEnabled ? 'default' : 'outline'"
                            size="sm"
                            @click="op.aiEnabled = true"
                          >AI 生成</Button>
                        </div>
                      </div>

                      <div v-if="!op.aiEnabled" class="space-y-2">
                        <Label>评论内容</Label>
                        <div class="space-y-2">
                          <div v-for="(text, textIndex) in (op.commentTexts || [])" :key="textIndex" class="flex gap-2">
                            <Input v-model="op.commentTexts![textIndex]" placeholder="输入评论内容" />
                            <Button variant="ghost" size="sm" @click="op.commentTexts?.splice(textIndex, 1)">
                              <Trash2 class="w-4 h-4" />
                            </Button>
                          </div>
                          <Button variant="outline" size="sm" @click="if (!op.commentTexts) op.commentTexts = []; op.commentTexts.push('')">
                            <Plus class="w-4 h-4 mr-2" />
                            添加评论
                          </Button>
                        </div>
                        <p class="text-xs text-muted-foreground">随机从列表中选择一条评论发送</p>
                      </div>

                      <div v-else class="space-y-4">
                        <div class="space-y-2">
                          <Label>自定义系统提示词（可选）</Label>
                          <textarea
                            v-model="taskSettings.commentSystemPrompt"
                            class="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md"
                            placeholder="留空使用默认提示词。自定义提示词可以更灵活地控制评论生成风格，减少模板化..."
                          />
                        </div>
                        <p class="text-xs text-muted-foreground">
                          评论内容将由 AI 根据视频内容与热门评论实时生成
                        </p>

                        <Separator />

                        <div class="space-y-2">
                          <Label>评论风格</Label>
                          <Select v-model="taskSettings.commentStyle">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mixed">混合风格</SelectItem>
                              <SelectItem value="humorous">幽默风趣</SelectItem>
                              <SelectItem value="serious">认真专业</SelectItem>
                              <SelectItem value="question">提问互动</SelectItem>
                              <SelectItem value="praise">真诚赞美</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div class="space-y-2">
                          <Label>评论最大字数</Label>
                          <Input type="number" v-model.number="taskSettings.commentMaxLength" />
                        </div>

                        <div class="space-y-2">
                          <Label>参考热门评论条数</Label>
                          <Input type="number" v-model.number="taskSettings.commentReferenceCount" />
                          <p class="text-xs text-muted-foreground">AI生成评论时参考该视频的热门评论风格和话题</p>
                        </div>
                      </div>
                    </template>
                  </div>

                  <div v-else class="py-4 text-center text-sm text-muted-foreground">
                    {{ { comment: '评论', like: '点赞', collect: '收藏', follow: '关注' }[op.type] }}操作已禁用，开启后可配置详细参数
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card v-else>
            <CardHeader>
              <CardTitle>{{ { like: '点赞', collect: '收藏', follow: '关注' }[selectedTaskType] }}配置</CardTitle>
            </CardHeader>
            <CardContent>
              <p class="text-sm text-muted-foreground">
                {{ {
                  like: '点赞任务会自动为符合条件的视频点赞',
                  collect: '收藏任务会自动收藏符合条件的视频',
                  follow: '关注任务会自动关注符合条件的视频作者'
                }[selectedTaskType] }}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>执行历史</CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="selectedTaskHistory.length === 0" class="text-center py-8 text-muted-foreground">
                <History class="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>暂无执行记录</p>
              </div>
              <div v-else class="space-y-3">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-sm text-muted-foreground">共 {{ selectedTaskHistory.length }} 条记录</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    @click="clearTaskHistory"
                  >
                    清空历史
                  </Button>
                </div>
                <div v-for="record in selectedTaskHistory" :key="record.id" class="p-3 bg-accent rounded-lg cursor-pointer hover:bg-accent/80 transition-colors" @click="viewHistoryDetail(record)">
                  <div class="flex items-center justify-between mb-2">
                    <div class="font-medium text-sm">任务 #{{ record.id.slice(0, 8) }}</div>
                    <Badge :variant="getStatusBadge(record.status)">
                      {{ getStatusText(record.status) }}
                    </Badge>
                  </div>
                  <div class="text-xs text-muted-foreground mb-2">
                    {{ formatTime(record.startTime) }}
                    <span v-if="record.endTime"> - {{ formatTime(record.endTime) }}</span>
                  </div>
                  <div class="flex items-center gap-4 text-sm">
                    <span class="flex items-center gap-1">
                      <MessageSquare class="w-4 h-4" />
                      评论: {{ record.commentCount }}
                    </span>
                    <span class="flex items-center gap-1">
                      <ThumbsUp class="w-4 h-4" />
                      点赞: {{ record.likeCount }}
                    </span>
                    <span class="flex items-center gap-1">
                      <Bookmark class="w-4 h-4" />
                      收藏: {{ record.collectCount }}
                    </span>
                    <span class="flex items-center gap-1">
                      <UserPlus class="w-4 h-4" />
                      关注: {{ record.followCount }}
                    </span>
                  </div>
                  <div class="text-xs text-muted-foreground mt-2">
                    处理 {{ record.videoRecords.length }} 个视频
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader class="flex flex-row items-center justify-between">
              <div>
                <CardTitle>任务模板</CardTitle>
                <CardDescription>保存当前配置为模板，或从模板应用配置</CardDescription>
              </div>
              <Dialog v-model:open="showTemplateDialog">
                <DialogTrigger as-child>
                  <Button variant="outline">
                    <Save class="w-4 h-4 mr-2" />
                    保存当前为模板
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>保存为模板</DialogTitle>
                    <DialogDescription>输入模板名称保存当前配置</DialogDescription>
                  </DialogHeader>
                  <div class="py-4">
                    <Input v-model="templateName" placeholder="输入模板名称" />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" @click="showTemplateDialog = false">取消</Button>
                    <Button @click="saveAsTemplate">保存</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div v-if="taskStore.templates.length === 0" class="text-center py-8 text-muted-foreground">
                <FolderOpen class="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>暂无模板</p>
                <p class="text-sm">配置好任务后可保存为模板</p>
              </div>
              <div v-else class="space-y-3">
                <div v-for="tmpl in taskStore.templates" :key="tmpl.id" class="p-3 bg-accent rounded-lg flex items-center justify-between">
                  <div>
                    <div class="font-medium">{{ tmpl.name }}</div>
                    <div class="text-xs text-muted-foreground">
                      {{ tmpl.config.ruleGroups.length }} 个规则组 · {{ formatTime(tmpl.createdAt) }}
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <Button size="sm" variant="outline" @click="applyTemplate(tmpl.config)">
                      应用
                    </Button>
                    <Button size="sm" variant="ghost" @click="taskStore.deleteTemplate(tmpl.id)">
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <!-- 实时日志 -->
      <div v-if="taskStore.isRunning" class="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>实时日志</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref="logContainer" class="h-48 overflow-auto font-mono text-sm space-y-1">
              <div v-for="(log, index) in taskStore.logs" :key="index">
                {{ log.message }}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <div v-else class="flex-1 flex items-center justify-center text-muted-foreground">
      <div class="text-center">
        <ListTodo class="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p class="text-lg">选择或创建一个任务</p>
        <p class="text-sm">从左侧列表选择任务，或点击新建创建</p>
      </div>
    </div>

    <!-- 删除确认 -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>确定要删除任务 "{{ selectedTask?.name }}" 吗？此操作不可撤销。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="showDeleteDialog = false">取消</Button>
          <Button variant="destructive" @click="deleteTask">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 定时任务配置 -->
    <Dialog v-model:open="showScheduleDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>定时任务</DialogTitle>
          <DialogDescription>设置 Cron 表达式定期自动执行任务</DialogDescription>
        </DialogHeader>
        <div class="py-4 space-y-4">
          <div class="space-y-2">
            <Label>Cron 表达式</Label>
            <Input v-model="scheduleCron" placeholder="0 9 * * *" />
            <p class="text-xs text-muted-foreground">
              格式: 分 时 日 月 周<br>
              示例: <code>0 9 * * *</code> 每天9点 · <code>0 9-12 * * *</code> 每天9-12点整点 · <code>*/30 9-12 * * *</code> 每天9-12点每30分钟
            </p>
          </div>
          <div v-if="selectedTask?.schedule?.enabled" class="p-3 bg-accent rounded-lg">
            <div class="text-sm font-medium">当前定时配置</div>
            <div class="text-sm text-muted-foreground">{{ selectedTask.schedule.cron }}</div>
            <div v-if="selectedTask.schedule.nextRunAt" class="text-xs text-muted-foreground mt-1">
              下次执行: {{ formatTime(selectedTask.schedule.nextRunAt) }}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button v-if="selectedTask?.schedule?.enabled" variant="outline" @click="handleCancelSchedule">
            取消定时
          </Button>
          <Button variant="outline" @click="showScheduleDialog = false">关闭</Button>
          <Button @click="handleSchedule">设置定时</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 历史详情 -->
    <Dialog v-model:open="showHistoryDetailDialog">
      <DialogContent class="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>执行历史详情</DialogTitle>
          <DialogDescription v-if="selectedHistoryRecord">
            任务 #{{ selectedHistoryRecord.id.slice(0, 8) }} - {{ formatTime(selectedHistoryRecord.startTime) }}
          </DialogDescription>
        </DialogHeader>
        <div v-if="selectedHistoryRecord" class="flex-1 overflow-auto space-y-4 py-4">
          <!-- 统计数据 -->
          <Card>
            <CardHeader>
              <CardTitle class="text-base">执行统计</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-muted-foreground">
                    <MessageSquare class="w-4 h-4" />
                    <span class="text-sm">评论</span>
                  </div>
                  <div class="text-2xl font-bold">{{ selectedHistoryRecord.commentCount }}</div>
                </div>
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-muted-foreground">
                    <ThumbsUp class="w-4 h-4" />
                    <span class="text-sm">点赞</span>
                  </div>
                  <div class="text-2xl font-bold">{{ selectedHistoryRecord.likeCount }}</div>
                </div>
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-muted-foreground">
                    <Bookmark class="w-4 h-4" />
                    <span class="text-sm">收藏</span>
                  </div>
                  <div class="text-2xl font-bold">{{ selectedHistoryRecord.collectCount }}</div>
                </div>
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-muted-foreground">
                    <UserPlus class="w-4 h-4" />
                    <span class="text-sm">关注</span>
                  </div>
                  <div class="text-2xl font-bold">{{ selectedHistoryRecord.followCount }}</div>
                </div>
              </div>
              <div class="mt-4 pt-4 border-t space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-muted-foreground">状态</span>
                  <Badge :variant="getStatusBadge(selectedHistoryRecord.status)">
                    {{ getStatusText(selectedHistoryRecord.status) }}
                  </Badge>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-muted-foreground">开始时间</span>
                  <span>{{ formatTime(selectedHistoryRecord.startTime) }}</span>
                </div>
                <div v-if="selectedHistoryRecord.endTime" class="flex justify-between text-sm">
                  <span class="text-muted-foreground">结束时间</span>
                  <span>{{ formatTime(selectedHistoryRecord.endTime) }}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-muted-foreground">处理视频</span>
                  <span>{{ selectedHistoryRecord.videoRecords.length }} 个</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- 视频记录 -->
          <Card>
            <CardHeader>
              <CardTitle class="text-base">视频记录</CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="!selectedHistoryRecord.videoRecords || selectedHistoryRecord.videoRecords.length === 0" class="text-center py-8 text-muted-foreground">
                <p>暂无视频记录</p>
              </div>
              <div v-else class="space-y-3 max-h-[600px] overflow-auto">
                <div v-for="(video, index) in selectedHistoryRecord.videoRecords" :key="index" class="p-3 rounded border" :class="{
                  'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800': !video.skipReason,
                  'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800': video.skipReason
                }">
                  <!-- 视频基本信息 -->
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex-1">
                      <div class="font-medium text-sm">@{{ video.authorName }}</div>
                      <div class="text-xs text-muted-foreground mt-1">{{ video.videoDesc || '无描述' }}</div>
                      <div v-if="video.videoTags && video.videoTags.length > 0" class="flex flex-wrap gap-1 mt-1">
                        <Badge v-for="tag in video.videoTags" :key="tag" variant="outline" class="text-xs">{{ tag }}</Badge>
                      </div>
                    </div>
                    <div class="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {{ new Date(video.timestamp).toLocaleTimeString('zh-CN') }}
                    </div>
                  </div>

                  <!-- 操作状态 -->
                  <div class="flex items-center gap-3 text-xs mt-2">
                    <span v-if="video.skipReason" class="text-orange-600 dark:text-orange-400">
                      ⏭️ 跳过: {{ video.skipReason }}
                    </span>
                    <template v-else>
                      <span v-if="video.isCommented" class="text-green-600 dark:text-green-400">✅ 已评论</span>
                      <span v-if="video.isLiked" class="text-blue-600 dark:text-blue-400">👍 已点赞</span>
                      <span v-if="video.isCollected" class="text-yellow-600 dark:text-yellow-400">⭐ 已收藏</span>
                      <span v-if="video.isFollowed" class="text-purple-600 dark:text-purple-400">➕ 已关注</span>
                    </template>
                  </div>

                  <!-- AI分析结果 -->
                  <div v-if="video.aiFilterResult" class="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded text-xs">
                    <div class="font-medium text-blue-700 dark:text-blue-300 mb-1">🤖 AI分类判断</div>
                    <div class="text-blue-600 dark:text-blue-400">
                      结果: {{ video.aiFilterResult.matched ? '✅ 匹配' : '❌ 不匹配' }}
                    </div>
                    <div class="text-blue-600 dark:text-blue-400 mt-1">
                      理由: {{ video.aiFilterResult.reason }}
                    </div>
                  </div>

                  <!-- 评论详情 -->
                  <div v-if="video.isCommented && video.commentText" class="mt-2 p-2 bg-green-50 dark:bg-green-950 rounded text-xs">
                    <div class="font-medium text-green-700 dark:text-green-300 mb-1">💬 评论内容</div>
                    <div class="text-green-600 dark:text-green-400">{{ video.commentText }}</div>
                  </div>

                  <!-- AI评论生成详情 -->
                  <div v-if="video.aiCommentResult" class="mt-2 p-2 bg-purple-50 dark:bg-purple-950 rounded text-xs">
                    <div class="font-medium text-purple-700 dark:text-purple-300 mb-1">🤖 AI评论生成</div>
                    <div v-if="video.aiCommentResult.topComments && video.aiCommentResult.topComments.length > 0" class="mb-2">
                      <div class="text-purple-600 dark:text-purple-400 mb-1">参考热门评论:</div>
                      <div v-for="(comment, idx) in video.aiCommentResult.topComments.slice(0, 3)" :key="idx" class="text-purple-500 dark:text-purple-500 ml-2">
                        • {{ comment.content }} ({{ comment.likeCount }} 赞)
                      </div>
                    </div>
                    <div class="text-purple-600 dark:text-purple-400">
                      生成: {{ video.aiCommentResult.comment }}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showHistoryDetailDialog = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
