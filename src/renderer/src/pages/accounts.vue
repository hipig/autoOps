<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { useAccountStore } from '@/stores/account'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Plus, MoreVertical, Star, Trash2, UserCircle, LogIn, Loader2, RefreshCw, Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { Platform } from '@../../shared/platform'

const accountStore = useAccountStore()
const isLoggingIn = ref(false)
const isCheckingStatus = ref(false)
const selectedPlatform = ref<Platform>('douyin')

// 平台登录支持状态
const PLATFORM_LOGIN_SUPPORT: Record<Platform, boolean> = {
  douyin: true,
  kuaishou: false,
  xiaohongshu: false,
  wechat: false
}

const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
  wechat: '微信视频号'
}

const accountsByPlatform = computed(() => {
  return accountStore.accountsByPlatform
})

const platformList = computed(() => {
  const platforms = Object.keys(accountsByPlatform.value)
  if (platforms.length === 0) return ['douyin']
  return platforms
})

// 监听账号状态变化
let cleanupStatusListener: (() => void) | null = null

onMounted(async () => {
  await accountStore.loadAccounts()
  // 初始化账号状态变化监听
  cleanupStatusListener = accountStore.initStatusChangeListener()
})

onUnmounted(() => {
  // 清理监听器
  if (cleanupStatusListener) {
    cleanupStatusListener()
  }
})

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'active': return ShieldCheck
    case 'expired': return ShieldAlert
    case 'checking': return RefreshCw
    default: return ShieldX
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'active': return '正常'
    case 'expired': return '已过期'
    case 'checking': return '检查中'
    case 'inactive': return '未激活'
    default: return '未知'
  }
}

const getStatusVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'active': return 'default'
    case 'expired': return 'destructive'
    case 'checking': return 'secondary'
    default: return 'outline'
  }
}

const handleDelete = async (id: string) => {
  try {
    await accountStore.deleteAccount(id)
    toast.success('账号已删除')
  } catch (error) {
    toast.error('删除失败')
  }
}

const handleSetDefault = async (id: string) => {
  try {
    await accountStore.setDefaultAccount(id)
    toast.success('已设为默认账号')
  } catch (error) {
    toast.error('设置失败')
  }
}

const handleLogin = async () => {
  // 检查平台登录是否支持
  if (!PLATFORM_LOGIN_SUPPORT[selectedPlatform.value]) {
    toast.info(`${PLATFORM_LABELS[selectedPlatform.value]} 登录即将支持，敬请期待`)
    return
  }

  isLoggingIn.value = true
  toast.info(`正在打开浏览器，请在新窗口中登录${PLATFORM_LABELS[selectedPlatform.value]}...`)

  try {
    let result
    
    // 根据选择的平台调用对应的登录方法
    switch (selectedPlatform.value) {
      case 'douyin':
        result = await window.api.login.douyin()
        break
      default:
        toast.error(`${PLATFORM_LABELS[selectedPlatform.value]} 登录功能尚未实现`)
        isLoggingIn.value = false
        return
    }

    if (!result.success) {
      toast.error(result.error || '登录失败')
      return
    }

    const accountData = {
      name: result.userInfo?.nickname || `${PLATFORM_LABELS[selectedPlatform.value]}用户`,
      platform: selectedPlatform.value,
      platformAccountId: result.userInfo?.uniqueId, // 提取 platformAccountId
      avatar: result.userInfo?.avatar,
      storageState: result.storageState,
      isDefault: accountStore.accounts.length === 0,
      status: 'active' as const
    }

    const savedAccount = await accountStore.addAccount(accountData)
    toast.success(`账号 "${accountData.name}" 添加成功！`)
    await accountStore.loadAccounts()
  } catch (error) {
    toast.error('登录过程发生错误: ' + (error as Error).message)
  } finally {
    isLoggingIn.value = false
  }
}

const handleCheckStatus = async (id: string) => {
  try {
    const result = await accountStore.checkAccountStatus(id)
    toast.info(`账号状态: ${getStatusLabel(result.status)}`)
  } catch (error) {
    toast.error('检查失败')
  }
}

const handleCheckAllStatuses = async () => {
  isCheckingStatus.value = true
  try {
    await accountStore.checkAllAccountStatuses()
    toast.success('所有账号状态已更新')
  } catch (error) {
    toast.error('检查失败')
  } finally {
    isCheckingStatus.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">账号管理</h1>
        <p class="text-sm text-muted-foreground">管理多个平台账号，监控登录状态</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="handleCheckAllStatuses" :disabled="isCheckingStatus">
          <RefreshCw v-if="isCheckingStatus" class="w-4 h-4 mr-2 animate-spin" />
          <Shield v-else class="w-4 h-4 mr-2" />
          {{ isCheckingStatus ? '检查中...' : '检查状态' }}
        </Button>
        <div class="flex gap-2">
          <Select v-model="selectedPlatform">
            <SelectTrigger class="w-[140px]">
              <SelectValue placeholder="选择平台" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="douyin">抖音</SelectItem>
              <SelectItem value="kuaishou" disabled>快手（即将支持）</SelectItem>
              <SelectItem value="xiaohongshu" disabled>小红书（即将支持）</SelectItem>
              <SelectItem value="wechat" disabled>微信视频号（即将支持）</SelectItem>
            </SelectContent>
          </Select>
          <Button @click="handleLogin" :disabled="isLoggingIn">
            <Loader2 v-if="isLoggingIn" class="w-4 h-4 mr-2 animate-spin" />
            <LogIn v-else class="w-4 h-4 mr-2" />
            {{ isLoggingIn ? '登录中...' : '添加账号' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- 按平台分组显示 -->
    <div v-for="platform in platformList" :key="platform" class="mb-6">
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            {{ PLATFORM_LABELS[platform] || platform }}
            <Badge variant="secondary" class="text-xs">{{ (accountsByPlatform[platform] || []).length }} 个账号</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table v-if="(accountsByPlatform[platform] || []).length > 0">
            <TableHeader>
              <TableRow>
                <TableHead class="w-[50px]">默认</TableHead>
                <TableHead>账号信息</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>添加时间</TableHead>
                <TableHead class="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="account in (accountsByPlatform[platform] || [])" :key="account.id">
                <TableCell>
                  <button
                    @click="handleSetDefault(account.id)"
                    class="p-1 hover:bg-accent rounded"
                  >
                    <Star
                      :class="[
                        'w-4 h-4',
                        accountStore.defaultAccount?.id === account.id
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-400'
                      ]"
                    />
                  </button>
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-3">
                    <Avatar class="w-8 h-8">
                      <AvatarImage v-if="(account as any).avatar" :src="(account as any).avatar" />
                      <AvatarFallback>
                        <UserCircle class="w-6 h-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div class="font-medium">{{ (account as any).name || '未命名账号' }}</div>
                      <div class="text-xs text-muted-foreground">{{ (account as any).platformAccountId || (account as any).uniqueId || 'N/A' }}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge :variant="getStatusVariant((account as any).status || 'inactive')">
                    {{ getStatusLabel((account as any).status || 'inactive') }}
                  </Badge>
                </TableCell>
                <TableCell class="text-muted-foreground">
                  {{ (account as any).createdAt ? new Date((account as any).createdAt).toLocaleDateString('zh-CN') : 'N/A' }}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="sm" class="w-8 h-8 p-0">
                        <MoreVertical class="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>操作</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem @click="handleCheckStatus(account.id)">
                        <RefreshCw class="w-4 h-4 mr-2" />
                        检查状态
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="handleSetDefault(account.id)">
                        <Star class="w-4 h-4 mr-2" />
                        设为默认
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        @click="handleDelete(account.id)"
                        class="text-destructive"
                      >
                        <Trash2 class="w-4 h-4 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div v-else class="text-center py-8 text-muted-foreground">
            <p class="text-sm">暂无{{ PLATFORM_LABELS[platform] || platform }}账号</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 无账号时的空状态 -->
    <div v-if="accountStore.accounts.length === 0" class="text-center py-12 text-muted-foreground">
      <UserCircle class="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>暂无账号</p>
      <p class="text-sm">点击上方"添加账号"按钮登录平台</p>
    </div>
  </div>
</template>
