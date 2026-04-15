import { chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { BasePlatformAdapter } from './base'
import { PLATFORM_CONFIGS, PLATFORMS } from '../../shared/platform'
import type {
  LoginResult,
  VideoInfo,
  CommentListResult,
  OperationResult,
  CommentResult
} from '../../shared/platform'
import { sleep, random } from '../utils/common'

interface XiaohongshuNote {
  id: string
  title: string
  description: string
  authorId: string
  authorName: string
  tags: string[]
  shareUrl: string
}

export class XiaohongshuPlatformAdapter extends BasePlatformAdapter {
  readonly platform = 'xiaohongshu' as const
  readonly config = PLATFORM_CONFIGS.xiaohongshu

  private browser?: Browser
  private context?: BrowserContext
  private noteCache = new Map<string, XiaohongshuNote>()
  private currentNoteStartTime = 0

  constructor() {
    super()
  }

  async login(storageState?: unknown): Promise<LoginResult> {
    this.browser = await chromium.launch({
      headless: false
    })

    this.context = await this.browser.newContext({
      storageState: storageState as any
    })

    this.page = await this.context.newPage()
    this.setPage(this.page)

    await this.page.goto(PLATFORMS.xiaohongshu.loginUrl)

    await this.page.waitForTimeout(5000)

    const isLoggedIn = await this.checkLoginStatus()

    if (isLoggedIn) {
      const nickname = await this.getNickname()
      const storageStateObj = await this.context.storageState()
      this.isLoggedIn = true

      return {
        success: true,
        userInfo: {
          nickname,
          uid: ''
        },
        storageState: storageStateObj
      }
    }

    return { success: false, error: '登录取消或失败' }
  }

  private async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false
    try {
      const loginButton = await this.page.$('.login-button')
      return !loginButton
    } catch {
      return false
    }
  }

  private async getNickname(): Promise<string> {
    if (!this.page) return ''
    try {
      const element = await this.page.$('.user-nickname')
      return element ? await element.textContent() || '' : ''
    } catch {
      return ''
    }
  }

  async setupPage(page: Page, storageState?: unknown): Promise<void> {
    this.browser = await chromium.launch({ headless: false })
    this.context = await this.browser.newContext({
      storageState: storageState as any
    })
    this.page = await this.context.newPage()
    this.setPage(this.page)
  }

  async getVideoInfo(noteId: string): Promise<VideoInfo | null> {
    const note = this.noteCache.get(noteId)
    if (!note) return null

    return {
      videoId: note.id,
      title: note.title,
      description: note.description,
      author: {
        userId: note.authorId,
        nickname: note.authorName,
        verified: false
      },
      tags: note.tags,
      likeCount: 0,
      collectCount: 0,
      shareCount: 0,
      commentCount: 0,
      shareUrl: note.shareUrl,
      createTime: Date.now()
    }
  }

  async getCommentList(noteId: string, cursor: number = 0): Promise<CommentListResult | null> {
    return null
  }

  async like(noteId: string): Promise<OperationResult> {
    if (!this.page) return { success: false, error: 'Page not initialized' }
    try {
      const likeButton = await this.page.waitForSelector(this.config.selectors.likeButton, {
        timeout: 5000
      }).catch(() => null)
      if (likeButton) {
        await likeButton.click()
        await sleep(random(500, 1000))
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async collect(noteId: string): Promise<OperationResult> {
    if (!this.page) return { success: false, error: 'Page not initialized' }
    try {
      const collectButton = await this.page.waitForSelector(this.config.selectors.collectButton, {
        timeout: 5000
      }).catch(() => null)
      if (collectButton) {
        await collectButton.click()
        await sleep(random(500, 1000))
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async follow(userId: string): Promise<OperationResult> {
    if (!this.page) return { success: false, error: 'Page not initialized' }
    try {
      const followButton = await this.page.waitForSelector(this.config.selectors.followButton, {
        timeout: 5000
      }).catch(() => null)
      if (followButton) {
        await followButton.click()
        await sleep(random(1000, 2000))
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async comment(noteId: string, content: string): Promise<CommentResult> {
    if (!this.page) return { success: false, error: 'Page not initialized' }

    try {
      await this.openCommentSection()
      await sleep(random(1000, 2000))

      const inputContainer = await this.page.waitForSelector(this.config.selectors.commentInput, {
        timeout: 5000
      }).catch(() => null)

      if (!inputContainer) {
        return { success: false, error: '未找到评论输入框' }
      }

      await inputContainer.click()
      await sleep(500)

      for (const char of content) {
        await this.page.keyboard.type(char)
        await sleep(random(50, 150))
      }

      await sleep(random(1000, 2000))

      await this.page.keyboard.press('Enter')
      await sleep(random(1000, 2000))

      await this.closeCommentSection()

      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async goToNextVideo(): Promise<void> {
    if (!this.page) return

    if (await this.isCommentSectionOpen()) {
      await this.closeCommentSection()
      await this.page.waitForTimeout(500)
    }

    await this.page.keyboard.press(this.config.keyboardShortcuts.nextVideo)
    await sleep(random(1000, 2000))
  }

  async openCommentSection(): Promise<void> {
    if (!this.page) return
    await this.page.keyboard.press(this.config.keyboardShortcuts.comment)
    await this.page.waitForTimeout(300)
  }

  async closeCommentSection(): Promise<void> {
    if (!this.page) return
    await this.page.keyboard.press(this.config.keyboardShortcuts.comment)
    await this.page.waitForTimeout(300)
  }

  async isCommentSectionOpen(): Promise<boolean> {
    if (!this.page) return false
    const commentPanel = await this.page.$(this.config.selectors.commentSection)
    if (!commentPanel) return false
    const isVisible = await commentPanel.isVisible()
    return isVisible
  }

  async getActiveVideoId(): Promise<string | null> {
    if (!this.page) return null
    const element = await this.page.$(this.config.selectors.activeVideo)
    if (!element) return null
    const noteId = await element.getAttribute(this.config.selectors.videoIdAttr)
    return noteId
  }

  async close(): Promise<void> {
    if (this.page && this.context) {
      await this.page.close()
    }
    if (this.browser) {
      await this.browser.close()
    }
    this.clearPage()
    this.browser = undefined
    this.context = undefined
  }
}
