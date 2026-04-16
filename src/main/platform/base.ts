import { EventEmitter } from 'events'
import { Page, ElementHandle } from '@playwright/test'
import type {
  Platform,
  PlatformConfig,
  LoginResult,
  VideoInfo,
  CommentListResult,
  CommentInfo,
  OperationResult,
  CommentResult
} from '../../shared/platform'

export interface TaskConfig {
  browserExecPath: string
  accountId?: string
  maxCount: number
  watchTimeRangeSeconds: [number, number]
  simulateWatchBeforeComment: boolean
  onlyCommentActiveVideo: boolean
  aiCommentEnabled: boolean
}

export abstract class BasePlatformAdapter extends EventEmitter {
  abstract readonly platform: Platform
  abstract readonly config: PlatformConfig

  protected page?: Page
  protected isLoggedIn = false
  protected videoCache: Map<string, unknown> = new Map()

  abstract login(storageState?: unknown): Promise<LoginResult>
  abstract getVideoInfo(videoId: string): Promise<VideoInfo | null>
  abstract getCommentList(videoId: string, cursor?: number): Promise<CommentListResult | null>
  abstract like(videoId: string): Promise<OperationResult>
  abstract collect(videoId: string): Promise<OperationResult>
  abstract follow(userId: string): Promise<OperationResult>
  abstract comment(videoId: string, content: string): Promise<CommentResult>

  abstract goToNextVideo(): Promise<void>
  abstract openCommentSection(): Promise<void>
  abstract closeCommentSection(): Promise<void>
  abstract isCommentSectionOpen(): Promise<boolean>

  abstract getActiveVideoId(): Promise<string | null>

  setVideoCache(cache: Map<string, unknown>): void {
    this.videoCache = cache
  }

  getVideoCache(): Map<string, unknown> {
    return this.videoCache
  }

  protected setPage(page: Page): void {
    this.page = page
  }

  protected clearPage(): void {
    this.page = undefined
  }

  protected async getActiveVideoElement(): Promise<ElementHandle | null> {
    if (!this.page) return null
    return this.page.$(this.config.selectors.activeVideo)
  }

  protected log(level: 'debug' | 'info' | 'warn' | 'error' | 'success', message: string): void {
    const emojiMap = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      success: '✅'
    }
    const emoji = emojiMap[level]
    const formattedMessage = `[${this.platform.toUpperCase()}] ${emoji} ${message}`
    this.emit('log', { level, message: formattedMessage, timestamp: Date.now() })
  }
}

export interface VideoRecord {
  videoId: string
  authorName: string
  authorId?: string
  videoDesc: string
  videoTags: string[]
  shareUrl: string
  watchDuration: number
  isLiked: boolean
  isCollected: boolean
  isFollowed: boolean
  isCommented: boolean
  commentText?: string
  skipReason?: string
  timestamp: number
}

export interface TaskProgress {
  message: string
  timestamp: number
  videoId?: string
  action?: 'liked' | 'collected' | 'followed' | 'commented' | 'skipped'
}
