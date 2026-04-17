import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import type { Platform } from '../../../shared/platform'
import type { BrowserStorageState } from '../../../shared/account'

export interface Account {
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

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<Account[]>([])
  const currentAccountId = ref<string | null>(null)

  const currentAccount = computed(() => {
    return accounts.value.find(a => a.id === currentAccountId.value) || null
  })

  const defaultAccount = computed(() => {
    return accounts.value.find(a => a.isDefault) || null
  })

  const accountsByPlatform = computed(() => {
    const map: Record<string, Account[]> = {}
    for (const acc of accounts.value) {
      const p = acc.platform || 'douyin'
      if (!map[p]) map[p] = []
      map[p].push(acc)
    }
    return map
  })

  async function loadAccounts() {
    const list = await window.api['account'].list()
    accounts.value = list as Account[]
    if (list.length > 0 && !currentAccountId.value) {
      const defaultAcc = list.find((a: Account) => a.isDefault)
      currentAccountId.value = defaultAcc?.id || (list[0] as Account).id
    }
  }

  async function addAccount(account: Omit<Account, 'id' | 'createdAt'>) {
    const result = await window.api['account'].add(account) as Account
    accounts.value.push(result)
    return result
  }

  async function updateAccount(id: string, updates: Partial<Account>) {
    const result = await window.api['account'].update(id, updates) as Account
    const index = accounts.value.findIndex(a => a.id === id)
    if (index !== -1) {
      accounts.value[index] = result
    }
    return result
  }

  async function deleteAccount(id: string) {
    await window.api['account'].delete(id)
    accounts.value = accounts.value.filter(a => a.id !== id)
    if (currentAccountId.value === id) {
      currentAccountId.value = accounts.value[0]?.id || null
    }
  }

  async function setDefaultAccount(id: string) {
    await window.api['account'].setDefault(id)
    accounts.value.forEach(a => {
      a.isDefault = a.id === id
    })
  }

  function setCurrentAccount(id: string | null) {
    currentAccountId.value = id
  }

  async function checkAccountStatus(id: string) {
    try {
      const result = await window.api.account.checkStatus(id)
      const account = accounts.value.find(a => a.id === id)
      if (account) {
        account.status = result.status as Account['status']
        if (result.expiresAt) {
          account.expiresAt = result.expiresAt
        }
      }
      return result
    } catch {
      return { status: 'unknown' }
    }
  }

  async function checkAllAccountStatuses() {
    const promises = accounts.value
      .filter(a => a.status === 'active' || a.status === 'expired')
      .map(a => checkAccountStatus(a.id))
    await Promise.all(promises)
  }

  function getAccountsByPlatform(platform: Platform): Account[] {
    return accounts.value.filter(a => a.platform === platform)
  }

  /**
   * 初始化账号状态变化监听
   * 返回清除函数，应在组件卸载时调用
   */
  function initStatusChangeListener(): () => void {
    const cleanup = window.api.account.onStatusChanged((data) => {
      const account = accounts.value.find(a => a.id === data.accountId)
      if (account) {
        account.status = data.status as Account['status']
        if (data.expiresAt) {
          account.expiresAt = data.expiresAt
        }
      }
    })
    return cleanup
  }

  return {
    accounts,
    currentAccountId,
    currentAccount,
    defaultAccount,
    accountsByPlatform,
    loadAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    setCurrentAccount,
    checkAccountStatus,
    checkAllAccountStatuses,
    getAccountsByPlatform,
    initStatusChangeListener
  }
})
