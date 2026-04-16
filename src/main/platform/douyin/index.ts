import { chromium, Browser, BrowserContext, Page, type Response } from '@playwright/test'
import { BasePlatformAdapter, TaskConfig, VideoRecord } from '../base'
import { PLATFORM_CONFIGS, PLATFORMS } from '../../../shared/platform'
import type {
  LoginResult,
  VideoInfo,
  CommentListResult,
  CommentInfo,
  OperationResult,
  CommentResult
} from '../../../shared/platform'
import { sleep, random, generateId } from '../../utils/common'
import { store, StorageKey } from '../../utils/storage'
import log from 'electron-log/main'

interface DouyinFeedItem {
  aweme_id: string
  aweme_type: number
  desc: string
  author: {
    nickname: string
    uid: string
  }
  video_tag: Array<{ tag_name: string }>
  share_url: string
}

interface DouyinCommentResponse {
  status_code: number
  comments: Array<{
    cid: string
    text: string
    create_time: number
    digg_count: number
    user: { nickname: string }
    ip_label: string
  }>
  cursor: number
  has_more: number
  total: number
}

export class DouyinPlatformAdapter extends BasePlatformAdapter {
  readonly platform = 'douyin' as const
  readonly config = PLATFORM_CONFIGS.douyin

  private browser?: Browser
  private context?: BrowserContext
  private videoCache = new Map<string, DouyinFeedItem>()
  private currentVideoStartTime = 0

  constructor() {
    super()
  }

  async login(storageState?: unknown): Promise<LoginResult> {
    this.browser = await chromium.launch({
      headless: false
    })

    const context = await this.browser.newContext({
      storageState: storageState as any
    })

    const page = await context.newPage()
    this.setPage(page)

    await page.goto(PLATFORMS.douyin.loginUrl)
    await page.waitForSelector(this.config.selectors.loginPanel!, { state: 'detached' }).catch(() => null)

    const loggedIn = !(await page.$(this.config.selectors.loginPanel!))

    if (loggedIn) {
      const nickname = await this.getNickname()
      const avatar = await this.getAvatar()
      const storageStateObj = await context.storageState()
      this.isLoggedIn = true

      return {
        success: true,
        userInfo: {
          nickname,
          avatar,
          uid: ''
        },
        storageState: storageStateObj
      }
    }

    await this.browser.close()
    return { success: false, error: '登录取消或失败' }
  }

  private async getNickname(): Promise<string> {
    if (!this.page) return ''
    try {
      const element = await this.page.$('[data-e2e="profile-nickname"]')
      return element ? await element.textContent() || '' : ''
    } catch {
      return ''
    }
  }

  private async getAvatar(): Promise<string | undefined> {
    if (!this.page) return undefined
    try {
      const element = await this.page.$('[data-e2e="profile-avatar"] img')
      return element ? await element.getAttribute('src') || undefined : undefined
    } catch {
      return undefined
    }
  }

  async setupPage(page: Page, storageState?: unknown): Promise<void> {
    this.context = await this.browser!.newContext({
      storageState: storageState as any
    })
    this.page = await this.context.newPage()
    this.setPage(this.page)
    await this.setupVideoDataListener()
  }

  private async setupVideoDataListener(): Promise<void> {
    if (!this.page) return

    this.page.on('response', async (response: Response) => {
      const url = response.url()
      if (url.includes('https://www.douyin.com/aweme/v1/web/tab/feed/')) {
        try {
          const body = await response.json() as { aweme_list: DouyinFeedItem[] }
          if (body?.aweme_list) {
            body.aweme_list.forEach((video) => {
              this.videoCache.set(video.aweme_id, video)
            })
          }
        } catch {
        }
      }
    })
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo | null> {
    const feedItem = this.videoCache.get(videoId)
    if (!feedItem) return null

    return {
      videoId: feedItem.aweme_id,
      title: feedItem.desc,
      description: feedItem.desc,
      author: {
        userId: feedItem.author.uid,
        nickname: feedItem.author.nickname,
        verified: false
      },
      tags: feedItem.video_tag.map(t => t.tag_name),
      likeCount: 0,
      collectCount: 0,
      shareCount: 0,
      commentCount: 0,
      shareUrl: feedItem.share_url,
      createTime: Date.now()
    }
  }

  async getCommentList(videoId: string, cursor: number = 0): Promise<CommentListResult | null> {
    if (!this.page) return null

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.page?.removeListener('response', listener)
        resolve(null)
      }, 10000)

      const listener = async (response: Response) => {
        const url = response.url()
        if (url.includes('https://www.douyin.com/aweme/v1/web/comment/list/')) {
          clearTimeout(timeoutId)
          this.page?.removeListener('response', listener)
          try {
            const body = await response.json() as DouyinCommentResponse
            const result: CommentListResult = {
              comments: body.comments.map(c => ({
                commentId: c.cid,
                userId: '',
                nickname: c.user.nickname,
                content: c.text,
                likeCount: c.digg_count,
                createTime: c.create_time,
                ipLabel: c.ip_label
              })),
              cursor: body.cursor,
              hasMore: body.has_more === 1,
              total: body.total
            }
            resolve(result)
          } catch {
            resolve(null)
          }
        }
      }

      this.page?.on('response', listener)
    })
  }

  async like(videoId: string): Promise<OperationResult> {
    if (!this.page) return { success: false, error: 'Page not initialized' }
    try {
      await this.page.keyboard.press(this.config.keyboardShortcuts.like)
      await sleep(200)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async collect(videoId: string): Promise<OperationResult> {
    if (!this.page) return { success: false, error: 'Page not initialized' }
    try {
      await this.page.keyboard.press(this.config.keyboardShortcuts.collect)
      await sleep(200)
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

  async comment(videoId: string, content: string): Promise<CommentResult> {
    if (!this.page) return { success: false, error: 'Page not initialized' }

    try {
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
        await sleep(random(100, 300))
        if (Math.random() < 0.1) {
          await sleep(random(300, 800))
        }
      }

      await sleep(random(1000, 3000))

      const commentPromise = this.waitForCommentResponse()

      await this.page.keyboard.press('Enter')

      const result = await Promise.race([
        commentPromise,
        sleep(5000).then(() => ({ success: false, reason: '评论发布接口响应超时' }))
      ]) as { success: boolean; reason?: string }

      const verifyDialog = await this.page.$(this.config.selectors.verifyDialog!)
      if (verifyDialog) {
        const isVisible = await verifyDialog.isVisible()
        if (isVisible) {
          this.log('warn', '检测到验证码弹窗，等待用户完成')
          await this.page.waitForSelector(this.config.selectors.verifyDialog!, { state: 'detached', timeout: 60000 }).catch(() => null)
        }
      }

      return { success: result.success, error: result.reason }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  private async waitForCommentResponse(): Promise<{ success: boolean; reason?: string }> {
    if (!this.page) return { success: false, reason: 'Page not initialized' }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.page?.removeListener('response', listener)
        resolve({ success: false, reason: '评论发布接口响应超时' })
      }, 5000)

      const listener = async (response: Response) => {
        const url = response.url()
        if (url.includes('https://www.douyin.com/aweme/v1/web/comment/publish')) {
          clearTimeout(timeoutId)
          this.page?.removeListener('response', listener)
          try {
            const body = await response.json()
            resolve({ success: body?.status_code === 0 })
          } catch {
            resolve({ success: false, reason: '解析响应失败' })
          }
        }
      }

      this.page?.on('response', listener)
    })
  }

  async goToNextVideo(): Promise<void> {
    if (!this.page) return

    if (await this.isCommentSectionOpen()) {
      await this.closeCommentSection()
      await this.page.waitForTimeout(500)
    }

    await this.page.keyboard.press(this.config.keyboardShortcuts.nextVideo)
    await this.page.waitForSelector(this.config.selectors.activeVideo, {
      state: 'visible',
      timeout: 5000
    }).catch(() => null)
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
    const videoSideCard = await this.page.$(this.config.selectors.videoSideCard!)
    if (!videoSideCard) return false
    const clientWidth = await videoSideCard.evaluate((el) => (el as HTMLElement).clientWidth)
    return clientWidth > 0
  }

  async getActiveVideoId(): Promise<string | null> {
    if (!this.page) return null
    const element = await this.page.$(this.config.selectors.activeVideo)
    if (!element) return null
    const videoId = await element.getAttribute(this.config.selectors.videoIdAttr)
    return videoId
  }

  async getCurrentFeedItem(): Promise<DouyinFeedItem | null> {
    const videoId = await this.getActiveVideoId()
    if (!videoId) return null
    const feedItem = this.videoCache.get(videoId)
    this.videoCache.delete(videoId)
    return feedItem || null
  }

  setVideoCache(cache: Map<string, DouyinFeedItem>): void {
    this.videoCache = cache
  }

  getVideoCache(): Map<string, DouyinFeedItem> {
    return this.videoCache
  }

  setCurrentVideoStartTime(time: number): void {
    this.currentVideoStartTime = time
  }

  getCurrentVideoStartTime(): number {
    return this.currentVideoStartTime
  }

  async close(): Promise<void> {
    if (this.page && this.context) {
      const state = await this.context.storageState()
      store.set(StorageKey.AUTH, state)
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
