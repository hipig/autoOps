import { EventEmitter } from 'events'
import { Browser, BrowserContext, chromium } from '@playwright/test'
import { TaskRunner, TaskRunConfig, TaskRunnerStatus } from './task-runner'
import { store, StorageKey } from '../utils/storage'
import { sleep, generateId } from '../utils/common'
import type { Platform, TaskType } from '../../shared/platform'
import type { FeedAcSettingsV3, FeedAcSettingsV2 } from '../../shared/feed-ac-setting'
import { migrateToV3 } from '../../shared/feed-ac-setting'
import { TaskHistoryRecord } from '../../shared/task-history'
import log from 'electron-log/main'

export interface TaskStatusInfo {
  taskId: string
  taskName?: string
  crudTaskId?: string
  status: TaskRunnerStatus
  platform: Platform
  accountId?: string
  startedAt: number
  progress?: string
}

interface QueuedTask {
  queueId: string
  config: TaskRunConfig
  taskName?: string
  enqueuedAt: number
}

interface ScheduleInfo {
  taskId: string
  cron: string
  enabled: boolean
  nextRunAt?: number
  lastRunAt?: number
  timerId?: ReturnType<typeof setInterval>
}

interface AccountTaskPolicy {
  maxConcurrentTasks: number
  cooldownMs: number
}

const DEFAULT_ACCOUNT_POLICY: AccountTaskPolicy = {
  maxConcurrentTasks: 1,
  cooldownMs: 5000
}

export class TaskManager extends EventEmitter {
  private browser?: Browser
  private runners: Map<string, TaskRunner> = new Map()
  private taskQueue: QueuedTask[] = []
  private schedules: Map<string, ScheduleInfo> = new Map()
  private maxConcurrency: number = 3
  private accountPolicies: Map<string, AccountTaskPolicy> = new Map()
  private accountLastRunTime: Map<string, number> = new Map()
  private browserExecPath: string = ''
  private isShuttingDown = false

  constructor() {
    super()
  }

  /**
   * 初始化：加载存储的配置
   */
  async init(): Promise<void> {
    const execPath = store.get(StorageKey.BROWSER_EXEC_PATH) as string | null
    if (execPath) {
      this.browserExecPath = execPath
    }
    const concurrency = store.get('taskConcurrency' as any) as number | null
    if (concurrency) {
      this.maxConcurrency = concurrency
    }
    // 恢复定时任务
    const savedSchedules = store.get('taskSchedules' as any) as ScheduleInfo[] | null
    if (savedSchedules) {
      for (const schedule of savedSchedules) {
        if (schedule.enabled) {
          this.restoreSchedule(schedule)
        }
      }
    }
    log.info(`[TaskManager] Initialized, maxConcurrency=${this.maxConcurrency}`)
  }

  /**
   * 设置浏览器执行路径
   */
  setBrowserExecPath(path: string): void {
    this.browserExecPath = path
  }

  /**
   * 设置最大并行数
   */
  setMaxConcurrency(max: number): void {
    this.maxConcurrency = Math.max(1, Math.min(10, max))
    store.set('taskConcurrency' as any, this.maxConcurrency)
    log.info(`[TaskManager] Max concurrency set to ${this.maxConcurrency}`)
    // 尝试启动队列中的任务
    this.processQueue()
  }

  getMaxConcurrency(): number {
    return this.maxConcurrency
  }

  /**
   * 获取或创建共享浏览器实例
   */
  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      if (!this.browserExecPath) {
        throw new Error('浏览器路径未配置，请先在设置中配置浏览器')
      }
      log.info('[TaskManager] Launching shared browser instance...')
      this.browser = await chromium.launch({
        executablePath: this.browserExecPath,
        headless: false
      })
      this.browser.on('disconnected', () => {
        log.info('[TaskManager] Browser disconnected')
        this.browser = undefined
      })
    }
    return this.browser
  }

  /**
   * 创建带账号存储状态的 BrowserContext
   */
  private async createContext(config: TaskRunConfig): Promise<BrowserContext> {
    const browser = await this.ensureBrowser()

    let storageState: any = undefined
    if (config.accountId) {
      const accounts = store.get(StorageKey.ACCOUNTS) as any[] || []
      const account = accounts.find((a: any) => a.id === config.accountId)
      if (account?.storageState) {
        try {
          storageState = JSON.parse(account.storageState)
          log.info(`[TaskManager] Using storageState for account: ${account.name}`)
        } catch (e) {
          log.warn('[TaskManager] Failed to parse account storageState')
        }
      }
    } else {
      // 使用全局auth
      const globalAuth = store.get(StorageKey.AUTH)
      if (globalAuth) {
        storageState = globalAuth
      }
    }

    return browser.newContext({ storageState })
  }

  /**
   * 检查账号并发限制
   */
  private canStartForAccount(accountId?: string): boolean {
    if (!accountId) return true
    const policy = this.accountPolicies.get(accountId) || DEFAULT_ACCOUNT_POLICY
    const runningCount = Array.from(this.runners.values())
      .filter(r => (r as any).accountId === accountId).length
    if (runningCount >= policy.maxConcurrentTasks) return false

    // 冷却时间检查
    const lastRun = this.accountLastRunTime.get(accountId) || 0
    if (Date.now() - lastRun < policy.cooldownMs) return false

    return true
  }

  /**
   * 启动任务
   */
  async startTask(config: TaskRunConfig, taskName?: string): Promise<string> {
    if (this.isShuttingDown) {
      throw new Error('TaskManager is shutting down')
    }

    if (!this.browserExecPath) {
      throw new Error('浏览器路径未配置')
    }

    // 检查并发限制
    const runningCount = this.runners.size
    const canStart = runningCount < this.maxConcurrency && this.canStartForAccount(config.accountId)

    if (!canStart) {
      // 加入队列
      const queueId = generateId()
      this.taskQueue.push({
        queueId,
        config,
        taskName,
        enqueuedAt: Date.now()
      })
      log.info(`[TaskManager] Task queued (running: ${runningCount}/${this.maxConcurrency})`)
      this.emit('queued', { queueId, taskName })
      return queueId
    }

    // 直接启动
    const runner = new TaskRunner()
    const context = await this.createContext(config)

    // 存储accountId到runner上以便并发控制
    ;(runner as any).accountId = config.accountId
    // 存储 crudTaskId 和 taskName
    ;(runner as any).crudTaskId = config.crudTaskId
    ;(runner as any).taskName = taskName
    ;(runner as any).startedAt = Date.now()

    const taskId = await runner.startWithContext(config, context)
    this.runners.set(taskId, runner)
    this.accountLastRunTime.set(config.accountId || '', Date.now())

    // 存储 platform 到 runner
    ;(runner as any).platform = config.platform

    // 绑定事件转发
    this.forwardRunnerEvents(taskId, runner)

    // 延迟保存初始历史记录（等待任务初始化完成）
    setTimeout(() => {
      this.saveTaskHistory(runner, taskId)
    }, 1000)

    // 任务停止后清理
    runner.on('stopped', () => {
      // 构建并保存历史记录
      try {
        const crudTaskId = (runner as any).crudTaskId || ''
        const taskNameFromRunner = (runner as any).taskName || '未命名任务'
        const accountId = config.accountId || ''
        const platform = config.platform

        const historyRecord = runner.buildHistoryRecord(
          crudTaskId,
          taskNameFromRunner,
          accountId,
          platform
        )

        // 读取现有历史并添加新记录
        const existingHistory = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] | null || []
        const existingIndex = existingHistory.findIndex(h => h.id === historyRecord.id)

        if (existingIndex >= 0) {
          // 更新现有记录
          existingHistory[existingIndex] = historyRecord
        } else {
          // 添加新记录
          existingHistory.unshift(historyRecord)
        }

        store.set(StorageKey.TASK_HISTORY, existingHistory)
        log.info(`[TaskManager] Task history saved: ${historyRecord.id}`)
      } catch (err) {
        log.error('[TaskManager] Failed to save task history:', err)
      }

      this.runners.delete(taskId)
      log.info(`[TaskManager] Task ${taskId} stopped, remaining: ${this.runners.size}`)
      this.emit('taskStopped', { taskId, status: runner.status })
      // 处理队列
      this.processQueue()
    })

    // 监听实时历史更新事件
    runner.on('historyUpdate', (counts: any) => {
      this.emit('historyUpdate', { taskId, ...counts })
      // 实时保存历史记录
      this.saveTaskHistory(runner, taskId)
    })

    // 监听详细日志事件
    runner.on('detailedLog', (logEntry: any) => {
      this.emit('detailedLog', { taskId, logEntry })
      // 实时保存历史记录（包含日志）
      this.saveTaskHistory(runner, taskId)
    })

    this.emit('taskStarted', { taskId, taskName })
    return taskId
  }

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    const runner = this.runners.get(taskId)
    if (!runner) {
      return { success: false, error: 'Task not found or not running' }
    }
    if (runner.isPaused) {
      return { success: false, error: 'Task already paused' }
    }
    await runner.pause()
    // 暂停时保存历史记录（状态仍为 running）
    setTimeout(() => {
      this.saveTaskHistory(runner, taskId)
    }, 100)
    return { success: true }
  }

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    const runner = this.runners.get(taskId)
    if (!runner) {
      return { success: false, error: 'Task not found or not running' }
    }
    if (!runner.isPaused) {
      return { success: false, error: 'Task is not paused' }
    }
    await runner.resume()
    return { success: true }
  }

  /**
   * 停止任务
   */
  async stopTask(taskId: string): Promise<{ success: boolean; error?: string }> {
    const runner = this.runners.get(taskId)
    if (!runner) {
      return { success: false, error: 'Task not found' }
    }
    await runner.stop()
    // 停止操作会触发 'stopped' 事件，在事件处理中保存历史记录
    return { success: true }
  }

  /**
   * 保存任务历史记录
   */
  private saveTaskHistory(runner: TaskRunner, taskId: string): void {
    try {
      const crudTaskId = (runner as any).crudTaskId || ''
      const taskName = (runner as any).taskName || '未命名任务'
      const accountId = (runner as any).accountId || ''
      const platform = (runner as any).platform || 'douyin'

      const historyRecord = runner.buildHistoryRecord(
        crudTaskId,
        taskName,
        accountId,
        platform
      )

      // 读取现有历史并更新或添加记录
      const existingHistory = store.get(StorageKey.TASK_HISTORY) as TaskHistoryRecord[] | null || []
      const existingIndex = existingHistory.findIndex(h => h.id === historyRecord.id)

      if (existingIndex >= 0) {
        // 更新现有记录
        existingHistory[existingIndex] = historyRecord
      } else {
        // 添加新记录
        existingHistory.unshift(historyRecord)
      }

      store.set(StorageKey.TASK_HISTORY, existingHistory)
      log.info(`[TaskManager] Task history saved: ${historyRecord.id}`)
    } catch (err) {
      log.error('[TaskManager] Failed to save task history:', err)
    }
  }

  /**
   * 停止所有任务
   */
  async stopAll(): Promise<void> {
    this.isShuttingDown = true
    // 取消所有定时任务
    for (const [taskId, schedule] of this.schedules) {
      if (schedule.timerId) {
        clearInterval(schedule.timerId)
      }
    }
    this.schedules.clear()

    // 停止所有运行中的任务
    const stopPromises = Array.from(this.runners.entries()).map(([id, runner]) =>
      runner.stop().catch(err => log.error(`[TaskManager] Error stopping task ${id}:`, err))
    )
    await Promise.all(stopPromises)
    this.runners.clear()

    // 清空队列
    this.taskQueue = []

    // 关闭共享浏览器
    if (this.browser) {
      await this.browser.close().catch(() => {})
      this.browser = undefined
    }

    this.isShuttingDown = false
    log.info('[TaskManager] All tasks stopped')
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskStatusInfo | null {
    const runner = this.runners.get(taskId)
    if (!runner) return null
    return {
      taskId,
      taskName: (runner as any).taskName,
      crudTaskId: runner.crudTaskId || undefined,
      status: runner.status,
      platform: (runner as any).platform || 'douyin',
      accountId: (runner as any).accountId,
      startedAt: (runner as any).startedAt || Date.now()
    }
  }

  /**
   * 获取所有运行中任务
   */
  getAllRunningTasks(): TaskStatusInfo[] {
    return Array.from(this.runners.entries()).map(([id, runner]) => ({
      taskId: id,
      taskName: (runner as any).taskName,
      crudTaskId: runner.crudTaskId || undefined,
      status: runner.status,
      platform: (runner as any).platform || 'douyin',
      accountId: (runner as any).accountId,
      startedAt: (runner as any).startedAt || Date.now()
    }))
  }

  /**
   * 获取队列中等待的任务数
   */
  getQueueSize(): number {
    return this.taskQueue.length
  }

  /**
   * 从队列中移除任务
   */
  removeFromQueue(queueId: string): boolean {
    const index = this.taskQueue.findIndex(t => t.queueId === queueId)
    if (index !== -1) {
      this.taskQueue.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.runners.size < this.maxConcurrency) {
      const next = this.taskQueue[0]
      if (!this.canStartForAccount(next.config.accountId)) {
        // 跳过此任务，找下一个
        const altIndex = this.taskQueue.findIndex(t =>
          this.canStartForAccount(t.config.accountId)
        )
        if (altIndex === -1) break
        this.taskQueue.splice(altIndex, 1)[0]
        this.taskQueue.unshift(next)
        // 如果下一个还是不满足，退出
        if (!this.canStartForAccount(next.config.accountId)) break
        break
      }

      this.taskQueue.shift()
      try {
        await this.startTask(next.config, next.taskName)
      } catch (err) {
        log.error('[TaskManager] Failed to start queued task:', err)
      }
    }
  }

  /**
   * 转发 runner 事件到 manager
   */
  private forwardRunnerEvents(taskId: string, runner: TaskRunner): void {
    runner.on('progress', (data: any) => {
      this.emit('progress', { ...data, taskId })
    })
    runner.on('action', (data: any) => {
      this.emit('action', { ...data, taskId })
    })
    runner.on('paused', (data: any) => {
      this.emit('paused', { ...data, taskId })
    })
    runner.on('resumed', (data: any) => {
      this.emit('resumed', { ...data, taskId })
    })
  }

  /**
   * 设置定时任务
   */
  async scheduleTask(taskId: string, cronExpression: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 验证cron表达式
      const cronParser = await import('cron-parser')
      const interval = cronParser.parseExpression(cronExpression)
      const nextRun = interval.next().getTime()

      // 如果已有定时，先取消
      if (this.schedules.has(taskId)) {
        this.cancelSchedule(taskId)
      }

      const schedule: ScheduleInfo = {
        taskId,
        cron: cronExpression,
        enabled: true,
        nextRunAt: nextRun
      }

      // 使用 setInterval 定期检查
      schedule.timerId = setInterval(async () => {
        const now = Date.now()
        const nextTime = schedule.nextRunAt
        if (nextTime && now >= nextTime) {
          try {
            const cronParser2 = await import('cron-parser')
            const interval2 = cronParser2.parseExpression(cronExpression)
            const next = interval2.next().getTime()
            schedule.nextRunAt = next
            schedule.lastRunAt = now
            this.saveSchedules()

            // 触发任务
            this.emit('scheduleTriggered', { taskId, cron: cronExpression })
          } catch (err) {
            log.error(`[TaskManager] Cron check error for task ${taskId}:`, err)
          }
        }
      }, 60000) // 每分钟检查一次

      this.schedules.set(taskId, schedule)
      this.saveSchedules()

      log.info(`[TaskManager] Task ${taskId} scheduled: ${cronExpression}, next run at ${new Date(nextRun).toLocaleString()}`)
      return { success: true }
    } catch (err) {
      return { success: false, error: `Invalid cron expression: ${err}` }
    }
  }

  /**
   * 取消定时任务
   */
  cancelSchedule(taskId: string): { success: boolean } {
    const schedule = this.schedules.get(taskId)
    if (schedule?.timerId) {
      clearInterval(schedule.timerId)
    }
    this.schedules.delete(taskId)
    this.saveSchedules()
    return { success: true }
  }

  /**
   * 获取所有定时任务
   */
  getSchedules(): ScheduleInfo[] {
    return Array.from(this.schedules.values())
  }

  /**
   * 恢复定时任务
   */
  private restoreSchedule(schedule: ScheduleInfo): void {
    this.scheduleTask(schedule.taskId, schedule.cron).catch(err => {
      log.error(`[TaskManager] Failed to restore schedule for task ${schedule.taskId}:`, err)
    })
  }

  /**
   * 持久化定时任务配置
   */
  private saveSchedules(): void {
    const data = Array.from(this.schedules.values()).map(s => ({
      taskId: s.taskId,
      cron: s.cron,
      enabled: s.enabled,
      nextRunAt: s.nextRunAt,
      lastRunAt: s.lastRunAt
    }))
    store.set('taskSchedules' as any, data)
  }

  /**
   * 设置账号任务策略
   */
  setAccountPolicy(accountId: string, policy: Partial<AccountTaskPolicy>): void {
    const current = this.accountPolicies.get(accountId) || { ...DEFAULT_ACCOUNT_POLICY }
    this.accountPolicies.set(accountId, { ...current, ...policy })
  }

  /**
   * 获取账号任务策略
   */
  getAccountPolicy(accountId: string): AccountTaskPolicy {
    return this.accountPolicies.get(accountId) || { ...DEFAULT_ACCOUNT_POLICY }
  }
}
