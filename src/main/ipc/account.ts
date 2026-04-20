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

  // 更新账号信息（重新登录获取最新信息）
  ipcMain.handle('account:refresh-info', async (_, id: string): Promise<{ success: boolean; error?: string; account?: Account }> => {
    const accounts = getAccounts()
    const account = accounts.find(a => a.id === id)
    if (!account) {
      return { success: false, error: 'Account not found' }
    }

    try {
      const { chromium } = await import('@playwright/test')
      const { join } = await import('path')
      const browserPath = store.get(StorageKey.BROWSER_EXEC_PATH) as string | null

      if (!browserPath) {
        return { success: false, error: '浏览器路径未配置' }
      }

      // 创建临时用户数据目录用于重新登录
      const tempUserDataDir = join(process.env.APPDATA || process.env.HOME || '', 'AutoOps', 'browser-data', `refresh-${id}`)

      const context = await chromium.launchPersistentContext(tempUserDataDir, {
        executablePath: browserPath,
        headless: false,
        viewport: { width: 1280, height: 800 },
        screen: { width: 1280, height: 800 },
        args: [
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      })

      const page = context.pages()[0] || await context.newPage()

      // 导航到抖音首页，让用户重新登录
      await page.goto('https://www.douyin.com/', { waitUntil: 'load', timeout: 60000 })
      await page.waitForTimeout(3000)

      // 等待用户登录
      try {
        await page.waitForURL(/\#\/follow|\/user\/|user\/profile/, { timeout: 120000 })
      } catch {
        // 超时或用户取消
      }

      await page.waitForTimeout(3000)

      // 尝试导航到个人主页
      try {
        const currentUrl = page.url()
        if (!currentUrl.includes('/user/')) {
          await page.goto('https://www.douyin.com/user/self', { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForTimeout(2000)
        }
      } catch (e) {
        // 继续
      }

      // 提取用户信息
      const userInfo = await page.evaluate(() => {
        // 智能提取昵称
        let nickname = ''

        // 方法1: 从 data-e2e="user-info" 容器中提取 h1
        const userInfoContainer = document.querySelector('[data-e2e="user-info"]')
        if (userInfoContainer) {
          const h1 = userInfoContainer.querySelector('h1')
          if (h1) {
            // 递归获取所有文本节点
            const getText = (el: Element): string => {
              let text = ''
              el.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                  text += node.textContent || ''
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                  text += getText(node as Element)
                }
              })
              return text
            }
            nickname = getText(h1).trim()
          }
        }

        // 方法2: 备用选择器
        if (!nickname) {
          const selectors = [
            '[data-e2e="user-info"] h1',
            '[class*="nickname"]',
            '.account-card .name',
            '.user-info .nickname',
            'h1[class*="GMEdHsXq"]'
          ]

          for (const selector of selectors) {
            const el = document.querySelector(selector)
            if (el?.textContent?.trim()) {
              nickname = el.textContent.trim()
              break
            }
          }
        }

        // 智能提取头像
        let avatar = ''
        const avatarSelectors = [
          '[data-e2e="user-avatar"] img',
          '[data-e2e="profile-avatar"] img',
          '[data-e2e="live-avatar"] img',
          '[class*="avatar"] img',
          'img[class*="avatar"]',
          '.user-info img',
          '[data-e2e="user-info"] ~ div img'
        ]

        for (const selector of avatarSelectors) {
          const img = document.querySelector(selector) as HTMLImageElement
          if (img?.src && !img.src.includes('icon') && !img.src.includes('svg')) {
            avatar = img.src
            break
          }
        }

        // 智能提取抖音号
        let uniqueId = ''

        // 方法1: 从文本中提取 "抖音号：xxx"
        const douyinIdText = document.body.innerText
        const douyinIdMatch = douyinIdText.match(/抖音号[：:]\s*([a-zA-Z0-9_-]+)/)
        if (douyinIdMatch) {
          uniqueId = douyinIdMatch[1]
        }

        // 方法2: 从 URL 提取
        if (!uniqueId) {
          const url = window.location.href
          const patterns = [
            /\/user\/([^/?#]+)/,
            /\/user\/profile\/([^/?#]+)/,
            /\#\/follow\/([^/?#]+)/
          ]
          for (const pattern of patterns) {
            const match = url.match(pattern)
            if (match && match[1] !== 'self') {
              uniqueId = match[1]
              break
            }
          }
        }

        return { nickname, avatar, uniqueId }
      })

      // 获取新的 cookies 和 storageState
      const cookies = await context.cookies()
      const storageState = {
        cookies: cookies.map((c: any) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite as 'Strict' | 'Lax' | 'None'
        })),
        origins: []
      }

      await context.close()

      if (userInfo.nickname) {
        // 更新账号信息，包括新的 storageState
        const idx = accounts.findIndex(a => a.id === id)
        if (idx !== -1) {
          accounts[idx].name = userInfo.nickname
          accounts[idx].avatar = userInfo.avatar
          accounts[idx].platformAccountId = userInfo.uniqueId
          accounts[idx].storageState = JSON.stringify(storageState)
          accounts[idx].status = 'active'
          setAccounts(accounts)
          return { success: true, account: accounts[idx] }
        }
      }

      return { success: false, error: '无法获取用户信息，可能未完成登录' }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}
