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
    const selectors = [
      '[data-e2e="profile-nickname"]',
      '[class*="nickname"]',
      '[class*="user-name"]',
      '.author-name',
      '.profile-name',
      'a[href*="/user/"]',
      '[class*="header"] [class*="name"]'
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
    const url = window.location.href
    const patterns = [
      /\/user\/([^/?#]+)/,
      /\/user\/profile\/([^/?#]+)/,
      /\#\/follow\/([^/?#]+)/
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
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

      await page.waitForTimeout(2000)

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
