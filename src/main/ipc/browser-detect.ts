import { ipcMain } from 'electron'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

interface BrowserInfo {
  path: string
  name: string
  version: string
}

const COMMON_PATHS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome\\chrome.exe',
    'C:\\Program Files\\Chromium\\chromium.exe',
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Chromium\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ]
}

function getVersionFromExe(path: string): string {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`"${path}" --version`, { encoding: 'utf-8', timeout: 5000 })
      return output.trim().replace(/.*?(\d+\.\d+\.\d+\.\d+).*/, '$1')
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function detectFromRegistry(): BrowserInfo[] {
  const browsers: BrowserInfo[] = []

  if (process.platform !== 'win32') return browsers

  try {
    const regPaths = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
    ]

    for (const regPath of regPaths) {
      try {
        const output = execSync(`reg query "${regPath}" /ve`, { encoding: 'utf-8', timeout: 5000 })
        const match = output.match(/REG_SZ\s+(.+)/i)
        if (match && existsSync(match[1].trim())) {
          const path = match[1].trim()
          const name = path.includes('Edge') ? 'Microsoft Edge' : 'Google Chrome'
          browsers.push({
            path,
            name,
            version: getVersionFromExe(path)
          })
        }
      } catch {
        // Registry key not found
      }
    }
  } catch {
    // Registry access denied
  }

  return browsers
}

function detectFromCommonPaths(): BrowserInfo[] {
  const browsers: BrowserInfo[] = []
  const paths = COMMON_PATHS[process.platform as keyof typeof COMMON_PATHS] || []

  for (const path of paths) {
    if (existsSync(path)) {
      const name = path.includes('Edge') ? 'Microsoft Edge'
        : path.includes('Chromium') ? 'Chromium'
        : 'Google Chrome'
      
      if (!browsers.find(b => b.name === name)) {
        browsers.push({
          path,
          name,
          version: getVersionFromExe(path)
        })
      }
    }
  }

  return browsers
}

export function registerBrowserDetectIPC(): void {
  ipcMain.handle('browser:detect', async (): Promise<BrowserInfo[]> => {
    const fromRegistry = detectFromRegistry()
    const fromPaths = detectFromCommonPaths()

    const allBrowsers = [...fromRegistry, ...fromPaths]
    const unique = allBrowsers.filter((browser, index, self) =>
      index === self.findIndex(b => b.name === browser.name)
    )

    return unique
  })
}
