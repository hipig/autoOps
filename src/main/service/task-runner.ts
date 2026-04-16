import { EventEmitter } from 'events'
import { chromium, Browser, BrowserContext, Page, type Response } from '@playwright/test'
import { BasePlatformAdapter, VideoRecord, TaskProgress } from '../platform/base'
import { createPlatformAdapter } from '../platform/factory'
import { FeedAcSettingsV3, FeedAcRuleGroups, migrateToV3, getDefaultFeedAcSettingsV3 } from '../../shared/feed-ac-setting'
import type { Platform, TaskType, VideoInfo } from '../../shared/platform'
import { PLATFORMS } from '../../shared/platform'
import { store, StorageKey } from '../utils/storage'
import { createAIService, type AIService } from '../integration/ai/factory'
import { AISettings } from '../../shared/ai-setting'
import { sleep, random, generateId } from '../utils/common'
import log from 'electron-log/main'

export interface TaskRunConfig {
  browserExecPath: string
  platform: Platform
  taskType: TaskType
  settings: FeedAcSettingsV3
  accountId?: string
}

export class TaskRunner extends EventEmitter {
  private browser?: Browser
  private context?: BrowserContext
  private adapter?: BasePlatformAdapter
  private stopped = false
  private taskId = ''
  private currentVideoStartTime = 0
  private videoCache = new Map<string, any>()
  private aiService: AIService | null = null

  async start(config: TaskRunConfig): Promise<string> {
    this.taskId = generateId()
    this.stopped = false

    log.info(`TaskRunner ${this.taskId} starting...`)
    this.emit('progress', { message: `任务启动 (${PLATFORMS[config.platform].name})`, timestamp: Date.now() })

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

    this.context = await this.browser.newContext({ storageState })
    this.page = await this.context.newPage()
    this.setupVideoDataListener()

    this.adapter = createPlatformAdapter(config.platform)
    this.adapter.setPage(this.page)
    this.adapter.setVideoCache(this.videoCache)

    await this.page.goto(PLATFORMS[config.platform].homeUrl)

    const aiSettings = store.get(StorageKey.AI_SETTINGS) as AISettings | null
    if (aiSettings && config.settings.aiCommentEnabled) {
      this.aiService = createAIService(aiSettings.platform, {
        apiKey: aiSettings.apiKeys[aiSettings.platform],
        model: aiSettings.model,
        temperature: aiSettings.temperature
      })
    }

    await this.runTask(config)

    return this.taskId
  }

  private page?: Page

  private setupVideoDataListener(): void {
    if (!this.page) return

    this.page.on('response', async (response: Response) => {
      const url = response.url()
      if (url.includes('https://www.douyin.com/aweme/v1/web/tab/feed/')) {
        try {
          const body = await response.json() as { aweme_list: any[] }
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

  async stop(): Promise<void> {
    log.info(`TaskRunner ${this.taskId} stopping...`)
    this.stopped = true
    await this.close()
  }

  private async close(): Promise<void> {
    if (this.page && this.context) {
      const state = await this.context.storageState()
      store.set(StorageKey.AUTH, state)
      await this.page.close()
    }
    if (this.browser) {
      await this.browser.close()
    }
    this.page = undefined
    this.browser = undefined
  }

  private async runTask(config: TaskRunConfig): Promise<void> {
    const settings = config.settings.version === 'v2' ? migrateToV3(config.settings) : config.settings
    const maxCount = settings.maxCount || 10
    const taskType = settings.taskType || config.taskType

    this.emit('progress', { message: `任务类型: ${this.getTaskTypeName(taskType)}, 目标: ${maxCount}`, timestamp: Date.now() })

    let completedCount = 0
    let operationCounts: Record<string, number> = {}

    for (let i = 0; completedCount < maxCount && !this.stopped; i++) {
      this.emit('progress', {
        message: `===== 处理第 ${i + 1} 个视频，已完成: ${completedCount}/${maxCount} =====`,
        timestamp: Date.now()
      })

      this.currentVideoStartTime = Date.now()

      const videoInfo = await this.getCurrentVideoInfo()
      if (!videoInfo) {
        this.log('warn', '未获取到视频信息，跳到下一个')
        await this.goToNextVideo()
        continue
      }

      this.log('info', `视频作者: @${videoInfo.author.nickname}`)
      this.log('info', `视频描述: ${videoInfo.description}`)

      if (this.checkBlockKeywords(videoInfo, settings)) {
        await this.goToNextVideo()
        continue
      }

      const matchedRule = await this.matchRules(videoInfo, settings)
      if (!matchedRule) {
        this.log('info', '视频不满足任务规则')
        await this.recordSkip(videoInfo, '规则不匹配')
        await this.goToNextVideo()
        continue
      }

      if (settings.simulateWatchBeforeComment) {
        const watchTime = random(settings.watchTimeRangeSeconds[0], settings.watchTimeRangeSeconds[1]) * 1000
        this.log('info', `模拟观看 ${watchTime / 1000} 秒`)
        await sleep(watchTime)
      }

      const results = await this.executeOperations(videoInfo, settings, taskType, operationCounts)

      for (const result of results) {
        if (result.success) {
          completedCount++
          operationCounts[result.action] = (operationCounts[result.action] || 0) + 1
          this.log('success', `${this.getActionName(result.action)}成功 (${operationCounts[result.action]}/${maxCount})`)
          this.emit('action', { videoId: videoInfo.videoId, action: result.action, success: true })
        }
      }

      if (Math.random() < 0.1 && taskType !== 'like') {
        await this.executeLike(videoInfo.videoId)
      }

      await sleep(random(1000, 3000))
      await this.goToNextVideo()
    }

    this.log('success', `任务完成，共执行 ${completedCount} 次操作`)
    const summary = Object.entries(operationCounts)
      .map(([action, count]) => `${this.getActionName(action)}: ${count}`)
      .join(', ')
    if (summary) {
      this.log('info', `操作统计: ${summary}`)
    }

    await this.close()
    this.emit('stopped')
  }

  private async getCurrentVideoInfo(maxRetries = 3): Promise<VideoInfo | null> {
    if (!this.adapter || !this.page) return null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const videoId = await this.adapter.getActiveVideoId()
      if (!videoId) {
        if (attempt < maxRetries - 1) {
          await sleep(500)
          continue
        }
        return null
      }

      const videoData = this.videoCache.get(videoId)
      if (!videoData) {
        if (attempt < maxRetries - 1) {
          await sleep(500)
          continue
        }
        return null
      }

      this.videoCache.delete(videoId)

      return {
        videoId: videoData.aweme_id,
        title: videoData.desc,
        description: videoData.desc,
        author: {
          userId: videoData.author?.uid || '',
          nickname: videoData.author?.nickname || '',
          verified: false
        },
        tags: videoData.video_tag?.map((t: any) => t.tag_name) || [],
        likeCount: 0,
        collectCount: 0,
        shareCount: 0,
        commentCount: 0,
        shareUrl: videoData.share_url || '',
        createTime: Date.now()
      }
    }

    return null
  }

  private async goToNextVideo(): Promise<void> {
    if (!this.adapter) return
    await this.adapter.goToNextVideo()
  }

  private checkBlockKeywords(videoInfo: VideoInfo, settings: FeedAcSettingsV3): boolean {
    const { blockKeywords, authorBlockKeywords } = settings
    const desc = videoInfo.description || ''
    const nickname = videoInfo.author.nickname || ''

    const hitBlock = blockKeywords.some((k) => desc.includes(k))
    const hitAuthor = authorBlockKeywords.some((k) => nickname.includes(k))

    if (hitBlock) this.log('warn', `描述命中屏蔽词`)
    if (hitAuthor) this.log('warn', `作者命中屏蔽词`)

    return hitBlock || hitAuthor
  }

  private async matchRules(videoInfo: VideoInfo, settings: FeedAcSettingsV3): Promise<FeedAcRuleGroups | null> {
    const ruleGroups = settings.ruleGroups
    if (!ruleGroups || ruleGroups.length === 0) {
      return { id: 'default', type: 'manual', name: '默认规则', rules: [] }
    }

    for (const ruleGroup of ruleGroups) {
      const matched = await this.matchRuleGroup(ruleGroup, videoInfo, settings)
      if (matched) return ruleGroup
    }

    return null
  }

  private async matchRuleGroup(
    ruleGroup: FeedAcRuleGroups,
    videoInfo: VideoInfo,
    settings: FeedAcSettingsV3
  ): Promise<boolean> {
    if (ruleGroup.type === 'ai' && ruleGroup.aiPrompt && this.aiService) {
      const videoInfoStr = JSON.stringify({
        author: videoInfo.author.nickname,
        videoDesc: videoInfo.description,
        videoTag: videoInfo.tags
      })

      try {
        const result = await this.aiService.analyzeVideoType(videoInfoStr, ruleGroup.aiPrompt)
        if (!result.shouldWatch) return false
      } catch {
        this.log('error', `AI分析失败`)
        return false
      }
    }

    if (ruleGroup.type === 'manual' && ruleGroup.rules) {
      const matches = ruleGroup.rules.map((rule) => {
        if (!rule.keyword) return false
        if (rule.field === 'nickName') return videoInfo.author.nickname.includes(rule.keyword)
        if (rule.field === 'videoDesc') return videoInfo.description.includes(rule.keyword)
        if (rule.field === 'videoTag') return videoInfo.tags.some((t) => t.includes(rule.keyword))
        return false
      })

      const matched = ruleGroup.relation === 'and' ? matches.every(Boolean) : matches.some(Boolean)
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

  private async executeOperations(
    videoInfo: VideoInfo,
    settings: FeedAcSettingsV3,
    taskType: TaskType,
    operationCounts: Record<string, number>
  ): Promise<Array<{ success: boolean; action: string }>> {
    const results: Array<{ success: boolean; action: string }> = []

    if (taskType === 'combo') {
      for (const op of settings.operations) {
        if (!op.enabled) continue
        if (op.maxCount && (operationCounts[op.type] || 0) >= op.maxCount) continue
        if (Math.random() > op.probability) continue

        const result = await this.executeSingleOperation(videoInfo, op.type, settings, op)
        results.push({ success: result.success, action: op.type })
        if (settings.comboStopOnFirstSuccess && result.success) break
      }
    } else {
      const operation = settings.operations.find(op => op.type === taskType)
      if (operation && operation.enabled) {
        if (Math.random() <= operation.probability) {
          const result = await this.executeSingleOperation(videoInfo, taskType, settings, operation)
          results.push({ success: result.success, action: taskType })
        }
      }
    }

    return results
  }

  private async executeSingleOperation(
    videoInfo: VideoInfo,
    operationType: string,
    settings: FeedAcSettingsV3,
    operation: FeedAcSettingsV3['operations'][0]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.adapter) return { success: false, error: 'Adapter not initialized' }

    switch (operationType) {
      case 'comment':
        return this.executeComment(videoInfo, settings, operation)
      case 'like':
        return this.executeLike(videoInfo.videoId)
      case 'collect':
        return this.executeCollect(videoInfo.videoId)
      case 'follow':
        return this.executeFollow(videoInfo.author.userId)
      default:
        return { success: false, error: `Unknown operation: ${operationType}` }
    }
  }

  private async executeComment(
    videoInfo: VideoInfo,
    settings: FeedAcSettingsV3,
    operation: FeedAcSettingsV3['operations'][0]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.adapter) return { success: false, error: 'Adapter not initialized' }

    await this.adapter.openCommentSection()
    await sleep(random(2000, 4000))

    if (settings.onlyCommentActiveVideo && this.adapter) {
      const commentData = await this.adapter.getCommentList(videoInfo.videoId)
      if (commentData && commentData.comments.length > 0) {
        const now = Math.floor(Date.now() / 1000)
        const recentComments = commentData.comments.filter(c => now - c.createTime < 2 * 24 * 60 * 60)
        if (recentComments.length < 2) {
          this.log('info', '视频活跃度不足')
          await this.adapter.closeCommentSection()
          return { success: false, error: '活跃度不足' }
        }
      }
    }

    let commentText = ''
    if (operation.aiEnabled && this.aiService && operation.aiPrompt) {
      try {
        const result = await this.aiService.generateComment(
          JSON.stringify({ author: videoInfo.author.nickname, videoDesc: videoInfo.description, videoTag: videoInfo.tags }),
          operation.aiPrompt
        )
        commentText = result.content
      } catch {
        commentText = this.getRandomComment(operation.commentTexts || [])
      }
    } else {
      commentText = this.getRandomComment(operation.commentTexts || [])
    }

    const result = await this.adapter.comment(videoInfo.videoId, commentText)
    if (this.adapter) await this.adapter.closeCommentSection()

    return { success: result.success, error: result.error }
  }

  private async executeLike(videoId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.adapter) return { success: false, error: 'Adapter not initialized' }
    return this.adapter.like(videoId)
  }

  private async executeCollect(videoId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.adapter) return { success: false, error: 'Adapter not initialized' }
    return this.adapter.collect(videoId)
  }

  private async executeFollow(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.adapter) return { success: false, error: 'Adapter not initialized' }
    return this.adapter.follow(userId)
  }

  private getRandomComment(texts: string[]): string {
    if (texts.length === 0) return '路过，点个赞吧'
    return texts[Math.floor(Math.random() * texts.length)]
  }

  private async recordSkip(videoInfo: VideoInfo, reason: string): Promise<void> {
    const record: VideoRecord = {
      videoId: videoInfo.videoId,
      authorName: videoInfo.author.nickname,
      authorId: videoInfo.author.userId,
      videoDesc: videoInfo.description,
      videoTags: videoInfo.tags,
      shareUrl: videoInfo.shareUrl,
      watchDuration: Date.now() - this.currentVideoStartTime,
      isLiked: false,
      isCollected: false,
      isFollowed: false,
      isCommented: false,
      skipReason: reason,
      timestamp: Date.now()
    }
    this.emit('progress', {
      message: `记录视频: ${record.authorName} - 跳过: ${reason}`,
      timestamp: Date.now()
    })
  }

  private getTaskTypeName(taskType: TaskType): string {
    const names: Record<TaskType, string> = {
      comment: '评论',
      like: '点赞',
      collect: '收藏',
      follow: '关注',
      watch: '观看',
      combo: '组合'
    }
    return names[taskType] || taskType
  }

  private getActionName(action: string): string {
    const names: Record<string, string> = {
      comment: '评论',
      like: '点赞',
      collect: '收藏',
      follow: '关注',
      watch: '观看'
    }
    return names[action] || action
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error' | 'success', message: string): void {
    const emojiMap: Record<string, string> = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      success: '✅'
    }
    const emoji = emojiMap[level] || 'ℹ️'
    const formattedMessage = `[TaskRunner] ${emoji} ${message}`
    log.info(formattedMessage)
    this.emit('progress', { message: formattedMessage, timestamp: Date.now() })
  }
}
