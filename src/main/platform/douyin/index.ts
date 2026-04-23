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

    // 检查登录状态
    await this.checkLoginStatus()
  }

  /**
   * 检查登录状态
   */
  private async checkLoginStatus(): Promise<void> {
    if (!this.page) return

    try {
      const currentUrl = this.page.url()

      // 检查是否在登录页面
      if (currentUrl.includes('login') || currentUrl === 'about:blank') {
        this.log('warn', '检测到未登录，请先登录账号')
        this.isLoggedIn = false

        // 导航到抖音首页
        await this.page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 30000 })
        await this.page.waitForTimeout(2000)

        // 检查是否有登录面板
        const loginPanel = await this.page.$(this.config.selectors.loginPanel!)
        if (loginPanel) {
          this.log('warn', '需要登录，等待用户登录...')
          // 等待登录面板消失（用户完成登录）
          await this.page.waitForSelector(this.config.selectors.loginPanel!, {
            state: 'detached',
            timeout: 300000 // 5分钟超时
          }).catch(() => {
            throw new Error('登录超时，请重新启动任务')
          })

          this.log('info', '登录成功，继续执行任务')
          this.isLoggedIn = true
          await this.page.waitForTimeout(2000)
        } else {
          this.isLoggedIn = true
        }
      } else {
        // 检查页面上是否有登录按钮
        const loginButton = await this.page.$('[class*="login"]').catch(() => null)
        if (loginButton) {
          const isVisible = await loginButton.isVisible().catch(() => false)
          if (isVisible) {
            this.log('warn', '检测到登录按钮，账号可能未登录')
            this.isLoggedIn = false
          } else {
            this.isLoggedIn = true
          }
        } else {
          this.isLoggedIn = true
        }
      }
    } catch (e) {
      log.warn('[DouyinAdapter] Login status check failed:', e)
      this.isLoggedIn = false
    }
  }

  /**
   * 判断是否为广告或直播视频（从DOM检测）
   */
  async isAdOrLiveFromDOM(): Promise<{ isAd: boolean; isLive: boolean }> {
    if (!this.page) return { isAd: false, isLive: false }
    try {
      return await this.page.evaluate(() => {
        const activeVideo = document.querySelector('[data-e2e="feed-active-video"]')
        if (!activeVideo) return { isAd: false, isLive: false }

        const isAd = !!activeVideo.querySelector('[data-e2e="video-ad"], [class*="ad-tag"], [class*="广告"]')

        // 直播检测：查找明确的直播标记，排除播放器自身的 class（如 xgplayer-live）
        const liveBadge = activeVideo.querySelector('[data-e2e="live-badge"]')
        const liveTag = activeVideo.querySelector('.live-tag, .living-tag, [class*="living"], [class*="直播"]')
        const isLive = !!(liveBadge || liveTag)

        return { isAd, isLive }
      })
    } catch {
      return { isAd: false, isLive: false }
    }
  }

  /**
   * 获取热门评论（按点赞数排序取前N条）
   */
  async getTopComments(videoId: string, count: number = 5): Promise<Array<{ content: string; likeCount: number }>> {
    const commentData = await this.getCommentList(videoId)
    if (commentData && commentData.comments.length > 0) {
      const sorted = [...commentData.comments].sort((a, b) => b.likeCount - a.likeCount)
      return sorted.slice(0, count).map(c => ({
        content: c.content,
        likeCount: c.likeCount
      }))
    }

    // 回退：从 DOM 获取评论
    return this.getTopCommentsFromDOM(count)
  }

  /**
   * 从 DOM 获取热门评论（回退方案）
   */
  private async getTopCommentsFromDOM(count: number = 5): Promise<Array<{ content: string; likeCount: number }>> {
    if (!this.page) return []
    try {
      const comments = await this.page.evaluate((maxCount: number) => {
        const commentList = document.querySelector('[data-e2e="comment-list"]')
        if (!commentList) return []

        const commentItems = commentList.querySelectorAll('[data-e2e="comment-item"]')
        const results: Array<{ content: string; likeCount: number }> = []

        for (let i = 0; i < Math.min(commentItems.length, maxCount); i++) {
          const item = commentItems[i]
          const textEl = item.querySelector('.comment-text, [class*="comment-text"]')
          const likeEl = item.querySelector('.like-count, [class*="like-count"], [class*="digg-count"]')

          const content = textEl?.textContent?.trim() || ''
          let likeCount = 0

          if (likeEl) {
            const likeText = likeEl.textContent?.trim() || '0'
            likeCount = parseInt(likeText.replace(/[^0-9]/g, ''), 10) || 0
          }

          if (content) {
            results.push({ content, likeCount })
          }
        }

        return results
      }, count)

      if (comments.length > 0) {
        log.info(`[DouyinAdapter] DOM fallback: extracted ${comments.length} comments`)
      }
      return comments
    } catch (e) {
      log.warn(`[DouyinAdapter] DOM comment fallback failed: ${e}`)
      return []
    }
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo | null> {
    return this.getVideoInfoFromDOM(videoId)
  }

  /**
   * 从页面 DOM 提取视频信息
   */
  private async getVideoInfoFromDOM(videoId: string): Promise<VideoInfo | null> {
    if (!this.page) return null
    try {
      // 等待视频描述区域出现（确保 DOM 已渲染）
      await this.page.waitForSelector(
        '[data-e2e="feed-active-video"] [data-e2e="video-desc"], [data-e2e="feed-active-video"] [data-e2e="video-nickname"]',
        { state: 'visible', timeout: 5000 }
      ).catch(() => null)

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

        // 从描述中提取话题标签 (#xxx)
        const tags: string[] = []
        const tagEls = activeVideo.querySelectorAll('[data-e2e="video-desc"] a[href*="hashtag"], [data-e2e="video-desc"] .hashtag')
        tagEls.forEach(el => {
          const tag = el.textContent?.trim().replace(/^#/, '') || ''
          if (tag) tags.push(tag)
        })
        if (tags.length === 0 && description) {
          const hashMatches = description.match(/#([^\s#]+)/g)
          if (hashMatches) {
            hashMatches.forEach(m => tags.push(m.replace(/^#/, '')))
          }
        }

        // 提取视频时长
        const durationEl = activeVideo.querySelector('.time-duration')
        let duration = 0
        if (durationEl) {
          const durationText = durationEl.textContent?.trim() || ''
          const parts = durationText.split(':').map(p => parseInt(p, 10))
          if (parts.length === 2) {
            duration = parts[0] * 60 + parts[1]
          } else if (parts.length === 3) {
            duration = parts[0] * 3600 + parts[1] * 60 + parts[2]
          }
        }

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
          tags,
          likeCount: 0,
          collectCount: 0,
          shareCount: 0,
          commentCount: 0,
          shareUrl: '',
          createTime: Date.now(),
          duration
        }
      }, videoId)
      if (info) {
        log.info(`[DouyinAdapter] DOM: extracted info for @${info.author.nickname}, tags: [${info.tags.join(', ')}]`)
      }
      return info as VideoInfo | null
    } catch (e) {
      log.warn(`[DouyinAdapter] DOM extraction failed: ${e}`)
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
        sleep(10000).then(() => ({ success: false, reason: '评论发布接口响应超时' }))
      ]) as { success: boolean; reason?: string; commentId?: string }

      // 检查验证码
      const verifyDialog = await this.page.$(this.config.selectors.verifyDialog!)
      if (verifyDialog) {
        const isVisible = await verifyDialog.isVisible()
        if (isVisible) {
          this.log('warn', '检测到验证码弹窗，等待用户完成验证...')

          // 等待验证码弹窗消失，最多等待5分钟
          const verifyResult = await this.page.waitForSelector(this.config.selectors.verifyDialog!, {
            state: 'detached',
            timeout: 300000 // 5分钟
          }).then(() => true).catch(() => false)

          if (verifyResult) {
            this.log('info', '验证码已完成')
            await sleep(2000)

            // 验证完成后，重新检查评论是否成功
            // 如果之前评论失败，可以选择重试
            if (!result.success) {
              this.log('info', '验证完成后重新尝试发送评论')
              return await this.comment(videoId, content)
            }
          } else {
            this.log('error', '验证码处理超时')
            return { success: false, error: '验证码处理超时' }
          }
        }
      }

      // 判断评论是否成功
      if (result.success) {
        this.log('info', `评论发布成功: ${content}`)
        return { success: true, commentId: result.commentId }
      } else {
        this.log('warn', `评论发布失败: ${result.reason || '未知原因'}`)
        return { success: false, error: result.reason || '评论发布失败' }
      }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  private async waitForCommentResponse(): Promise<{ success: boolean; reason?: string; commentId?: string }> {
    if (!this.page) return { success: false, reason: 'Page not initialized' }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.page?.removeListener('response', listener)
        resolve({ success: false, reason: '评论发布接口响应超时' })
      }, 10000)

      const listener = async (response: Response) => {
        const url = response.url()
        if (url.includes('https://www.douyin.com/aweme/v1/web/comment/publish')) {
          clearTimeout(timeoutId)
          this.page?.removeListener('response', listener)
          try {
            const body = await response.json()
            if (body?.status_code === 0) {
              resolve({ success: true, commentId: body?.comment?.cid })
            } else {
              const errorMsg = body?.status_msg || body?.message || '评论发布失败'
              resolve({ success: false, reason: errorMsg })
            }
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
    const prevFingerprint = await this.getVideoFingerprint()
    this.lastVideoId = prevVideoId

    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.page.keyboard.press(this.config.keyboardShortcuts.nextVideo)
      await sleep(1500)

      const changed = await this.waitForVideoChange(prevVideoId, prevFingerprint)
      if (changed) {
        log.info(`[DouyinAdapter] goToNextVideo: switched (attempt ${attempt + 1})`)
        return
      }
      log.warn(`[DouyinAdapter] goToNextVideo: video not switched (attempt ${attempt + 1}/${maxAttempts})`)
      // 点击视频区域确保焦点在播放器上，再重试
      await this.page.click('[data-e2e="feed-active-video"]', { position: { x: 300, y: 300 } }).catch(() => null)
      await sleep(500)
    }
    log.warn(`[DouyinAdapter] goToNextVideo: failed to switch after ${maxAttempts} attempts`)
  }

  private async getVideoFingerprint(): Promise<string> {
    if (!this.page) return ''
    return this.page.evaluate(() => {
      const el = document.querySelector('[data-e2e="feed-active-video"]')
      if (!el) return ''
      const nick = el.querySelector('[data-e2e="video-nickname"]')?.textContent?.trim() || ''
      const desc = el.querySelector('[data-e2e="video-desc"]')?.textContent?.trim() || ''
      return `${nick}||${desc}`
    }).catch(() => '')
  }

  private async waitForVideoChange(prevVideoId: string | null, prevFingerprint: string, maxWaitMs: number = 5000): Promise<boolean> {
    if (!this.page) return false
    const startTime = Date.now()
    while (Date.now() - startTime < maxWaitMs) {
      const newVideoId = await this.getActiveVideoId()
      if (newVideoId && newVideoId !== prevVideoId) {
        return true
      }
      // 即使 videoId 没变或拿不到，也通过内容指纹检测变化
      const newFingerprint = await this.getVideoFingerprint()
      if (prevFingerprint && newFingerprint && newFingerprint !== prevFingerprint) {
        return true
      }
      await sleep(300)
    }
    return false
  }

  async openCommentSection(): Promise<void> {
    if (!this.page) return

    // 检查评论区是否已经打开
    const isOpen = await this.isCommentSectionOpen()
    if (isOpen) {
      this.log('info', '评论区已打开，无需重复操作')
      return
    }

    await this.page.keyboard.press(this.config.keyboardShortcuts.comment)
    await this.page.waitForTimeout(800)
  }

  async closeCommentSection(): Promise<void> {
    if (!this.page) return

    // 检查评论区是否已经关闭
    const isOpen = await this.isCommentSectionOpen()
    if (!isOpen) {
      this.log('info', '评论区已关闭，无需重复操作')
      return
    }

    await this.page.keyboard.press(this.config.keyboardShortcuts.comment)
    await this.page.waitForTimeout(800)
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
    return this.page.evaluate(() => {
      // 优先从 URL 提取 modal_id（精选页切换视频时 URL 会实时更新）
      const url = window.location.href
      const modalMatch = url.match(/modal_id=(\d+)/)
      if (modalMatch) return modalMatch[1]

      // 从 active video 元素的属性获取
      const el = document.querySelector('[data-e2e="feed-active-video"]')
      if (!el) return null
      return el.getAttribute('data-e2e-vid')
        || el.getAttribute('data-aweme-id')
        || null
    })
  }

  setCurrentVideoStartTime(time: number): void {
    this.currentVideoStartTime = time
  }

  getCurrentVideoStartTime(): number {
    return this.currentVideoStartTime
  }

  private parseTimeString(timeStr: string): number {
    const parts = timeStr.split(':').map(p => parseInt(p, 10))
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  async getPlaybackProgress(): Promise<{ current: number; total: number } | null> {
    if (!this.page) return null
    try {
      return await this.page.evaluate(() => {
        const activeVideo = document.querySelector('[data-e2e="feed-active-video"]')
        if (!activeVideo) return null

        const currentEl = activeVideo.querySelector('.time-current') ||
          activeVideo.querySelector('span.time-current')
        const durationEl = activeVideo.querySelector('.time-duration') ||
          activeVideo.querySelector('span.time-duration')

        if (!currentEl || !durationEl) return null

        const parseTime = (str: string): number => {
          const parts = str.split(':').map(p => parseInt(p, 10))
          if (parts.length === 2) return parts[0] * 60 + parts[1]
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
          return 0
        }

        const current = parseTime(currentEl.textContent?.trim() || '0:00')
        const total = parseTime(durationEl.textContent?.trim() || '0:00')

        return { current, total }
      })
    } catch {
      return null
    }
  }

  async setPlaybackRate(rate: number): Promise<boolean> {
    if (!this.page) return false
    try {
      const validRates = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0]
      const closest = validRates.reduce((prev, curr) =>
        Math.abs(curr - rate) < Math.abs(prev - rate) ? curr : prev
      )

      const settingBtn = await this.page.$('.xgplayer-playback-setting')
      if (!settingBtn) return false

      await settingBtn.hover()
      // 等待倍速面板展开（slide-show 样式出现）
      await this.page.waitForSelector('.xgplayer-playback-setting.slide-show', {
        state: 'visible',
        timeout: 3000
      }).catch(() => null)

      const selector = `.xgplayer-playratio-item[data-id="${closest}"]`
      const rateBtn = await this.page.waitForSelector(selector, { state: 'visible', timeout: 3000 }).catch(() => null)
      if (rateBtn) {
        await rateBtn.click()
        await this.page.waitForTimeout(300)
        await this.page.mouse.move(0, 0)
        log.info(`[DouyinAdapter] setPlaybackRate: ${closest}x`)
        return true
      }

      await this.page.mouse.move(0, 0)
      return false
    } catch {
      return false
    }
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
