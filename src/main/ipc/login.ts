import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { get } from '../utils/storage'
import { StorageKey, store } from '../utils/storage'
import log from 'electron-log/main'

interface LoginResult {
  success: boolean
  storageState?: string
  error?: string
  userInfo?: {
    nickname: string
    avatar?: string
    uniqueId?: string
  }
}

async function extractNickname(page: any): Promise<string | null> {
  return page.evaluate(() => {
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
        if (nickname && nickname.length < 50) return nickname
      }
    }

    // 方法2: 备用选择器
    const selectors = [
      '[data-e2e="profile-nickname"]',
      '[class*="nickname"]',
      '[class*="user-name"]',
      '.author-name',
      '.profile-name',
      'a[href*="/user/"]',
      '[class*="header"] [class*="name"]',
      '.account-card .name',
      '.user-info .nickname',
      'h1[class*="GMEdHsXq"]'
    ]
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector)
        if (el) {
          const text = el.textContent?.trim()
          if (text && text.length > 0 && text.length < 50 && !text.includes('登录') && !text.includes('register')) {
            return text
          }
        }
      } catch {}
    }

    // 方法3: 从页面标题提取
    const title = document.title
    if (title && !title.includes('抖音') && !title.includes('登录')) {
      const match = title.match(/^([^-_|]+)/)
      if (match && match[1].trim().length < 50) {
        return match[1].trim()
      }
    }

    // 方法4: 从 URL 提取
    const url = window.location.href
    if (url.includes('/user/')) {
      const match = url.match(/\/user\/([^/?#]+)/)
      if (match) return match[1]
    }
    return null
  })
}

async function extractAvatar(page: any): Promise<string | undefined> {
  return page.evaluate(() => {
    const selectors = [
      '[data-e2e="profile-avatar"] img',
      '[class*="avatar"] img',
      '[class*="user-avatar"] img',
      'img[class*="avatar"]'
    ]
    for (const selector of selectors) {
      try {
        const img = document.querySelector(selector)
        if (img && img.getAttribute('src')) {
          return img.getAttribute('src') || undefined
        }
      } catch {}
    }
    return undefined
  })
}

async function extractUniqueId(page: any): Promise<string | undefined> {
  return page.evaluate(() => {
    // 方法1: 从文本中提取 "抖音号：xxx"
    const douyinIdText = document.body.innerText
    const douyinIdMatch = douyinIdText.match(/抖音号[：:]\s*([a-zA-Z0-9_-]+)/)
    if (douyinIdMatch) {
      return douyinIdMatch[1]
    }

    // 方法2: 从 URL 提取
    const url = window.location.href
    const patterns = [
      /\/user\/([^/?#]+)/,
      /\/user\/profile\/([^/?#]+)/,
      /\#\/follow\/([^/?#]+)/
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1] !== 'self') return match[1]
    }
    return undefined
  })
}

export function registerLoginIPC(): void {
  ipcMain.handle('login:douyin', async (): Promise<LoginResult> => {
    const browserPath = get<string | null>(StorageKey.BROWSER_EXEC_PATH)
    
    if (!browserPath) {
      return { success: false, error: '浏览器路径未配置，请先在设置中配置浏览器' }
    }

    try {
      const { chromium } = await import('@playwright/test')

      const tempUserDataDir = join(process.env.APPDATA || process.env.HOME || '', 'AutoOps', 'browser-data', 'login-temp')

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

      await page.goto('https://www.douyin.com/', { waitUntil: 'load', timeout: 60000 })
      await page.waitForTimeout(3000)

      log.info('[Login] Waiting for user to login...')

      try {
        await page.waitForURL(/\#\/follow|\/user\/|user\/profile/, { timeout: 120000 })
        log.info('[Login] Login detected, current URL:', page.url())
      } catch {
        log.info('[Login] URL wait timeout, checking current state...')
      }

      await page.waitForTimeout(3000)

      // 尝试导航到个人主页以获取更准确的信息
      try {
        const currentUrl = page.url()
        if (!currentUrl.includes('/user/')) {
          log.info('[Login] Navigating to user profile page...')
          await page.goto('https://www.douyin.com/user/self', { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForTimeout(2000)
        }
      } catch (e) {
        log.info('[Login] Failed to navigate to profile, continuing with current page')
      }

      let userInfo: LoginResult['userInfo'] = undefined

      // 重试获取 nickname，最多3次
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const nickname = await extractNickname(page)
          const avatar = await extractAvatar(page)
          const uniqueId = await extractUniqueId(page)

          if (nickname) {
            log.info(`[Login] Extracted user info (attempt ${attempt + 1})`)
            userInfo = { nickname, avatar, uniqueId }
            break
          } else {
            log.info(`[Login] No nickname found on attempt ${attempt + 1}, retrying...`)
            await page.waitForTimeout(2000)
            if (attempt < 2) {
              await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
              await page.waitForTimeout(3000)
            }
          }
        } catch (e) {
          log.info(`[Login] Failed to extract user info on attempt ${attempt + 1}:`, e)
          await page.waitForTimeout(1000)
        }
      }

      if (!userInfo) {
        log.info('[Login] All attempts failed, using default nickname')
        userInfo = { nickname: '抖音用户' }
      }

      const cookies = await context.cookies()
      log.info('[Login] Cookies count:', cookies.length)
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

      return {
        success: true,
        storageState: JSON.stringify(storageState),
        userInfo
      }
    } catch (error) {
      log.error('[Login] Douyin login error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '登录过程发生错误'
      }
    }
  })

  ipcMain.handle('login:getUrl', async () => {
    return 'https://www.douyin.com/'
  })
}
