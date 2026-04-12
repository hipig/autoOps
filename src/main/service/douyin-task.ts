import { EventEmitter } from 'events'
import { chromium, Browser, Page, BrowserContext, type Response } from '@playwright/test'
import { DouyinElementSelector } from '../elements/douyin'
import { FeedAcSettingsV2, FeedAcRuleGroups } from '../../shared/feed-ac-setting'
import { VideoRecord } from '../../shared/task-history'
import { store, StorageKey } from '../utils/storage'
import { createAIService, type AIService } from '../integration/ai/factory'
import { AISettings } from '../../shared/ai-setting'
import { random, sleep, generateId } from '../utils/common'
import log from 'electron-log/main'

export interface DouyinTaskConfig {
  browserExecPath: string
  settings: FeedAcSettingsV2
  accountId?: string
}

export interface FeedItem {
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

export interface CommentResponse {
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

export class DouyinTask extends EventEmitter {
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page
  private selector: DouyinElementSelector
  private stopped = false
  private taskId = ''
  private currentVideoStartTime = 0
  private videoCache = new Map<string, FeedItem>()
  private aiService: AIService | null = null

  constructor() {
    super()
    this.selector = new DouyinElementSelector()
  }

  async start(config: DouyinTaskConfig): Promise<string> {
    this.taskId = generateId()
    this.stopped = false

    log.info(`DouyinTask ${this.taskId} starting...`)

    this.browser = await chromium.launch({
      executablePath: config.browserExecPath,
      headless: false
    })

    let storageState: any = store.get(StorageKey.AUTH)
    if (config.accountId) {
      const accounts = store.get(StorageKey.ACCOUNTS) as any[] || []
      const account = accounts.find((a: any) => a.id === config.accountId)
      if (account?.storageState) {
        try {
          storageState = JSON.parse(account.storageState)
          log.info(`Using storageState for account: ${account.name}`)
        } catch (e) {
          log.warn('Failed to parse account storageState, falling back to global auth')
        }
      }
    }

    this.context = await this.browser.newContext({
      storageState
    })

    this.page = await this.context.newPage()
    this.selector.setPage(this.page)

    await this.setupVideoDataListener()
    await this.page.goto('https://www.douyin.com/?recommend=1')

    await this.page.waitForSelector(this.selector.activeVideoSelector, { state: 'detached' }).catch(() => null)

    const aiSettings = store.get(StorageKey.AI_SETTINGS) as AISettings | null
    if (aiSettings && config.settings.aiCommentEnabled) {
      this.aiService = createAIService(aiSettings.platform, {
        apiKey: aiSettings.apiKeys[aiSettings.platform],
        model: aiSettings.model,
        temperature: aiSettings.temperature
      })
    }

    await this.runTask(config.settings)

    return this.taskId
  }

  async stop(): Promise<void> {
    log.info(`DouyinTask ${this.taskId} stopping...`)
    this.stopped = true
    await this.close()
  }

  private async close(): Promise<void> {
    if (this.page && this.context) {
      const state = await this.context.storageState()
      store.set(StorageKey.AUTH, state)

      await this.page.close()
      await this.browser?.close()

      this.page = undefined
      this.browser = undefined
    }
  }

  private async runTask(settings: FeedAcSettingsV2): Promise<void> {
    const maxCount = settings.maxCount || 10
    let commentCount = 0

    this.emit('progress', { message: `任务启动，目标评论数: ${maxCount}`, timestamp: Date.now() })

    for (let i = 0; commentCount < maxCount && !this.stopped; i++) {
      this.emit('progress', {
        message: `===== 处理第 ${i + 1} 个视频，已完成: ${commentCount}/${maxCount} =====`,
        timestamp: Date.now()
      })

      this.currentVideoStartTime = Date.now()

      const videoInfo = await this.getCurrentVideoInfo()
      if (!videoInfo) {
        this.log('warn', '未获取到视频信息，跳到下一个')
        await this.selector.goToNextVideo()
        continue
      }

      this.log('info', `视频作者: @${videoInfo.author.nickname}`)
      this.log('info', `视频描述: ${videoInfo.desc}`)

      if (videoInfo.aweme_type !== 0) {
        this.log('info', `跳过非常规视频类型: ${videoInfo.aweme_type}`)
        await this.selector.goToNextVideo()
        continue
      }

      if (this.checkBlockKeywords(videoInfo, settings)) {
        await this.selector.goToNextVideo()
        continue
      }

      const matchedRule = await this.matchRules(videoInfo, settings)
      if (!matchedRule) {
        this.log('info', '视频不满足评论规则')
        await this.recordSkip(videoInfo, '规则不匹配')
        await this.selector.goToNextVideo()
        continue
      }

      if (settings.simulateWatchBeforeComment) {
        const watchTime = random(settings.watchTimeRangeSeconds[0], settings.watchTimeRangeSeconds[1]) * 1000
        this.log('info', `模拟观看 ${watchTime / 1000} 秒`)
        await sleep(watchTime)
      }

      const commentResult = await this.executeComment(videoInfo, matchedRule, settings)
      if (commentResult.success) {
        commentCount++
        await this.recordComment(videoInfo, commentResult.comment || '')
        this.log('success', `评论成功，已完成: ${commentCount}/${maxCount}`)
        this.emit('commented', { videoId: videoInfo.aweme_id, comment: commentResult.comment || '' })
      } else {
        await this.recordSkip(videoInfo, commentResult.reason || '评论失败')
      }

      if (Math.random() < 0.1) {
        await this.selector.like()
        this.log('info', '执行随机点赞')
      }

      await sleep(random(1000, 3000))
      await this.selector.goToNextVideo()
    }

    this.log('success', `任务完成，共完成 ${commentCount} 个评论`)
    await this.close()
    this.emit('stopped')
  }

  private async getCurrentVideoInfo(): Promise<FeedItem | null> {
    const result = await this.selector.getActiveVideoElement()
    if (!result || !result.videoId) return null
    const videoData = this.videoCache.get(result.videoId)
    this.videoCache.delete(result.videoId)
    return videoData || null
  }

  private async setupVideoDataListener(): Promise<void> {
    if (!this.page) return

    this.page.on('response', async (response) => {
      const url = response.url()
      if (url.includes('https://www.douyin.com/aweme/v1/web/tab/feed/')) {
        try {
          const body = await response.json() as { aweme_list: FeedItem[] }
          if (body?.aweme_list) {
            body.aweme_list.forEach((video) => {
              this.videoCache.set(video.aweme_id, video)
            })
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    })
  }

  private checkBlockKeywords(videoInfo: FeedItem, settings: FeedAcSettingsV2): boolean {
    const { blockKeywords, authorBlockKeywords } = settings
    const desc = videoInfo.desc || ''
    const nickname = videoInfo.author.nickname || ''

    const hitBlock = blockKeywords.some((k) => desc.includes(k))
    const hitAuthor = authorBlockKeywords.some((k) => nickname.includes(k))

    if (hitBlock) {
      this.log('warn', `描述命中屏蔽词`)
    }
    if (hitAuthor) {
      this.log('warn', `作者命中屏蔽词`)
    }

    return hitBlock || hitAuthor
  }

  private async matchRules(videoInfo: FeedItem, settings: FeedAcSettingsV2): Promise<FeedAcRuleGroups | null> {
    const ruleGroups = settings.ruleGroups
    if (!ruleGroups || ruleGroups.length === 0) {
      return { id: 'default', type: 'manual' as const, name: '默认规则' }
    }

    for (const ruleGroup of ruleGroups) {
      const matched = await this.matchRuleGroup(ruleGroup, videoInfo, settings)
      if (matched) return ruleGroup
    }

    return null
  }

  private async matchRuleGroup(
    ruleGroup: FeedAcRuleGroups,
    videoInfo: FeedItem,
    settings: FeedAcSettingsV2
  ): Promise<boolean> {
    if (ruleGroup.type === 'ai' && ruleGroup.aiPrompt && this.aiService) {
      const videoInfoStr = JSON.stringify({
        author: videoInfo.author.nickname,
        videoDesc: videoInfo.desc,
        videoTag: videoInfo.video_tag.map((t) => t.tag_name)
      })

      try {
        const result = await this.aiService.analyzeVideoType(videoInfoStr, ruleGroup.aiPrompt)
        if (!result.shouldWatch) return false
      } catch (e) {
        this.log('error', `AI分析失败: ${e}`)
        return false
      }
    }

    if (ruleGroup.type === 'manual' && ruleGroup.rules) {
      const matches = ruleGroup.rules.map((rule) => {
        if (!rule.keyword) return false
        if (rule.field === 'nickName') {
          return videoInfo.author.nickname.includes(rule.keyword)
        }
        if (rule.field === 'videoDesc') {
          return videoInfo.desc.includes(rule.keyword)
        }
        if (rule.field === 'videoTag') {
          return videoInfo.video_tag.some((t) => t.tag_name.includes(rule.keyword))
        }
        return false
      })

      const matched = ruleGroup.relation === 'and'
        ? matches.every(Boolean)
        : matches.some(Boolean)

      if (!matched) return false
    }

    if (ruleGroup.children && ruleGroup.children.length > 0) {
      for (const child of ruleGroup.children) {
        const childMatched = await this.matchRuleGroup(child, videoInfo, settings)
        if (!childMatched) return false
      }
    }

    return true
  }

  private async executeComment(
    videoInfo: FeedItem,
    matchedRule: FeedAcRuleGroups,
    settings: FeedAcSettingsV2
  ): Promise<{ success: boolean; comment?: string; reason?: string }> {
    if (!this.page) return { success: false, reason: 'Page not initialized' }

    await this.selector.openCommentSection()
    await sleep(random(2000, 4000))

    if (settings.onlyCommentActiveVideo) {
      const commentData = await this.waitForCommentData()
      if (commentData) {
        const activityCheck = this.checkVideoActivity(commentData)
        if (!activityCheck.isActive) {
          this.log('info', `视频活跃度不足: ${activityCheck.reason}`)
          await this.selector.closeCommentSection()
          return { success: false, reason: '活跃度不足' }
        }
      }
    }

    let commentText = ''
    if (settings.aiCommentEnabled && this.aiService) {
      const videoInfoStr = JSON.stringify({
        author: videoInfo.author.nickname,
        videoDesc: videoInfo.desc,
        videoTag: videoInfo.video_tag.map((t) => t.tag_name)
      })
      try {
        const result = await this.aiService.generateComment(videoInfoStr, matchedRule.aiPrompt || '生成一条有趣的评论')
        commentText = result.content
      } catch (e) {
        this.log('error', `AI评论生成失败: ${e}`)
        commentText = this.getRandomComment(matchedRule)
      }
    } else {
      commentText = this.getRandomComment(matchedRule)
    }

    const result = await this.postComment(commentText)

    await this.selector.closeCommentSection()

    return result.success
      ? { success: true, comment: commentText }
      : { success: false, reason: result.reason }
  }

  private getRandomComment(rule: FeedAcRuleGroups): string {
    const texts = rule.commentTexts || ['路过，点个赞吧']
    return texts[Math.floor(Math.random() * texts.length)]
  }

  private async postComment(text: string): Promise<{ success: boolean; reason?: string }> {
    if (!this.page) return { success: false, reason: 'Page not initialized' }

    try {
      const inputContainer = await this.page.waitForSelector(this.selector.commentInputContainerSelector, {
        timeout: 5000
      }).catch(() => null)

      if (!inputContainer) {
        return { success: false, reason: '未找到评论输入框' }
      }

      await inputContainer.click()
      await sleep(500)

      for (const char of text) {
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

      const verifyDialog = await this.page.$(this.selector.verifyDialogSelector)
      if (verifyDialog) {
        const isVisible = await verifyDialog.isVisible()
        if (isVisible) {
          this.log('warn', '检测到验证码弹窗，等待用户完成')
          await this.page.waitForSelector(this.selector.verifyDialogSelector, { state: 'detached', timeout: 60000 }).catch(() => null)
        }
      }

      return result
    } catch (e) {
      return { success: false, reason: String(e) }
    }
  }

  private async waitForCommentData(): Promise<CommentResponse | null> {
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
            const body = await response.json()
            resolve(body as CommentResponse)
          } catch {
            resolve(null)
          }
        }
      }

      this.page?.on('response', listener)
    })
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

  private checkVideoActivity(commentData: CommentResponse): { isActive: boolean; reason: string } {
    const comments = commentData.comments
    if (!comments || comments.length === 0) {
      return { isActive: false, reason: '无评论数据' }
    }

    const now = Math.floor(Date.now() / 1000)
    const twoDays = 2 * 24 * 60 * 60
    const oneDay = 24 * 60 * 60

    if (comments.length >= 5) {
      const recentComments = comments.slice(0, 5).filter((c) => now - c.create_time < twoDays)
      const isActive = recentComments.length >= 2
      return {
        isActive,
        reason: `前5条评论中有${recentComments.length}条在2天内`
      }
    } else {
      const recentComments = comments.filter((c) => now - c.create_time < oneDay)
      const isActive = recentComments.length >= 1
      return {
        isActive,
        reason: `评论数${comments.length}，有${recentComments.length}条在1天内`
      }
    }
  }

  private async recordSkip(videoInfo: FeedItem, reason: string): Promise<void> {
    const record: VideoRecord = {
      videoId: videoInfo.aweme_id,
      authorName: videoInfo.author.nickname,
      videoDesc: videoInfo.desc,
      videoTags: videoInfo.video_tag.map((t) => t.tag_name),
      shareUrl: videoInfo.share_url,
      watchDuration: Date.now() - this.currentVideoStartTime,
      isCommented: false,
      skipReason: reason,
      timestamp: Date.now()
    }

    this.saveVideoRecord(record)
  }

  private async recordComment(videoInfo: FeedItem, commentText: string): Promise<void> {
    const record: VideoRecord = {
      videoId: videoInfo.aweme_id,
      authorName: videoInfo.author.nickname,
      videoDesc: videoInfo.desc,
      videoTags: videoInfo.video_tag.map((t) => t.tag_name),
      shareUrl: videoInfo.share_url,
      watchDuration: Date.now() - this.currentVideoStartTime,
      isCommented: true,
      commentText,
      timestamp: Date.now()
    }

    this.saveVideoRecord(record)
  }

  private saveVideoRecord(record: VideoRecord): void {
    // Save to task history via IPC would be complex, just log for now
    this.emit('progress', {
      message: `记录视频: ${record.authorName} - ${record.isCommented ? '已评论' : '跳过'}: ${record.skipReason || ''}`,
      timestamp: Date.now()
    })
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error' | 'success', message: string): void {
    const emojiMap = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      success: '✅'
    }
    const emoji = emojiMap[level]
    const formattedMessage = `[Douyin] ${emoji} ${message}`
    log.info(formattedMessage)
    this.emit('progress', { message: formattedMessage, timestamp: Date.now() })
  }
}