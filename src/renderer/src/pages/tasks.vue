<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

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
  ListTodo
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useTaskStore } from '@/stores/task-new'
import { useAccountStore } from '@/stores/account'
import { useTaskStore as useRuntimeTaskStore } from '@/stores/task'
import type { Task } from '@/../../shared/task'
import type { FeedAcSettingsV2, FeedAcRuleGroups } from '@/../../shared/feed-ac-setting'
import type { TaskHistoryRecord } from '@/../../shared/task-history'

const route = useRoute()
const router = useRouter()
const taskStore = useTaskStore()
const accountStore = useAccountStore()
const runtimeTaskStore = useRuntimeTaskStore()

const selectedTaskId = ref<string | null>(null)
const isCreating = ref(false)
const showCreateDialog = ref(false)
const showTemplateDialog = ref(false)
const showDeleteDialog = ref(false)
const taskHistory = ref<TaskHistoryRecord[]>([])
const selectedAccountId = ref<string | null>(null)

const newTaskName = ref('')
const templateName = ref('')

const editingTask = ref<Task | null>(null)
const taskSettings = ref<FeedAcSettingsV2>({
  version: 'v2',
  ruleGroups: [],
  blockKeywords: [],
  authorBlockKeywords: [],
  simulateWatchBeforeComment: false,
  watchTimeRangeSeconds: [5, 15],
  onlyCommentActiveVideo: false,
  maxCount: 10,
  aiCommentEnabled: false
})

const newRuleGroup = ref<Partial<FeedAcRuleGroups>>({
  type: 'manual',
  name: '',
  rules: [],
  commentTexts: ['']
})

const newBlockKeyword = ref('')
const newAuthorBlockKeyword = ref('')

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
  return taskHistory.value.filter(h => h.id.includes(selectedTaskId.value!) || h.id.startsWith(selectedTaskId.value!.split('-').pop() || ''))
})

onMounted(async () => {
  await Promise.all([
    taskStore.loadTasks(),
    taskStore.loadTemplates(),
    accountStore.loadAccounts()
  ])
  taskHistory.value = await window.api['task-history'].getAll() as TaskHistoryRecord[]

  if (route.query.action === 'create') {
    showCreateDialog.value = true
    router.replace({ query: {} })
  }

  if (taskStore.tasks.length > 0 && !selectedTaskId.value) {
    selectedTaskId.value = taskStore.tasks[0].id
  }
})

watch(selectedTask, (task) => {
  if (task) {
    editingTask.value = { ...task }
    taskSettings.value = JSON.parse(JSON.stringify(task.config))
  } else {
    editingTask.value = null
  }
})

watch(selectedTaskId, () => {
  taskSettings.value = {
    version: 'v2',
    ruleGroups: [],
    blockKeywords: [],
    authorBlockKeywords: [],
    simulateWatchBeforeComment: false,
    watchTimeRangeSeconds: [5, 15],
    onlyCommentActiveVideo: false,
    maxCount: 10,
    aiCommentEnabled: false
  }
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
      selectedAccountId.value || accountStore.accounts[0]?.id || ''
    )
    selectedTaskId.value = task.id
    showCreateDialog.value = false
    newTaskName.value = ''
    toast.success('任务创建成功')
  } catch (error) {
    toast.error('创建失败')
  }
}

async function saveTask() {
  if (!selectedTaskId.value) return

  try {
    await taskStore.updateTask(selectedTaskId.value, {
      name: editingTask.value?.name,
      config: taskSettings.value
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
    await taskStore.updateTask(selectedTaskId.value, { config: taskSettings.value })
    await runtimeTaskStore.start(taskSettings.value, selectedTask.value.accountId)
    toast.success('任务启动成功')
  } catch (error) {
    toast.error('启动失败')
  }
}

async function stopTask() {
  await runtimeTaskStore.stop()
  toast.info('任务已停止')
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

function applyTemplate(config: FeedAcSettingsV2) {
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

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-green-600'
    case 'running': return 'text-blue-600'
    case 'stopped': return 'text-yellow-600'
    case 'error': return 'text-red-600'
    default: return ''
  }
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
              <DialogDescription>为任务选择一个账号和名称</DialogDescription>
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
            </div>
            <DialogFooter>
              <Button variant="outline" @click="showCreateDialog = false">取消</Button>
              <Button @click="createTask">创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive" @click="showDeleteDialog = true">
                  <Trash2 class="w-4 h-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div :class="['text-xs mt-1', selectedTaskId === task.id ? 'text-primary/80' : 'text-muted-foreground']">
            {{ getAccountName(task.accountId) }}
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
          <Button @click="startTask" :disabled="runtimeTaskStore.isRunning">
            <Play class="w-4 h-4 mr-2" />
            启动
          </Button>
          <Button variant="destructive" @click="stopTask" :disabled="!runtimeTaskStore.isRunning">
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
              <div class="flex items-center justify-between">
                <Label>模拟观看</Label>
                <Switch v-model="taskSettings.simulateWatchBeforeComment" />
              </div>

              <div class="space-y-2">
                <Label>观看时长范围（秒）</Label>
                <div class="flex gap-2">
                  <Input type="number" v-model.number="taskSettings.watchTimeRangeSeconds[0]" />
                  <span class="self-center">-</span>
                  <Input type="number" v-model.number="taskSettings.watchTimeRangeSeconds[1]" />
                </div>
              </div>

              <div class="flex items-center justify-between">
                <Label>仅评论活跃视频</Label>
                <Switch v-model="taskSettings.onlyCommentActiveVideo" />
              </div>

              <div class="space-y-2">
                <Label>目标评论数</Label>
                <Input type="number" v-model.number="taskSettings.maxCount" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>规则组</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid gap-4 md:grid-cols-3">
                <div class="space-y-2">
                  <Label>规则组名称</Label>
                  <Input v-model="newRuleGroup.name" placeholder="输入规则组名称" />
                </div>
                <div class="space-y-2">
                  <Label>规则类型</Label>
                  <Select v-model="newRuleGroup.type">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">手动规则</SelectItem>
                      <SelectItem value="ai">AI 规则</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label>评论内容</Label>
                  <Input v-model="(newRuleGroup.commentTexts || [''])[0]" placeholder="输入评论内容" />
                </div>
              </div>
              <Button @click="addRuleGroup" :disabled="!newRuleGroup.name">
                <Plus class="w-4 h-4 mr-2" />
                添加规则组
              </Button>

              <div class="space-y-3 mt-4">
                <div v-for="(group, index) in taskSettings.ruleGroups" :key="group.id" class="p-3 bg-accent rounded-lg">
                  <div class="flex items-center justify-between mb-2">
                    <div class="font-medium">{{ group.name }}</div>
                    <Button variant="ghost" size="sm" @click="removeRuleGroup(index)">
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>
                  <div class="text-sm text-muted-foreground">
                    类型: {{ group.type === 'ai' ? 'AI 规则' : '手动规则' }}
                  </div>
                  <div v-if="group.commentTexts?.length" class="mt-2">
                    <div class="text-sm font-medium">评论:</div>
                    <div class="text-sm text-muted-foreground">
                      {{ group.commentTexts.join(', ') }}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>屏蔽词</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI 设置</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex items-center justify-between">
                <Label>启用 AI 生成评论</Label>
                <Switch v-model="taskSettings.aiCommentEnabled" />
              </div>
              <p class="text-sm text-muted-foreground">
                启用后，评论内容将由 AI 根据视频内容实时生成
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
                <div v-for="record in selectedTaskHistory" :key="record.id" class="p-3 bg-accent rounded-lg">
                  <div class="flex items-center justify-between mb-2">
                    <div class="font-medium text-sm">任务 #{{ record.id.slice(0, 8) }}</div>
                    <div :class="['text-sm font-medium', getStatusColor(record.status)]">
                      {{ record.status }}
                    </div>
                  </div>
                  <div class="text-xs text-muted-foreground mb-2">
                    {{ formatTime(record.startTime) }}
                    <span v-if="record.endTime"> - {{ formatTime(record.endTime) }}</span>
                  </div>
                  <div class="flex items-center gap-4 text-sm">
                    <span class="flex items-center gap-1">
                      <MessageSquare class="w-4 h-4" />
                      {{ record.commentCount }}
                    </span>
                    <span>处理 {{ record.videoRecords.length }} 个视频</span>
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

      <div v-if="runtimeTaskStore.isRunning" class="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>实时日志</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="h-48 overflow-auto font-mono text-sm space-y-1">
              <div v-for="(log, index) in runtimeTaskStore.logs" :key="index">
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
  </div>
</template>
