import type { Platform } from './platform'

/**
 * 浏览器存储状态类型
 * 用于保存登录态的 cookies 和 localStorage 数据
 */
export interface BrowserStorageState {
  cookies?: Array<{
    name: string
    value: string
    domain?: string
    path?: string
    expires?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
  }>
  origins?: Array<{
    origin: string
    localStorage?: Array<{ name: string; value: string }>
  }>
}

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

export interface AccountListItem {
  id: string
  name: string
  platform: Platform
  platformAccountId?: string
  avatar?: string
  createdAt: number
  isDefault: boolean
  status: 'active' | 'inactive' | 'expired' | 'checking'
  expiresAt?: number
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
