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
  aweme_type: number // 0=普通视频, 1=广告, 2=图集, 5=直播等
  desc: string
  is_ads?: boolean // 是否广告
  live_info?: {
    // 直播信息
    room_id: string
    status: number
  }
  author: {
    nickname: string
    uid: string
  }
  video_tag: Array<{ tag_name: string }>
  share_url: string
  channel_info?: {
    channel_name: string
    channel_id: string
  }
  statistics?: {
    // 互动数据
    digg_count: number // 点赞
    comment_count: number // 评论
    collect_count: number // 收藏
    share_count: number // 分享
  }
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
  protected videoCache = new Map<string, DouyinFeedItem>()
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
      // 匹配多种可能的 feed API URL 模式
      if (url.includes('/aweme/v1/web/')) {
        try {
          const body = await response.json() as { aweme_list: DouyinFeedItem[] }
          if (body?.aweme_list) {
            const count = body.aweme_list.length
            body.aweme_list.forEach((video) => {
              this.videoCache.set(video.aweme_id, video)
            })
            log.info(`[DouyinAdapter] Feed API: cached ${count} videos, total cache: ${this.videoCache.size}`)
          }
        } catch {
        }
      }
    })
  }

  /**
   * 判断是否为广告或直播视频
   */
  isAdOrLive(feedItem: DouyinFeedItem): boolean {
    if (feedItem.aweme_type !== 0) return true
    if (feedItem.is_ads === true) return true
    if (feedItem.live_info && feedItem.live_info.room_id) return true
    return false
  }

  /**
   * 获取视频类型描述
   */
  getVideoTypeDesc(feedItem: DouyinFeedItem): string {
    if (feedItem.is_ads === true) return '广告'
    if (feedItem.live_info && feedItem.live_info.room_id) return '直播'
    switch (feedItem.aweme_type) {
      case 0: return '普通视频'
      case 2: return '图集'
      case 5: return '直播'
      default:
        if (feedItem.aweme_type !== 0) return `其他类型(${feedItem.aweme_type})`
        return '普通视频'
    }
  }

  /**
   * 获取热门评论（按点赞数排序取前N条）
   */
  async getTopComments(videoId: string, count: number = 5): Promise<Array<{ content: string; likeCount: number }>> {
    const commentData = await this.getCommentList(videoId)
    if (!commentData || commentData.comments.length === 0) return []
    const sorted = [...commentData.comments].sort((a, b) => b.likeCount - a.likeCount)
    return sorted.slice(0, count).map(c => ({
      content: c.content,
      likeCount: c.likeCount
    }))
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo | null> {
    const feedItem = this.videoCache.get(videoId)
    if (feedItem) {
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
        likeCount: feedItem.statistics?.digg_count || 0,
        collectCount: feedItem.statistics?.collect_count || 0,
        shareCount: feedItem.statistics?.share_count || 0,
        commentCount: feedItem.statistics?.comment_count || 0,
        shareUrl: feedItem.share_url,
        createTime: Date.now()
      }
    }

    // 降级：从 DOM 提取基础信息
    return this.getVideoInfoFromDOM(videoId)
  }

  /**
   * 从页面 DOM 提取视频信息（API cache 未命中时的降级方案）
   */
  private async getVideoInfoFromDOM(videoId: string): Promise<VideoInfo | null> {
    if (!this.page) return null
    try {
      const info = await this.page.evaluate((vid: string) => {
        const activeVideo = document.querySelector('[data-e2e="feed-active-video"]')
        if (!activeVideo) return null

        // 提取作者昵称
        const nicknameEl = activeVideo.querySelector('[data-e2e="video-nickname"]') ||
          activeVideo.querySelector('.account-name') ||
          activeVideo.querySelector('.author-card-user-name')
        const nickname = nicknameEl?.textContent?.trim() || ''

        // 提取视频描述
        const descEl = activeVideo.querySelector('[data-e2e="video-desc"]') ||
          activeVideo.querySelector('.video-desc') ||
          activeVideo.querySelector('.desc')
        const description = descEl?.textContent?.trim() || ''

        if (!nickname && !description) return null

        return {
          videoId: vid,
          title: description,
          description,
          author: {
            userId: '',
            nickname,
            verified: false
          },
          tags: [] as string[],
          likeCount: 0,
          collectCount: 0,
          shareCount: 0,
          commentCount: 0,
          shareUrl: '',
          createTime: Date.now()
        }
      }, videoId)
      if (info) {
        log.info(`[DouyinAdapter] DOM fallback: extracted info for @${info.author.nickname}`)
      }
      return info as VideoInfo | null
    } catch (e) {
      log.warn(`[DouyinAdapter] DOM fallback failed: ${e}`)
      return null
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
      this.openCommentSection().catch(() => {})
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

  private lastVideoId: string | null = null

  async goToNextVideo(waitForData: boolean = true): Promise<void> {
    if (!this.page) return

    if (await this.isCommentSectionOpen()) {
      await this.closeCommentSection()
      await this.page.waitForTimeout(500)
    }

    const prevVideoId = await this.getActiveVideoId()
    this.lastVideoId = prevVideoId

    await this.page.keyboard.press(this.config.keyboardShortcuts.nextVideo)
    await this.page.waitForSelector(this.config.selectors.activeVideo, {
      state: 'visible',
      timeout: 5000
    }).catch(() => null)

    await this.waitForVideoIdChange(prevVideoId)

    if (waitForData) {
      await this.waitForVideoCacheData()
    }
  }

  private async waitForVideoIdChange(prevVideoId: string | null, maxWaitMs: number = 5000): Promise<void> {
    if (!this.page) return
    const startTime = Date.now()
    while (Date.now() - startTime < maxWaitMs) {
      const newVideoId = await this.getActiveVideoId()
      if (newVideoId && newVideoId !== prevVideoId) {
        return
      }
      await sleep(300)
    }
  }

  private async waitForVideoCacheData(maxWaitMs: number = 3000): Promise<void> {
    const currentVideoId = await this.getActiveVideoId()
    if (!currentVideoId) return

    if (this.videoCache.has(currentVideoId)) return

    const startTime = Date.now()
    while (Date.now() - startTime < maxWaitMs) {
      if (this.videoCache.has(currentVideoId)) return
      await sleep(300)
    }
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
