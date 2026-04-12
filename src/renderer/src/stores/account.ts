import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Account {
  id: string
  name: string
  platform: 'douyin'
  avatar?: string
  storageState: unknown
  createdAt: number
  isDefault: boolean
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

  return {
    accounts,
    currentAccountId,
    currentAccount,
    defaultAccount,
    loadAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    setDefaultAccount,
    setCurrentAccount
  }
})
