import { BrowserWindow } from 'electron'
import { store, StorageKey } from '../utils/storage'
import type { Account } from '../../shared/account'
import log from 'electron-log/main'

interface AccountStatusResult {
  accountId: string
  status: 'active' | 'inactive' | 'expired' | 'checking'
  expiresAt?: number
  message?: string
}

/**
 * 检查单个账号的登录态状态
 * 通过分析 storageState 中的 cookie 过期时间来判断
 */
export async function checkAccountLoginStatus(account: Account): Promise<AccountStatusResult> {
  if (!account.storageState) {
    return { accountId: account.id, status: 'inactive', message: '无登录状态数据' }
  }

  try {
    const state = typeof account.storageState === 'string'
      ? JSON.parse(account.storageState)
      : account.storageState

    const cookies = state?.cookies || []
    if (cookies.length === 0) {
      return { accountId: account.id, status: 'inactive', message: '无Cookie数据' }
    }

    // 查找关键的登录态 cookie 的过期时间
    const now = Math.floor(Date.now() / 1000)
    let earliestExpiry = Infinity
    let hasLoginCookie = false

    // 抖音关键 cookie
    const loginCookieNames = ['sessionid', 'sessionid_ss', 'passport_csrf_token', 'sid_guard']
    
    for (const cookie of cookies) {
      const name = cookie.name?.toLowerCase() || ''
      if (loginCookieNames.some(n => name.includes(n))) {
        hasLoginCookie = true
        if (cookie.expires && cookie.expires > 0 && cookie.expires < earliestExpiry) {
          earliestExpiry = cookie.expires
        }
      }
    }

    if (!hasLoginCookie) {
      return { accountId: account.id, status: 'inactive', message: '未找到登录Cookie' }
    }

    if (earliestExpiry === Infinity) {
      // 会话cookie，无过期时间
      return { accountId: account.id, status: 'active', message: '会话Cookie有效' }
    }

    if (earliestExpiry <= now) {
      return { accountId: account.id, status: 'expired', expiresAt: earliestExpiry * 1000, message: '登录态已过期' }
    }

    // 即将过期（24小时内）
    const willExpireSoon = earliestExpiry - now < 86400
    return {
      accountId: account.id,
      status: willExpireSoon ? 'expired' : 'active',
      expiresAt: earliestExpiry * 1000,
      message: willExpireSoon ? '登录态即将过期' : '登录态有效'
    }
  } catch (e) {
    log.error(`[AccountMonitor] Failed to check status for account ${account.id}:`, e)
    return { accountId: account.id, status: 'inactive', message: '检查失败' }
  }
}

/**
 * 检查所有账号状态并通知渲染进程
 */
export async function checkAllAccountStatuses(): Promise<AccountStatusResult[]> {
  const accounts = (store.get(StorageKey.ACCOUNTS) as Account[]) || []
  const results: AccountStatusResult[] = []

  for (const account of accounts) {
    const result = await checkAccountLoginStatus(account)
    results.push(result)

    // 更新账号状态
    if (account.status !== result.status) {
      const accounts = (store.get(StorageKey.ACCOUNTS) as Account[]) || []
      const idx = accounts.findIndex(a => a.id === account.id)
      if (idx !== -1) {
        accounts[idx].status = result.status
        if (result.expiresAt) {
          accounts[idx].expiresAt = result.expiresAt
        }
        store.set(StorageKey.ACCOUNTS, accounts)

        // 通知渲染进程账号状态变化
        const windows = BrowserWindow.getAllWindows()
        windows.forEach((win) => {
          win.webContents.send('account:statusChanged', {
            accountId: account.id,
            status: result.status,
            expiresAt: result.expiresAt
          })
        })
        log.info(`[AccountMonitor] Account ${account.id} status changed to ${result.status}, notified ${windows.length} windows`)
      }
    }
  }

  // 通知渲染进程
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((win) => {
    win.webContents.send('account:statusUpdate', results)
  })

  return results
}
