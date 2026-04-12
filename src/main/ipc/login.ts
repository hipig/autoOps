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
      const { chromium } = await import('playwright')
      
      const tempUserDataDir = join(process.env.APPDATA || process.env.HOME || '', 'AutoOps', 'browser-data', 'login-temp')

      const browser = await chromium.launch({
        executablePath: browserPath,
        headless: false,
        args: [
          `--user-data-dir=${tempUserDataDir}`,
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      })

      const context = await browser.newContext({
        viewport: { width: 400, height: 720 },
        screen: { width: 400, height: 720 }
      })

      const page = await context.newPage()

      await page.goto('https://www.douyin.com/', { waitUntil: 'networkidle', timeout: 30000 })

      await page.waitForURL(/\#\/follow|\/user/, { timeout: 120000 }).catch(() => {
        console.log('Waiting for user to login...')
      })

      const currentUrl = page.url()
      console.log('Current URL after login attempt:', currentUrl)

      let userInfo: LoginResult['userInfo'] = undefined

      try {
        await page.waitForSelector('[class*="avatar"]', { timeout: 10000 }).catch(() => null)
        
        const nickname = await page.evaluate(() => {
          const elements = document.querySelectorAll('[class*="nickname"], [class*="name"]')
          for (const el of elements) {
            const text = el.textContent?.trim()
            if (text && text.length > 0 && text.length < 50) {
              return text
            }
          }
          return null
        })

        const avatar = await page.evaluate(() => {
          const img = document.querySelector('[class*="avatar"] img, [class*="user-avatar"] img, img[class*="avatar"]')
          return img?.getAttribute('src') || undefined
        })

        const uniqueId = await page.evaluate(() => {
          const url = window.location.href
          const match = url.match(/\/user\/([^/?#]+)/)
          return match ? match[1] : undefined
        })

        if (nickname) {
          userInfo = { nickname, avatar, uniqueId }
          console.log('Extracted user info:', userInfo)
        }
      } catch (e) {
        console.log('Failed to extract user info:', e)
      }

      const cookies = await context.cookies()
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

      await browser.close()

      return {
        success: true,
        storageState: JSON.stringify(storageState),
        userInfo: userInfo || { nickname: '抖音用户' }
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
