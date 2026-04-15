<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAccountStore } from '@/stores/account'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { Plus, MoreVertical, Star, Trash2, UserCircle, LogIn, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const accountStore = useAccountStore()

const isLoggingIn = ref(false)

onMounted(async () => {
  await accountStore.loadAccounts()
})

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
  isLoggingIn.value = true
  toast.info('正在打开浏览器，请在新窗口中登录抖音...')

  try {
    const result = await window.api.login.douyin()
    console.log('Login result:', result)

    if (!result.success) {
      toast.error(result.error || '登录失败')
      return
    }

    const accountData = {
      name: result.userInfo?.nickname || '抖音用户',
      platform: 'douyin' as const,
      avatar: result.userInfo?.avatar,
      storageState: result.storageState,
      isDefault: accountStore.accounts.length === 0
    }
    console.log('Account data to save:', accountData)

    const savedAccount = await accountStore.addAccount(accountData)
    console.log('Saved account:', savedAccount)
    toast.success(`账号 "${accountData.name}" 添加成功！`)
    await accountStore.loadAccounts()
    console.log('Accounts after reload:', accountStore.accounts)
  } catch (error) {
    console.error('Login error:', error)
    toast.error('登录过程发生错误: ' + (error as Error).message)
  } finally {
    isLoggingIn.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">账号管理</h1>
        <p class="text-sm text-muted-foreground">管理多个抖音账号</p>
      </div>
      <Button @click="handleLogin" :disabled="isLoggingIn">
        <Loader2 v-if="isLoggingIn" class="w-4 h-4 mr-2 animate-spin" />
        <LogIn v-else class="w-4 h-4 mr-2" />
        {{ isLoggingIn ? '登录中...' : '添加账号' }}
      </Button>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>账号列表</CardTitle>
        <CardDescription>已添加的抖音账号，点击星标设为默认</CardDescription>
      </CardHeader>
      <CardContent>
        <Table v-if="accountStore.accounts.length > 0">
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
            <TableRow v-for="account in accountStore.accounts" :key="account.id">
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
                    <div class="text-xs text-muted-foreground">{{ (account as any).uniqueId || (account as any).phone || 'N/A' }}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge :variant="(account as any).status === 'active' ? 'default' : 'secondary'">
                  {{ (account as any).status === 'active' ? '正常' : '未激活' }}
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
        <div v-else class="text-center py-12 text-muted-foreground">
          <UserCircle class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>暂无账号</p>
          <p class="text-sm">点击上方"添加账号"按钮登录抖音</p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
