import { ipcMain } from 'electron'
import { join } from 'path'
import { get } from '../utils/storage'
import { StorageKey } from '../utils/storage'

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

      console.log('Waiting for user to login...')

      try {
        await page.waitForURL(/\#\/follow|\/user\/|user\/profile/, { timeout: 120000 })
        console.log('Login detected, current URL:', page.url())
      } catch (e) {
        console.log('URL wait timeout, checking current state...')
      }

      let userInfo: LoginResult['userInfo'] = undefined

      try {
        const pageContent = await page.content()
        console.log('Page loaded, content length:', pageContent.length)

        const nickname = await page.evaluate(() => {
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

        const avatar = await page.evaluate(() => {
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
                return img.getAttribute('src')
              }
            } catch {}
          }
          return undefined
        })

        const uniqueId = await page.evaluate(() => {
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

        console.log('Extracted user info:', { nickname, avatar, uniqueId })

        if (nickname) {
          userInfo = { nickname, avatar, uniqueId }
        } else {
          console.log('No nickname found, using default')
          userInfo = { nickname: '抖音用户', avatar, uniqueId }
        }
      } catch (e) {
        console.log('Failed to extract user info:', e)
        userInfo = { nickname: '抖音用户' }
      }

      const cookies = await context.cookies()
      console.log('Cookies count:', cookies.length)
      const storageState = {
        cookies: cookies.map((c: { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: string }) => ({
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
      console.log('StorageState prepared, cookies:', storageState.cookies.length)

      await context.close()

      console.log('Returning result:', { success: true, userInfo })
      return {
        success: true,
        storageState: JSON.stringify(storageState),
        userInfo
      }
    } catch (error) {
      console.error('Douyin login error:', error)
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
