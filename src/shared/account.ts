import type { Platform } from './platform'

export interface Account {
  id: string
  name: string
  platform: Platform
  platformAccountId?: string
  avatar?: string
  storageState: unknown
  cookies?: Record<string, string>
  createdAt: number
  isDefault: boolean
  status: 'active' | 'inactive' | 'expired' | 'checking'
  expiresAt?: number
}

export interface AccountListItem {
  id: string
  name: string
  platform: Platform
  platformAccountId?: string
  avatar?: string
  createdAt: number
  isDefault: boolean
  status: 'active' | 'inactive' | 'expired' | 'checking'
}

export function generateAccountId(): string {
  return `acc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createAccount(data: Omit<Account, 'id' | 'createdAt'>): Account {
  return {
    ...data,
    id: generateAccountId(),
    createdAt: Date.now()
  }
}
