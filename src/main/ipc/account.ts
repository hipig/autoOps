import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'
import type { Platform } from '../../shared/platform'
import type { BrowserStorageState } from '../../shared/account'
import { checkAccountLoginStatus, checkAllAccountStatuses } from '../service/account-monitor'

interface Account {
  id: string
  name: string
  platform: Platform
  platformAccountId?: string
  avatar?: string
  storageState: BrowserStorageState | string | null
  cookies?: Record<string, string>
  createdAt: number
  isDefault: boolean
  status: 'active' | 'inactive' | 'expired' | 'checking'
  expiresAt?: number
}

/**
 * 验证 storageState 是否有效
 * 检查是否包含有效的 cookies 数据
 */
function validateStorageState(storageState: unknown): { valid: boolean; error?: string } {
  if (!storageState) {
    return { valid: false, error: 'storageState 不能为空' }
  }

  let parsedState: BrowserStorageState | null = null

  // 如果是字符串，尝试解析
  if (typeof storageState === 'string') {
    try {
      parsedState = JSON.parse(storageState)
    } catch {
      return { valid: false, error: 'storageState JSON 解析失败' }
    }
  } else if (typeof storageState === 'object') {
    parsedState = storageState as BrowserStorageState
  } else {
    return { valid: false, error: 'storageState 格式无效' }
  }

  // 检查是否包含 cookies 数组
  if (!parsedState || !Array.isArray(parsedState.cookies)) {
    return { valid: false, error: 'storageState 必须包含 cookies 数组' }
  }

  // 检查 cookies 是否为空
  if (parsedState.cookies.length === 0) {
    return { valid: false, error: 'storageState.cookies 不能为空' }
  }

  return { valid: true }
}

function getAccounts(): Account[] {
  return (store.get(StorageKey.ACCOUNTS) as Account[]) || []
}

function setAccounts(accounts: Account[]): void {
  store.set(StorageKey.ACCOUNTS, accounts)
}

function generateId(): string {
  return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function registerAccountIPC(): void {
  ipcMain.handle('account:list', async (): Promise<Account[]> => {
    return getAccounts()
  })

  ipcMain.handle('account:add', async (_, account: Omit<Account, 'id' | 'createdAt'>): Promise<Account> => {
    // 验证 storageState
    const validation = validateStorageState(account.storageState)
    if (!validation.valid) {
      throw new Error(validation.error || 'storageState 验证失败')
    }

    const accounts = getAccounts()
    const newAccount: Account = {
      ...account,
      id: generateId(),
      createdAt: Date.now(),
      isDefault: accounts.length === 0,
      status: account.status || 'active'
    }
    accounts.push(newAccount)
    setAccounts(accounts)
    return newAccount
  })

  ipcMain.handle('account:update', async (_, id: string, updates: Partial<Account>): Promise<Account> => {
    const accounts = getAccounts()
    const index = accounts.findIndex(a => a.id === id)
    if (index === -1) {
      throw new Error('Account not found')
    }
    accounts[index] = { ...accounts[index], ...updates }
    setAccounts(accounts)
    return accounts[index]
  })

  ipcMain.handle('account:delete', async (_, id: string): Promise<{ success: boolean }> => {
    const accounts = getAccounts()
    const filtered = accounts.filter(a => a.id !== id)
    if (filtered.length > 0 && !filtered.some(a => a.isDefault)) {
      filtered[0].isDefault = true
    }
    setAccounts(filtered)
    return { success: true }
  })

  ipcMain.handle('account:setDefault', async (_, id: string): Promise<{ success: boolean }> => {
    const accounts = getAccounts()
    accounts.forEach(a => {
      a.isDefault = a.id === id
    })
    setAccounts(accounts)
    return { success: true }
  })

  ipcMain.handle('account:getDefault', async (): Promise<Account | null> => {
    const accounts = getAccounts()
    return accounts.find(a => a.isDefault) || accounts[0] || null
  })

  ipcMain.handle('account:getById', async (_, id: string): Promise<Account | null> => {
    const accounts = getAccounts()
    return accounts.find(a => a.id === id) || null
  })

  ipcMain.handle('account:getByPlatform', async (_, platform: Platform): Promise<Account[]> => {
    const accounts = getAccounts()
    return accounts.filter(a => a.platform === platform)
  })

  ipcMain.handle('account:getActiveAccounts', async (): Promise<Account[]> => {
    const accounts = getAccounts()
    return accounts.filter(a => a.status === 'active')
  })

  // 账号状态检查
  ipcMain.handle('account:check-status', async (_, id: string) => {
    const accounts = getAccounts()
    const account = accounts.find(a => a.id === id)
    if (!account) {
      return { status: 'inactive', message: 'Account not found' }
    }
    const result = await checkAccountLoginStatus(account as any)
    // 更新存储
    if (result.status !== account.status) {
      const idx = accounts.findIndex(a => a.id === id)
      if (idx !== -1) {
        accounts[idx].status = result.status
        if (result.expiresAt) {
          accounts[idx].expiresAt = result.expiresAt
        }
        setAccounts(accounts)
      }
    }
    return result
  })

  // 批量检查所有账号状态
  ipcMain.handle('account:check-all-status', async () => {
    return await checkAllAccountStatuses()
  })
}
