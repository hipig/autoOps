import { ipcMain } from 'electron'
import { store, StorageKey } from '../utils/storage'

export interface Account {
  id: string
  name: string
  platform: 'douyin'
  avatar?: string
  storageState: unknown
  createdAt: number
  isDefault: boolean
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
    const accounts = getAccounts()
    const newAccount: Account = {
      ...account,
      id: generateId(),
      createdAt: Date.now(),
      isDefault: accounts.length === 0
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
}
