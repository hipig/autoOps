<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTaskStore } from '@/stores/task'
import { useSettingsStore } from '@/stores/settings'
import type { FeedAcSettingsV2, FeedAcRuleGroups } from '@/../../shared/feed-ac-setting'

const router = useRouter()
const taskStore = useTaskStore()
const settingsStore = useSettingsStore()

const settings = ref<FeedAcSettingsV2>({
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

onMounted(async () => {
  await settingsStore.loadSettings()
  if (settingsStore.feedAcSettings) {
    settings.value = { ...settings.value, ...settingsStore.feedAcSettings }
  }
})

async function startTask() {
  await settingsStore.updateFeedAcSettings(settings.value)
  await taskStore.start(settings.value)
}

async function stopTask() {
  await taskStore.stop()
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

  settings.value.ruleGroups.push(ruleGroup)
  newRuleGroup.value = { type: 'manual', name: '', rules: [], commentTexts: [''] }
}

function removeRuleGroup(index: number) {
  settings.value.ruleGroups.splice(index, 1)
}

function addBlockKeyword() {
  if (!newBlockKeyword.value) return
  settings.value.blockKeywords.push(newBlockKeyword.value)
  newBlockKeyword.value = ''
}

function removeBlockKeyword(index: number) {
  settings.value.blockKeywords.splice(index, 1)
}

function addAuthorBlockKeyword() {
  if (!newAuthorBlockKeyword.value) return
  settings.value.authorBlockKeywords.push(newAuthorBlockKeyword.value)
  newAuthorBlockKeyword.value = ''
}

function removeAuthorBlockKeyword(index: number) {
  settings.value.authorBlockKeywords.splice(index, 1)
}

function addCommentText(group: FeedAcRuleGroups) {
  if (!group.commentTexts) group.commentTexts = []
  group.commentTexts.push('')
}

function removeCommentText(group: FeedAcRuleGroups, index: number) {
  group.commentTexts?.splice(index, 1)
}
</script>

<template>
  <div class="container mx-auto px-4 py-6">
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold">任务配置</h2>
      </div>

      <Tabs default-value="basic">
        <TabsList>
          <TabsTrigger value="basic">基础设置</TabsTrigger>
          <TabsTrigger value="rules">规则配置</TabsTrigger>
          <TabsTrigger value="block">屏蔽词</TabsTrigger>
          <TabsTrigger value="ai">AI 设置</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>基础参数</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex items-center justify-between">
                <Label>模拟观看</Label>
                <Switch
                  v-model="settings.simulateWatchBeforeComment"
                />
              </div>

              <div class="space-y-2">
                <Label>观看时长范围（秒）</Label>
                <div class="flex gap-2">
                  <Input
                    type="number"
                    v-model.number="settings.watchTimeRangeSeconds[0]"
                    placeholder="最小"
                  />
                  <span class="self-center">-</span>
                  <Input
                    type="number"
                    v-model.number="settings.watchTimeRangeSeconds[1]"
                    placeholder="最大"
                  />
                </div>
              </div>

              <div class="flex items-center justify-between">
                <Label>仅评论活跃视频</Label>
                <Switch v-model="settings.onlyCommentActiveVideo" />
              </div>

              <div class="space-y-2">
                <Label>目标评论数</Label>
                <Input
                  type="number"
                  v-model.number="settings.maxCount"
                  placeholder="10"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>添加规则组</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
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
                <Label>评论内容（每行一条）</Label>
                <div class="space-y-2">
                  <div v-for="(text, index) in newRuleGroup.commentTexts" :key="index">
                    <Input v-model="newRuleGroup.commentTexts![index]" placeholder="评论内容" />
                  </div>
                  <Button variant="outline" size="sm" @click="addCommentText(newRuleGroup as FeedAcRuleGroups)">
                    添加评论
                  </Button>
                </div>
              </div>

              <Button @click="addRuleGroup">添加规则组</Button>
            </CardContent>
          </Card>

          <Card v-for="(group, index) in settings.ruleGroups" :key="group.id">
            <CardHeader class="flex flex-row items-center justify-between">
              <CardTitle>{{ group.name }}</CardTitle>
              <Button variant="destructive" size="sm" @click="removeRuleGroup(index)">
                删除
              </Button>
            </CardHeader>
            <CardContent class="space-y-2">
              <p class="text-sm text-muted-foreground">
                类型: {{ group.type === 'ai' ? 'AI 规则' : '手动规则' }}
              </p>
              <div v-if="group.commentTexts?.length">
                <p class="text-sm font-medium">评论内容:</p>
                <ul class="text-sm text-muted-foreground list-disc list-inside">
                  <li v-for="(text, i) in group.commentTexts" :key="i">{{ text }}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="block" class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>视频描述屏蔽词</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex gap-2">
                <Input v-model="newBlockKeyword" placeholder="输入屏蔽词" @keyup.enter="addBlockKeyword" />
                <Button @click="addBlockKeyword">添加</Button>
              </div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="(keyword, index) in settings.blockKeywords"
                  :key="index"
                  class="px-2 py-1 bg-secondary rounded text-sm flex items-center gap-2"
                >
                  {{ keyword }}
                  <button @click="removeBlockKeyword(index)" class="text-muted-foreground hover:text-foreground">
                    ×
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>作者名屏蔽词</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex gap-2">
                <Input v-model="newAuthorBlockKeyword" placeholder="输入屏蔽词" @keyup.enter="addAuthorBlockKeyword" />
                <Button @click="addAuthorBlockKeyword">添加</Button>
              </div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="(keyword, index) in settings.authorBlockKeywords"
                  :key="index"
                  class="px-2 py-1 bg-secondary rounded text-sm flex items-center gap-2"
                >
                  {{ keyword }}
                  <button @click="removeAuthorBlockKeyword(index)" class="text-muted-foreground hover:text-foreground">
                    ×
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI 评论设置</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex items-center justify-between">
                <Label>启用 AI 生成评论</Label>
                <Switch v-model="settings.aiCommentEnabled" />
              </div>
              <p class="text-sm text-muted-foreground">
                启用后，评论内容将由 AI 根据视频内容实时生成，而非使用规则组中的固定评论
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div class="flex gap-4 justify-center">
        <Button size="lg" @click="startTask" :disabled="taskStore.isRunning">
          {{ taskStore.isRunning ? '任务运行中...' : '启动任务' }}
        </Button>
        <Button size="lg" variant="destructive" @click="stopTask" :disabled="!taskStore.isRunning">
          停止任务
        </Button>
      </div>

      <div v-if="taskStore.isRunning" class="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>实时日志</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="h-64 overflow-y-auto font-mono text-sm space-y-1">
              <div v-for="(log, index) in taskStore.logs" :key="index">
                {{ log.message }}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>