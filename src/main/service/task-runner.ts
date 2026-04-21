import { EventEmitter } from 'events'
import { chromium, Browser, BrowserContext, Page, type Response } from '@playwright/test'
import { BasePlatformAdapter, VideoRecord } from '../platform/base'
import { createPlatformAdapter } from '../platform/factory'
import { DouyinPlatformAdapter } from '../platform/douyin'
import { FeedAcSettingsV3, FeedAcRuleGroups } from '../../shared/feed-ac-setting'
import type { Platform, TaskType, VideoInfo } from '../../shared/platform'
import { PLATFORMS, PLATFORM_CONFIGS } from '../../shared/platform'
import { store, StorageKey } from '../utils/storage'
import { createAIService, type AIService } from '../integration/ai/factory'
import { AISettings } from '../../shared/ai-setting'
import { sleep, random, generateId } from '../utils/common'
import log from 'electron-log/main'
import { TaskHistoryRecord, LogEntry } from '../../shared/task-history'

export interface TaskRunConfig {
  browserExecPath: string
  platform: Platform
  taskType: TaskType
  settings: FeedAcSettingsV3
  accountId?: string
  crudTaskId?: string // CRUD 任务的 ID，用于 UI 关联
}

export type TaskRunnerStatus = 'running' | 'paused' | 'stopped' | 'completed' | 'failed'

export class TaskRunner extends EventEmitter {
  private browser?: Browser
  private context?: BrowserContext
  private adapter?: BasePlatformAdapter
  private _stopped = false
  private _paused = false
  private _closed = false
  private _stoppedEmitted = false
  private taskId = ''
  private currentVideoStartTime = 0
  private videoCache = new Map<string, any>()
  private aiService: AIService | null = null
  private consecutiveSkipCount = 0
  private platform: Platform = 'douyin'
  private _status: TaskRunnerStatus = 'running'
  private externalContext = false // 是否使用外部传入的context
  private _crudTaskId = '' // CRUD 任务 ID
  private _videoRecords: VideoRecord[] = []  // 视频操作记录
  private _operatedVideoIds = new Set<string>()  // 已操作过的视频ID，防止重复操作
  private _startTime = 0  // 任务开始时间
  private _accountId = ''  // 关联账号ID
  private _commentCount = 0  // 评论成功数
  private _likeCount = 0  // 点赞成功数
  private _collectCount = 0  // 收藏成功数
  private _followCount = 0  // 关注成功数
  private _logs: LogEntry[] = []  // 详细日志
  private currentVideoAIFilter?: { matched: boolean; reason: string; prompt?: string }  // 当前视频的AI过滤结果
  private currentVideoAIComment?: { comment: string; topComments?: Array<{ content: string; likeCount: number }>; prompt?: string }  // 当前视频的AI评论结果
  private preGeneratedComment?: { text: string; topComments: Array<{ content: string; likeCount: number }>; prompt?: string } | null

  get status(): TaskRunnerStatus {
    return this._status
  }

  get isPaused(): boolean {
    return this._paused
  }

  get isStopped(): boolean {
    return this._stopped
  }

  get crudTaskId(): string {
    return this._crudTaskId
  }

  set crudTaskId(value: string) {
    this._crudTaskId = value
  }

  /**
   * 启动任务 - 自行创建浏览器实例（兼容旧调用方式）
   */
  async start(config: TaskRunConfig): Promise<string> {
    this.externalContext = false
    this.taskId = generateId()
    this._stopped = false
    this._paused = false
    this._closed = false
    this._stoppedEmitted = false
    this._status = 'running'
    this._crudTaskId = config.crudTaskId || ''

    log.info(`TaskRunner ${this.taskId} starting...`)
    this.emit('progress', { message: `任务启动 (${PLATFORMS[config.platform].name})`, timestamp: Date.now() })

    this.platform = config.platform

    this.browser = await chromium.launch({
      executablePath: config.browserExecPath,
      headless: false
    })

    let storageState: any = store.get(StorageKey.AUTH)
    if (config.accountId) {
      const accounts = store.get(StorageKey.ACCOUNTS) as any[] || []
      const account = accounts.find((a: any) => a.id === config.accountId)
      
      // 如果 accountId 存在但找不到对应账号，抛出明确错误
      if (!account) {
        const error = `账号不存在: ID ${config.accountId} 未找到，请检查账号配置`
        log.error(`[TaskRunner ${this.taskId}] ${error}`)
        this._status = 'failed'
        this.emit('progress', { message: error, timestamp: Date.now() })
        throw new Error(error)
      }
      
      // 如果账号状态为 expired，抛出错误提示重新登录
      if (account.status === 'expired') {
        const error = `账号 "${account.name}" 登录态已过期，请重新登录`
        log.error(`[TaskRunner ${this.taskId}] ${error}`)
        this._status = 'failed'
        this.emit('progress', { message: error, timestamp: Date.now() })
        throw new Error(error)
      }
      
      if (account.storageState) {
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
    // 等待页面加载并让 feed API 数据先到达缓存
    await sleep(2000)
    log.info(`[TaskRunner ${this.taskId}] Page loaded, video cache size: ${this.videoCache.size}`)

    // 自动点击首页第一个视频进入播放模式
    await this.autoEnterVideoMode(config.settings)

    const aiSettings = store.get(StorageKey.AI_SETTINGS) as AISettings | null
    const needAI = config.settings.aiCommentEnabled || config.settings.operations?.some(op => op.aiEnabled)
    if (aiSettings && needAI) {
      this.aiService = createAIService(aiSettings.platform, {
        apiKey: aiSettings.apiKeys[aiSettings.platform],
        model: aiSettings.model,
        temperature: aiSettings.temperature
      })
    }

    // 异步执行任务循环
    this.runTask(config).catch((err) => {
      log.error(`TaskRunner ${this.taskId} error:`, err)
      this.handleRunTaskError()
    })

    return this.taskId
  }

  /**
   * 启动任务 - 使用外部传入的 BrowserContext（多任务并行模式）
   */
  async startWithContext(config: TaskRunConfig, context: BrowserContext): Promise<string> {
    this.externalContext = true
    this.taskId = generateId()
    this._stopped = false
    this._paused = false
    this._closed = false
    this._stoppedEmitted = false
    this._status = 'running'
    this._crudTaskId = config.crudTaskId || ''

    log.info(`TaskRunner ${this.taskId} starting with shared browser...`)
    this.emit('progress', { message: `任务启动 (${PLATFORMS[config.platform].name})`, timestamp: Date.now() })

    this.platform = config.platform
    this.context = context
    this.page = await context.newPage()
    this.setupVideoDataListener()

    this.adapter = createPlatformAdapter(config.platform)
    this.adapter.setPage(this.page)
    this.adapter.setVideoCache(this.videoCache)

    await this.page.goto(PLATFORMS[config.platform].homeUrl)
    // 等待页面加载并让 feed API 数据先到达缓存
    await sleep(2000)
    log.info(`[TaskRunner ${this.taskId}] Page loaded, video cache size: ${this.videoCache.size}`)

    // 自动点击首页第一个视频进入播放模式
    await this.autoEnterVideoMode(config.settings)

    const aiSettings = store.get(StorageKey.AI_SETTINGS) as AISettings | null
    const needAI = config.settings.aiCommentEnabled || config.settings.operations?.some(op => op.aiEnabled)
    if (aiSettings && needAI) {
      this.aiService = createAIService(aiSettings.platform, {
        apiKey: aiSettings.apiKeys[aiSettings.platform],
        model: aiSettings.model,
        temperature: aiSettings.temperature
      })
    }

    // 异步执行任务循环
    this.runTask(config).catch((err) => {
      log.error(`TaskRunner ${this.taskId} error:`, err)
      this.handleRunTaskError()
    })

    return this.taskId
  }

  private page?: Page

  private setupVideoDataListener(): void {
    if (!this.page) return

    const feedEndpoint = PLATFORM_CONFIGS[this.platform]?.apiEndpoints?.feed
    const feedPathSegment = '/aweme/v1/web/' // 抖音 feed API 路径段

    this.page.on('response', async (response: Response) => {
      const url = response.url()
      // 优先匹配配置的完整 URL，其次匹配路径段
      const isFeed = feedEndpoint
        ? url.includes(feedEndpoint) || url.includes(feedPathSegment)
        : url.includes('/aweme/v1/web/tab/feed/') || url.includes(feedPathSegment)
      if (isFeed) {
        try {
          const body = await response.json() as { aweme_list: any[] }
          if (body?.aweme_list) {
            const count = body.aweme_list.length
            body.aweme_list.forEach((video) => {
              this.videoCache.set(video.aweme_id, video)
            })
            log.info(`[TaskRunner ${this.taskId}] Feed API: cached ${count} videos, total cache: ${this.videoCache.size}`)
          }
        } catch (e) {
          log.warn(`[TaskRunner ${this.taskId}] Feed API: failed to parse response`)
        }
      }
    })
  }

  /**
   * 暂停任务
   */
  async pause(): Promise<void> {
    if (this._stopped) return
    this._paused = true
    this._status = 'paused'
    this.log('info', '任务已暂停')
    this.emit('paused', { taskId: this.taskId, timestamp: Date.now() })
  }

  /**
   * 恢复任务
   */
  async resume(): Promise<void> {
    if (this._stopped) return
    this._paused = false
    this._status = 'running'
    this.log('info', '任务已恢复')
    this.emit('resumed', { taskId: this.taskId, timestamp: Date.now() })
  }

  async stop(): Promise<void> {
    log.info(`TaskRunner ${this.taskId} stopping...`)
    // 若已终态，不要覆盖
    const isTerminal = this._status === 'completed' || this._status === 'failed' || this._status === 'stopped'
    this._stopped = true
    this._paused = false
    if (!isTerminal) {
      this._status = 'stopped'
    }
    await this.close()
    this.safeEmitStopped()
  }

  private handleRunTaskError(): void {
    // 若 stop() 已将状态置为终态（stopped/completed），不要覆盖为 failed
    if (this._status !== 'stopped' && this._status !== 'completed' && this._status !== 'failed') {
      this._status = 'failed'
    }
    this.safeEmitStopped()
  }

  private safeEmitStopped(): void {
    if (this._stoppedEmitted) return
    this._stoppedEmitted = true
    this.emit('stopped')
  }

  private async close(): Promise<void> {
    if (this._closed) return
    this._closed = true
    if (this.page && this.context) {
      try {
        const state = await this.context.storageState()
        store.set(StorageKey.AUTH, state)
      } catch (e) {
        log.warn('Failed to save storageState:', e)
      }
      await this.page.close().catch(() => {})
    }
    // 只关闭 context，不关闭共享的 browser
    if (this.context) {
      await this.context.close().catch(() => {})
    }
    // 如果是自己创建的浏览器，需要关闭
    if (!this.externalContext && this.browser) {
      await this.browser.close().catch(() => {})
    }
    this.page = undefined
    this.context = undefined
    this.browser = undefined
  }

  private async runTask(config: TaskRunConfig): Promise<void> {
    const settings = config.settings
    const maxCount = settings.maxCount || 10
    // taskType 从 TaskRunConfig.taskType 获取，这是唯一来源（来自 Task.taskType）
    const taskType = config.taskType
    const maxConsecutiveSkips = settings.maxConsecutiveSkips || 20
  
    // 初始化历史记录相关变量
    this._startTime = Date.now()
    this._videoRecords = []
    this._operatedVideoIds = new Set()
    this._accountId = config.accountId || ''
    this._commentCount = 0
    this._likeCount = 0
    this._collectCount = 0
    this._followCount = 0
    this._logs = []
  
    this.emit('progress', { message: `任务类型: ${this.getTaskTypeName(taskType)}, 目标: ${maxCount}`, timestamp: Date.now() })
  
    let completedCount = 0
    let operationCounts: Record<string, number> = {}
    this.consecutiveSkipCount = 0

    for (let i = 0; completedCount < maxCount && !this._stopped; i++) {
      // 暂停检查
      while (this._paused && !this._stopped) {
        await sleep(500)
      }
      if (this._stopped) break

      this.emit('progress', {
        message: `===== 处理第 ${i + 1} 个视频，已完成: ${completedCount}/${maxCount} =====`,
        timestamp: Date.now()
      })

      this.currentVideoStartTime = Date.now()
      // 重置当前视频的AI结果
      this.currentVideoAIFilter = undefined
      this.currentVideoAIComment = undefined
      this.preGeneratedComment = undefined

      const videoSwitchWaitRange = settings.videoSwitchWaitRange || [5, 10]
      const waitSeconds = random(videoSwitchWaitRange[0], videoSwitchWaitRange[1])
      await sleep(waitSeconds * 1000)

      const videoInfo = await this.getCurrentVideoInfo()
      if (!videoInfo) {
        this.log('warn', '未获取到视频信息，跳到下一个')
        this.consecutiveSkipCount++
        if (this.consecutiveSkipCount >= maxConsecutiveSkips) {
          this.log('error', `连续跳过 ${this.consecutiveSkipCount} 次，超过阈值 ${maxConsecutiveSkips}，任务暂停`)
          break
        }
        await this.goToNextVideo()
        continue
      }

      if (this._operatedVideoIds.has(videoInfo.videoId)) {
        this.log('info', `跳过(已操作过): @${videoInfo.author.nickname} [${videoInfo.videoId}]`)
        this.consecutiveSkipCount++
        if (this.consecutiveSkipCount >= maxConsecutiveSkips) {
          this.log('error', `连续跳过 ${this.consecutiveSkipCount} 次，超过阈值 ${maxConsecutiveSkips}，任务暂停`)
          break
        }
        await this.goToNextVideo()
        continue
      }

      // 检查视频类型（广告/直播/图集自动跳过）
      const videoTypeCheck = this.checkVideoType(videoInfo, settings)
      if (videoTypeCheck.shouldSkip) {
        this.log('info', `跳过${videoTypeCheck.reason}: @${videoInfo.author.nickname}`)
        await this.recordSkip(videoInfo, videoTypeCheck.reason)
        this.consecutiveSkipCount++
        if (this.consecutiveSkipCount >= maxConsecutiveSkips) {
          this.log('error', `连续跳过 ${this.consecutiveSkipCount} 次，超过阈值 ${maxConsecutiveSkips}，任务暂停`)
          break
        }
        await this.goToNextVideo()
        continue
      }

      // 检查视频分类
      const categoryCheck = await this.checkVideoCategory(videoInfo, settings)
      if (categoryCheck.shouldSkip) {
        this.log('info', `跳过(${categoryCheck.reason}): @${videoInfo.author.nickname}`)
        // 记录跳过的视频，包含AI分析结果
        await this.recordSkip(videoInfo, categoryCheck.reason, categoryCheck.aiResult)
        this.consecutiveSkipCount++
        if (this.consecutiveSkipCount >= maxConsecutiveSkips) {
          this.log('error', `连续跳过 ${this.consecutiveSkipCount} 次，超过阈值 ${maxConsecutiveSkips}，任务暂停`)
          break
        }
        await this.goToNextVideo()
        continue
      } else if (categoryCheck.aiResult) {
        // 即使没有跳过，也记录AI分析结果到当前视频
        this.currentVideoAIFilter = categoryCheck.aiResult
      }

      this.log('info', `视频作者: @${videoInfo.author.nickname}`)
      this.log('info', `视频描述: ${videoInfo.description}`)

      if (this.checkBlockKeywords(videoInfo, settings)) {
        this.log('info', `跳过(命中屏蔽词): @${videoInfo.author.nickname}`)
        await this.recordSkip(videoInfo, '命中屏蔽词')
        this.consecutiveSkipCount++
        await this.goToNextVideo()
        continue
      }

      const matchedRule = await this.matchRules(videoInfo, settings)
      if (!matchedRule) {
        this.log('info', '视频不满足任务规则')
        await this.recordSkip(videoInfo, '规则不匹配')
        this.consecutiveSkipCount++
        if (this.consecutiveSkipCount >= maxConsecutiveSkips) {
          this.log('error', `连续跳过 ${this.consecutiveSkipCount} 次，超过阈值 ${maxConsecutiveSkips}，任务暂停`)
          break
        }
        await this.goToNextVideo()
        continue
      }

      // 在观看等待之前预生成AI评论，利用等待时间并行完成
      const commentOp = taskType === 'combo'
        ? settings.operations.find(op => op.type === 'comment' && op.enabled)
        : (taskType === 'comment' ? settings.operations.find(op => op.type === 'comment') : undefined)
      let preGenPromise: Promise<void> | undefined
      if (commentOp) {
        preGenPromise = this.preGenerateComment(videoInfo, settings, commentOp)
      } else {
        this.preGeneratedComment = undefined
      }

      if (settings.simulateWatchBeforeComment) {
        const skipWatch = await this.simulateWatch(videoInfo, settings)
        if (skipWatch) {
          this.log('info', `跳过(观看中断): @${videoInfo.author.nickname}`)
          this.preGeneratedComment = undefined
          await this.recordSkip(videoInfo, '手动切换/长视频跳过')
          this.consecutiveSkipCount++
          continue
        }
      }

      // 确保预生成评论已完成
      if (preGenPromise) await preGenPromise

      const results = await this.executeOperations(videoInfo, settings, taskType, operationCounts)
      
      let anySuccess = false
      for (const result of results) {
        if (result.success) {
          anySuccess = true
          completedCount++
          operationCounts[result.action] = (operationCounts[result.action] || 0) + 1
          this.log('success', `${this.getActionName(result.action)}成功 (${operationCounts[result.action]}/${maxCount})`)
          this.emit('action', { videoId: videoInfo.videoId, action: result.action, success: true })
          // 更新操作计数
          if (result.action === 'comment') this._commentCount++
          if (result.action === 'like') this._likeCount++
          if (result.action === 'collect') this._collectCount++
          if (result.action === 'follow') this._followCount++
          // 实时更新历史记录
          this.emitHistoryUpdate()
          // 记录成功操作的视频
          this.recordSuccess(videoInfo, result.action, result.commentText)
        }
      }

      if (anySuccess) {
        this.consecutiveSkipCount = 0
        this._operatedVideoIds.add(videoInfo.videoId)
      }

      if (Math.random() < 0.1 && taskType !== 'like') {
        await this.executeLike(videoInfo.videoId)
      }

      await sleep(random(1000, 3000))

      // 检查是否已经在验证码处理时自动刷新了视频
      const hasAutoRefreshed = results.some(r => !r.success && r.error?.includes('验证码已处理'))
      if (!hasAutoRefreshed) {
        await this.goToNextVideo()
      }
    }

    if (this._stopped) {
      this._status = 'stopped'
    } else {
      this._status = 'completed'
    }

    this.log('success', `任务完成，共执行 ${completedCount} 次操作`)
    const summary = Object.entries(operationCounts)
      .map(([action, count]) => `${this.getActionName(action)}: ${count}`)
      .join(', ')
    if (summary) {
      this.log('info', `操作统计: ${summary}`)
    }

    await this.close()
    this.safeEmitStopped()
  }

  private async getCurrentVideoInfo(maxRetries = 3): Promise<VideoInfo | null> {
    if (!this.adapter || !this.page) return null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const videoId = await this.adapter.getActiveVideoId()
      if (!videoId) {
        log.info(`[TaskRunner ${this.taskId}] getCurrentVideoInfo attempt ${attempt + 1}/${maxRetries}: videoId not found`)
        if (attempt < maxRetries - 1) {
          await sleep(1000)
          continue
        }
        
        return null
      }

      const videoData = this.videoCache.get(videoId)
      if (!videoData) {
        log.info(`[TaskRunner ${this.taskId}] getCurrentVideoInfo attempt ${attempt + 1}/${maxRetries}: videoId=${videoId}, not in cache (cache size: ${this.videoCache.size})`)
        if (attempt < maxRetries - 1) {
          await sleep(1000)
          continue
        }
        // cache 未命中，尝试 adapter 的 getVideoInfo
        const adapterInfo = await this.adapter.getVideoInfo(videoId)
        if (adapterInfo) return adapterInfo

        return null
      }

      this.videoCache.delete(videoId)

      const rawDuration = videoData.video?.duration || videoData.duration
      let duration: number | undefined
      if (rawDuration) {
        duration = rawDuration > 1000 ? Math.floor(rawDuration / 1000) : rawDuration
      }

      if (!duration && this.page) {
        try {
          duration = await this.page.evaluate(() => {
            const el = document.querySelector('[data-e2e="feed-active-video"] .time-duration')
            if (!el) return undefined
            const parts = (el.textContent?.trim() || '').split(':').map(p => parseInt(p, 10))
            if (parts.length === 2) return parts[0] * 60 + parts[1]
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
            return undefined
          }) || undefined
        } catch { /* ignore */ }
      }

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
        likeCount: videoData.statistics?.digg_count || 0,
        collectCount: videoData.statistics?.collect_count || 0,
        shareCount: videoData.statistics?.share_count || 0,
        commentCount: videoData.statistics?.comment_count || 0,
        shareUrl: videoData.share_url || '',
        createTime: Date.now(),
        duration,
        _raw: videoData
      } as VideoInfo & { _raw: any }
    }

    return null
  }

  /**
   * DOM 降级提取视频信息 — 当 API cache 未命中时从页面 DOM 提取基础信息
   */
  private async getVideoInfoFromDOM(): Promise<VideoInfo | null> {
    if (!this.page) return null
    try {
      const info = await this.page.evaluate(() => {
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

        // 提取 videoId
        const vid = activeVideo.getAttribute('data-e2e-vid') || ''

        if (!vid && !nickname && !description) return null

        return {
          videoId: vid || `dom-${Date.now()}`,
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
      })
      if (info) {
        log.info(`[TaskRunner ${this.taskId}] DOM fallback: extracted info for @${info.author.nickname}`)
      }
      return info as VideoInfo | null
    } catch (e) {
      log.warn(`[TaskRunner ${this.taskId}] DOM fallback failed: ${e}`)
      return null
    }
  }

  /**
   * 检查视频类型，判断是否需要跳过广告/直播/图集
   */
  private checkVideoType(videoInfo: VideoInfo, settings: FeedAcSettingsV3): { shouldSkip: boolean; reason: string } {
    const raw = (videoInfo as any)._raw
    if (!raw) return { shouldSkip: false, reason: '' }

    if (this.adapter instanceof DouyinPlatformAdapter) {
      const isAd = raw.is_ads === true
      const isLive = raw.live_info && raw.live_info.room_id
      const awemeType = raw.aweme_type || 0

      if (settings.skipAdVideo && (isAd || (awemeType !== 0 && awemeType !== 2))) {
        if (isAd || awemeType === 1) {
          return { shouldSkip: true, reason: '广告视频' }
        }
      }

      if (settings.skipLiveVideo && (isLive || awemeType === 5)) {
        return { shouldSkip: true, reason: '直播视频' }
      }

      if (settings.skipImageSet && awemeType === 2) {
        return { shouldSkip: true, reason: '图集' }
      }
    }

    return { shouldSkip: false, reason: '' }
  }

  /**
   * 检查视频分类，判断是否在目标分类内
   */
  private async checkVideoCategory(videoInfo: VideoInfo, settings: FeedAcSettingsV3): Promise<{ shouldSkip: boolean; reason: string; aiResult?: { matched: boolean; reason: string; prompt?: string } }> {
    const { videoCategories } = settings
    if (!videoCategories?.enabled) return { shouldSkip: false, reason: '' }

    const { categories, customKeywords, mode, useAI, prioritizeAI, aiPrompt } = videoCategories
    const allKeywords = [...(categories || []), ...(customKeywords || [])]
    if (allKeywords.length === 0) return { shouldSkip: false, reason: '' }

    const textToMatch = `${videoInfo.description} ${videoInfo.tags.join(' ')}`

    // 优先使用AI分析（如果启用）
    if (prioritizeAI && useAI && this.aiService) {
      try {
        // 获取热门评论作为上下文
        let topComments: Array<{ content: string; likeCount: number }> = []
        if (this.adapter instanceof DouyinPlatformAdapter) {
          const refCount = Math.min(settings.commentReferenceCount || 3, 3) // 分类判断用较少评论
          this.log('info', `获取热门评论(${refCount}条)用于AI分类判断...`)
          topComments = await this.adapter.getTopComments(videoInfo.videoId, refCount)
        }

        const filterContext = {
          videoDesc: videoInfo.description,
          videoTags: videoInfo.tags,
          topComments,
          targetCategories: allKeywords
        }

        this.log('info', `使用AI判断视频分类...`)
        const result = await this.aiService.analyzeVideoCategory(filterContext, aiPrompt)

        const aiMatched = result.shouldWatch
        this.log('info', `AI判断结果: ${aiMatched ? '匹配' : '不匹配'} - ${result.reason}`)

        const aiResult = {
          matched: aiMatched,
          reason: result.reason || '',
          prompt: aiPrompt
        }

        // AI判断后，根据模式决定是否跳过
        if (mode === 'whitelist' && !aiMatched) {
          return { shouldSkip: true, reason: `AI判断: ${result.reason || '不在目标分类'}`, aiResult }
        }
        if (mode === 'blacklist' && aiMatched) {
          return { shouldSkip: true, reason: `AI判断: ${result.reason || '在排除分类'}`, aiResult }
        }

        return { shouldSkip: false, reason: '', aiResult }
      } catch (e) {
        this.log('warn', `AI分类分析失败: ${e}，回退到关键词匹配`)
        // AI失败，回退到关键词匹配
      }
    }

    // 关键词匹配（作为备选或非优先AI时使用）
    const keywordMatched = allKeywords.some(kw => textToMatch.includes(kw))

    // 如果关键词未匹配且启用了AI（但不优先），尝试AI判断
    if (!keywordMatched && useAI && !prioritizeAI && this.aiService) {
      try {
        let topComments: Array<{ content: string; likeCount: number }> = []
        if (this.adapter instanceof DouyinPlatformAdapter) {
          const refCount = Math.min(settings.commentReferenceCount || 3, 3)
          topComments = await this.adapter.getTopComments(videoInfo.videoId, refCount)
        }

        const filterContext = {
          videoDesc: videoInfo.description,
          videoTags: videoInfo.tags,
          topComments,
          targetCategories: allKeywords
        }

        const result = await this.aiService.analyzeVideoCategory(filterContext, aiPrompt)
        const aiMatched = result.shouldWatch

        const aiResult = {
          matched: aiMatched,
          reason: result.reason || '',
          prompt: aiPrompt
        }

        if (mode === 'whitelist' && !aiMatched) {
          return { shouldSkip: true, reason: `AI判断: ${result.reason || '不在目标分类'}`, aiResult }
        }
        if (mode === 'blacklist' && aiMatched) {
          return { shouldSkip: true, reason: `AI判断: ${result.reason || '在排除分类'}`, aiResult }
        }

        return { shouldSkip: false, reason: '', aiResult }
      } catch {
        this.log('warn', 'AI分类分析失败')
      }
    }

    // 最终根据关键词匹配结果决定
    if (mode === 'whitelist' && !keywordMatched) return { shouldSkip: true, reason: '不在目标分类' }
    if (mode === 'blacklist' && keywordMatched) return { shouldSkip: true, reason: '在排除分类' }

    return { shouldSkip: false, reason: '' }
  }

  /**
   * 计算观看时长
   */
  private calculateWatchTime(videoInfo: VideoInfo, settings: FeedAcSettingsV3): number {
    const mode = settings.watchTimeMode || 'fixed'

    if (mode === 'percentage' && videoInfo.duration) {
      // 根据视频时长百分比计算
      const percentageRange = settings.watchTimePercentageRange || [0.2, 0.5]
      const minPercentage = percentageRange[0]
      const maxPercentage = percentageRange[1]
      const percentage = minPercentage + Math.random() * (maxPercentage - minPercentage)
      const watchTime = Math.floor(videoInfo.duration * percentage * 1000)
      // 限制最小1秒，最大不超过视频时长
      return Math.max(1000, Math.min(watchTime, videoInfo.duration * 1000))
    }

    // 固定时长模式
    const minSeconds = settings.watchTimeRangeSeconds[0]
    const maxSeconds = settings.watchTimeRangeSeconds[1]
    return random(minSeconds, maxSeconds) * 1000
  }

  private async hasVideoChanged(originalVideoId: string): Promise<boolean> {
    if (!this.adapter) return false
    const currentId = await this.adapter.getActiveVideoId()
    return currentId !== null && currentId !== originalVideoId
  }

  private async simulateWatch(
    videoInfo: VideoInfo,
    settings: FeedAcSettingsV3
  ): Promise<boolean> {
    const duration = videoInfo.duration || 0
    const threshold = settings.longVideoThreshold || 120
    const longVideoAction = settings.longVideoAction || 'skip'
    const isLongVideo = duration > 0 && duration > threshold

    let playbackRate = 1.0

    if (isLongVideo) {
      this.log('info', `长视频检测: ${duration}秒 (阈值: ${threshold}秒)`)
      if (longVideoAction === 'skip') {
        this.log('info', '长视频策略: 跳过')
        return true
      }
      if (longVideoAction === 'speed' && this.adapter) {
        playbackRate = settings.longVideoSpeed || 2.0
        this.log('info', `长视频策略: 倍速播放 ${playbackRate}x`)
        if ('setPlaybackRate' in this.adapter) {
          await (this.adapter as any).setPlaybackRate(playbackRate)
        }
      }
    }

    let watchTimeMs = this.calculateWatchTime(videoInfo, settings)
    // 倍速播放时，实际等待时间需要除以播放速率
    if (playbackRate > 1) {
      const original = watchTimeMs
      watchTimeMs = Math.max(Math.floor(watchTimeMs / playbackRate), 1000)
      this.log('info', `倍速 ${playbackRate}x: 计划观看 ${(original / 1000).toFixed(1)}秒 → 实际等待 ${(watchTimeMs / 1000).toFixed(1)}秒`)
    }
    const progress = this.adapter && 'getPlaybackProgress' in this.adapter
      ? await (this.adapter as any).getPlaybackProgress()
      : null

    if (progress && progress.current > 0) {
      const alreadyWatchedWallMs = progress.current * 1000 / playbackRate
      const adjustedMs = Math.max(watchTimeMs - alreadyWatchedWallMs, 1000)
      this.log('info', `当前播放进度: ${this.formatTime(progress.current)}/${this.formatTime(progress.total)} (${playbackRate}x), 计划等待 ${(watchTimeMs / 1000).toFixed(1)}秒, 扣除已播放后实际等待 ${(adjustedMs / 1000).toFixed(1)}秒`)
      watchTimeMs = adjustedMs
    } else {
      this.log('info', `模拟观看 ${(watchTimeMs / 1000).toFixed(1)}秒`)
    }

    const checkInterval = 1000
    let elapsed = 0
    while (elapsed < watchTimeMs && !this._stopped) {
      while (this._paused && !this._stopped) {
        await sleep(500)
      }
      if (this._stopped) break

      if (await this.hasVideoChanged(videoInfo.videoId)) {
        this.log('info', '检测到视频已切换，中止当前操作')
        if (playbackRate > 1 && this.adapter && 'setPlaybackRate' in this.adapter) {
          await (this.adapter as any).setPlaybackRate(1.0)
        }
        return true
      }

      await sleep(checkInterval)
      elapsed += checkInterval
    }

    if (playbackRate > 1 && this.adapter && 'setPlaybackRate' in this.adapter) {
      await (this.adapter as any).setPlaybackRate(1.0)
    }

    return false
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  /**
   * 自动进入视频播放模式（点击首页第一个视频）
   */
  private async autoEnterVideoMode(settings?: FeedAcSettingsV3): Promise<void> {
    if (!this.page) return
    try {
      // 从首页提取第一个视频的 aweme_id
      const awemeId = await this.page.evaluate(() => {
        const el = document.querySelector('[data-aweme-id]')
        return el?.getAttribute('data-aweme-id') || null
      })

      if (awemeId) {
        log.info(`[TaskRunner ${this.taskId}] 提取到视频ID: ${awemeId}，跳转精选页`)
        await this.page.goto(`https://www.douyin.com/jingxuan?modal_id=${awemeId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        })
        await sleep(2000)

        // 等待视频播放器加载
        await this.page.waitForSelector('[data-e2e="feed-active-video"]', {
          state: 'visible',
          timeout: 10000
        }).catch(() => null)

        // 按 K 关闭连播功能
        await this.page.keyboard.press('k')
        await sleep(500)
        log.info(`[TaskRunner ${this.taskId}] 已关闭连播功能`)
      } else {
        log.warn(`[TaskRunner ${this.taskId}] 未找到 data-aweme-id，尝试点击首页视频`)
        const firstVideo = await this.page.waitForSelector('[data-e2e="recommend-list-item-container"]', {
          timeout: 5000
        }).catch(() => null)
        if (firstVideo) {
          await firstVideo.click()
          await sleep(1500)
        }
      }

      // 关闭操作指引弹窗（如果存在）
      try {
        const guideBtn = await this.page.$('[data-e2e="recommend-guide-mask"] button')
        if (guideBtn) {
          await guideBtn.click()
          await sleep(500)
          log.info(`[TaskRunner ${this.taskId}] 已关闭操作指引弹窗`)
        }
      } catch {
        // 弹窗可能不存在，忽略
      }

      // 自动静音
      if (settings?.autoMute !== false) {
        try {
          const volumeBtn = await this.page.$('.xgplayer-volume')
          if (volumeBtn) {
            await volumeBtn.click()
            await sleep(300)
            log.info(`[TaskRunner ${this.taskId}] 已自动静音`)
          }
        } catch (e) {
          log.warn(`[TaskRunner ${this.taskId}] 自动静音失败: ${e}`)
        }
      }

      log.info(`[TaskRunner ${this.taskId}] 已进入视频播放模式`)
    } catch (e) {
      log.warn(`[TaskRunner ${this.taskId}] 自动进入视频模式失败: ${e}`)
    }
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
  ): Promise<Array<{ success: boolean; action: string; commentText?: string; error?: string }>> {
    const results: Array<{ success: boolean; action: string; commentText?: string; error?: string }> = []

    if (taskType === 'combo') {
      for (const op of settings.operations) {
        if (!op.enabled) {
          this.log('info', `跳过操作 ${this.getActionName(op.type)}: 未启用`)
          continue
        }
        if (op.maxCount && (operationCounts[op.type] || 0) >= op.maxCount) {
          this.log('info', `跳过操作 ${this.getActionName(op.type)}: 已达上限 ${op.maxCount}`)
          continue
        }
        if (Math.random() > op.probability) {
          this.log('info', `跳过操作 ${this.getActionName(op.type)}: 概率未命中 (${(op.probability * 100).toFixed(0)}%)`)
          continue
        }

        if (await this.hasVideoChanged(videoInfo.videoId)) {
          this.log('info', '执行操作时检测到视频已切换，中止剩余操作')
          break
        }

        const result = await this.executeSingleOperation(videoInfo, op.type, settings, op)
        results.push({ success: result.success, action: op.type, commentText: result.commentText, error: result.error })
        if (settings.comboStopOnFirstSuccess && result.success) break
      }
    } else {
      const operation = settings.operations.find(op => op.type === taskType)
      if (operation && operation.enabled) {
        if (await this.hasVideoChanged(videoInfo.videoId)) {
          this.log('info', '执行操作时检测到视频已切换，跳过当前操作')
          return results
        }
        if (Math.random() <= operation.probability) {
          const result = await this.executeSingleOperation(videoInfo, taskType, settings, operation)
          results.push({ success: result.success, action: taskType, commentText: result.commentText, error: result.error })
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
  ): Promise<{ success: boolean; error?: string; commentText?: string }> {
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

  private async preGenerateComment(
    videoInfo: VideoInfo,
    settings: FeedAcSettingsV3,
    operation: FeedAcSettingsV3['operations'][0]
  ): Promise<void> {
    const useAI = (operation.aiEnabled || settings.aiCommentEnabled) && this.aiService
    if (!useAI) {
      this.preGeneratedComment = null
      return
    }

    try {
      let topComments: Array<{ content: string; likeCount: number }> = []
      if (this.adapter instanceof DouyinPlatformAdapter) {
        const refCount = settings.commentReferenceCount || 5
        this.log('info', `[预生成] 获取热门评论(${refCount}条)作为AI参考...`)
        topComments = await this.adapter.getTopComments(videoInfo.videoId, refCount)
        if (topComments.length > 0) {
          this.log('info', `[预生成] 获取到 ${topComments.length} 条热门评论`)
        }
      }

      const videoContext = {
        author: videoInfo.author.nickname,
        videoDesc: videoInfo.description,
        videoTags: videoInfo.tags,
        topComments
      }
      const commentOptions = {
        style: settings.commentStyle || 'mixed',
        maxLength: settings.commentMaxLength || 50,
        customPrompt: operation.aiPrompt,
        systemPrompt: settings.commentSystemPrompt
      }

      const result = await this.aiService!.generateComment(videoContext, commentOptions)
      this.preGeneratedComment = {
        text: result.content,
        topComments,
        prompt: operation.aiPrompt || settings.commentSystemPrompt
      }
      this.log('info', `[预生成] AI评论已就绪: ${result.content}`)
    } catch {
      this.log('warn', '[预生成] AI评论生成失败，将在评论时使用备选')
      this.preGeneratedComment = null
    }
  }

  private async executeComment(
    videoInfo: VideoInfo,
    settings: FeedAcSettingsV3,
    operation: FeedAcSettingsV3['operations'][0]
  ): Promise<{ success: boolean; error?: string; commentText?: string }> {
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
    const useAI = (operation.aiEnabled || settings.aiCommentEnabled) && this.aiService

    if (useAI && this.preGeneratedComment) {
      commentText = this.preGeneratedComment.text
      this.log('info', `使用预生成AI评论: ${commentText}`)
      this.currentVideoAIComment = {
        comment: commentText,
        topComments: this.preGeneratedComment.topComments,
        prompt: this.preGeneratedComment.prompt
      }
      this.preGeneratedComment = undefined
    } else if (useAI) {
      try {
        let topComments: Array<{ content: string; likeCount: number }> = []
        if (this.adapter instanceof DouyinPlatformAdapter) {
          const refCount = settings.commentReferenceCount || 5
          this.log('info', `获取热门评论(${refCount}条)作为AI参考...`)
          topComments = await this.adapter.getTopComments(videoInfo.videoId, refCount)
          if (topComments.length > 0) {
            this.log('info', `获取到 ${topComments.length} 条热门评论`)
          }
        }

        const videoContext = {
          author: videoInfo.author.nickname,
          videoDesc: videoInfo.description,
          videoTags: videoInfo.tags,
          topComments
        }
        const commentOptions = {
          style: settings.commentStyle || 'mixed',
          maxLength: settings.commentMaxLength || 50,
          customPrompt: operation.aiPrompt,
          systemPrompt: settings.commentSystemPrompt
        }

        const result = await this.aiService!.generateComment(videoContext, commentOptions)
        commentText = result.content
        this.log('info', `AI生成评论: ${commentText}`)

        this.currentVideoAIComment = {
          comment: commentText,
          topComments,
          prompt: operation.aiPrompt || settings.commentSystemPrompt
        }
      } catch {
        this.log('warn', 'AI生成评论失败，使用备选评论')
        commentText = this.getRandomComment(operation.commentTexts || [])
      }
    } else {
      commentText = this.getRandomComment(operation.commentTexts || [])
    }

    const result = await this.adapter.comment(videoInfo.videoId, commentText)

    // 如果评论失败且错误信息包含"验证码已处理"，说明已经自动刷新了视频，不需要再关闭评论区
    if (!result.success && result.error?.includes('验证码已处理')) {
      return { success: false, error: result.error, commentText: undefined }
    }

    if (this.adapter) await this.adapter.closeCommentSection()

    return { success: result.success, error: result.error, commentText: result.success ? commentText : undefined }
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

  private async recordSkip(videoInfo: VideoInfo, reason: string, aiResult?: { matched: boolean; reason: string; prompt?: string }): Promise<void> {
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
      timestamp: Date.now(),
      aiFilterResult: aiResult
    }
    this._videoRecords.push(record)
    this.emit('progress', {
      message: `记录视频: ${record.authorName} - 跳过: ${reason}`,
      timestamp: Date.now()
    })
  }
  
  /**
   * 记录成功操作的视频
   */
  private recordSuccess(videoInfo: VideoInfo, action: string, commentText?: string): void {
    // 查找是否已有该视频的记录（可能之前记录过跳过或其他操作）
    const existingIndex = this._videoRecords.findIndex(r => r.videoId === videoInfo.videoId)

    if (existingIndex >= 0) {
      // 更新现有记录
      const record = this._videoRecords[existingIndex]
      if (action === 'comment') {
        record.isCommented = true
        record.commentText = commentText
        // 添加AI评论结果
        if (this.currentVideoAIComment) {
          record.aiCommentResult = this.currentVideoAIComment
        }
      } else if (action === 'like') {
        record.isLiked = true
      } else if (action === 'collect') {
        record.isCollected = true
      } else if (action === 'follow') {
        record.isFollowed = true
      }
      record.skipReason = undefined  // 成功操作后移除跳过原因
      // 添加AI过滤结果（如果有）
      if (this.currentVideoAIFilter && !record.aiFilterResult) {
        record.aiFilterResult = this.currentVideoAIFilter
      }
    } else {
      // 创建新记录
      const record: VideoRecord = {
        videoId: videoInfo.videoId,
        authorName: videoInfo.author.nickname,
        authorId: videoInfo.author.userId,
        videoDesc: videoInfo.description,
        videoTags: videoInfo.tags,
        shareUrl: videoInfo.shareUrl,
        watchDuration: Date.now() - this.currentVideoStartTime,
        isLiked: action === 'like',
        isCollected: action === 'collect',
        isFollowed: action === 'follow',
        isCommented: action === 'comment',
        commentText: action === 'comment' ? commentText : undefined,
        timestamp: Date.now(),
        aiFilterResult: this.currentVideoAIFilter,
        aiCommentResult: action === 'comment' ? this.currentVideoAIComment : undefined
      }
      this._videoRecords.push(record)
    }
  }
  
  /**
   * 构建历史记录对象
   */
  buildHistoryRecord(taskId: string, taskName: string, accountId: string, platform: string): TaskHistoryRecord {
    // 根据状态决定 endTime 和 status
    let endTime: number | null = null
    let status: TaskHistoryRecord['status'] = 'running'

    if (this._status === 'completed' || this._status === 'stopped' || this._status === 'failed') {
      endTime = Date.now()
      status = this._status === 'failed' ? 'error' : this._status
    } else if (this._status === 'running') {
      status = 'running'
    } else if (this._status === 'paused') {
      status = 'paused'
    }

    return {
      id: this.taskId,
      taskId,
      taskName,
      accountId,
      platform,
      startTime: this._startTime,
      endTime,
      status,
      commentCount: this._commentCount,
      likeCount: this._likeCount,
      collectCount: this._collectCount,
      followCount: this._followCount,
      videoRecords: [...this._videoRecords],
      settings: {},
      logs: [...this._logs]
    }
  }

  /**
   * 添加详细日志
   */
  private addDetailedLog(level: 'info' | 'warn' | 'error', message: string, data?: LogEntry['data']): void {
    const logEntry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data
    }
    this._logs.push(logEntry)
    // 发送日志事件到前端
    this.emit('detailedLog', logEntry)
  }

  /**
   * 实时更新历史记录
   */
  private emitHistoryUpdate(): void {
    this.emit('historyUpdate', {
      commentCount: this._commentCount,
      likeCount: this._likeCount,
      collectCount: this._collectCount,
      followCount: this._followCount
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
