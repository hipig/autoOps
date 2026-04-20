export type Platform = 'douyin' | 'kuaishou' | 'xiaohongshu' | 'wechat'

export type TaskType = 'comment' | 'like' | 'collect' | 'follow' | 'combo'

export { TaskOperation } from './task-operation'
export { TASK_TYPE_LABELS, TASK_OPERATION_LABELS } from './task-operation'
export type { TaskOperationConfig, ComboTaskConfig } from './task-operation'

export interface PlatformInfo {
  id: Platform
  name: string
  icon: string
  homeUrl: string
  loginUrl: string
  color: string
}

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  douyin: {
    id: 'douyin',
    name: '抖音',
    icon: '📱',
    homeUrl: 'https://www.douyin.com/',
    loginUrl: 'https://www.douyin.com/login/',
    color: '#000000'
  },
  kuaishou: {
    id: 'kuaishou',
    name: '快手',
    icon: '📹',
    homeUrl: 'https://www.kuaishou.com/',
    loginUrl: 'https://www.kuaishou.com/login',
    color: '#FF0000'
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    name: '小红书',
    icon: '📕',
    homeUrl: 'https://www.xiaohongshu.com/',
    loginUrl: 'https://www.xiaohongshu.com/login',
    color: '#FF2442'
  },
  wechat: {
    id: 'wechat',
    name: '微信视频号',
    icon: '💚',
    homeUrl: 'https://channels.weixin.qq.com/',
    loginUrl: 'https://weixin.qq.com/',
    color: '#07C160'
  }
}

export interface PlatformSelectors {
  activeVideo: string
  videoIdAttr: string
  likeButton: string
  collectButton: string
  followButton: string
  commentInput: string
  commentSubmit: string
  commentSection: string
  verifyDialog?: string
  loginPanel?: string
  videoSideCard?: string
}

export interface PlatformAPIEndpoints {
  feed: string
  commentList: string
  commentPublish: string
  like: string
  collect: string
  follow: string
}

export interface PlatformConfig {
  selectors: PlatformSelectors
  apiEndpoints: PlatformAPIEndpoints
  keyboardShortcuts: {
    nextVideo: string
    like: string
    collect: string
    comment: string
    follow: string
  }
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  douyin: {
    selectors: {
      activeVideo: '[data-e2e="feed-active-video"]',
      videoIdAttr: 'data-e2e-vid',
      likeButton: '[data-e2e="feed-like-icon"]',
      collectButton: '[data-e2e="feed-collect-icon"]',
      followButton: '[data-e2e="follow-button"]',
      commentInput: '.comment-input-inner-container',
      commentSubmit: '',
      commentSection: '#videoSideCard',
      verifyDialog: '.second-verify-panel',
      loginPanel: '#login-panel-new',
      videoSideCard: '#videoSideCard'
    },
    apiEndpoints: {
      feed: 'https://www.douyin.com/aweme/v1/web/tab/feed/',
      commentList: 'https://www.douyin.com/aweme/v1/web/comment/list/',
      commentPublish: 'https://www.douyin.com/aweme/v1/web/comment/publish',
      like: '',
      collect: '',
      follow: ''
    },
    keyboardShortcuts: {
      nextVideo: 'ArrowDown',
      like: 'z',
      collect: 'c',
      comment: 'x',
      follow: 'f'
    }
  },
  kuaishou: {
    selectors: {
      activeVideo: '[data-e2e="feed-active-video"]',
      videoIdAttr: 'data-vid',
      likeButton: '[data-e2e="feed-like-icon"]',
      collectButton: '[data-e2e="feed-collect-icon"]',
      followButton: '[data-e2e="follow-button"]',
      commentInput: '.comment-input-container',
      commentSubmit: '',
      commentSection: '.comment-panel'
    },
    apiEndpoints: {
      feed: 'https://www.kuaishou.com/graphql',
      commentList: 'https://www.kuaishou.com/graphql',
      commentPublish: 'https://www.kuaishou.com/graphql',
      like: '',
      collect: '',
      follow: ''
    },
    keyboardShortcuts: {
      nextVideo: 'ArrowDown',
      like: 'z',
      collect: 'c',
      comment: 'x',
      follow: 'f'
    }
  },
  xiaohongshu: {
    selectors: {
      activeVideo: '.note-card',
      videoIdAttr: 'data-note-id',
      likeButton: '.like-btn',
      collectButton: '.collect-btn',
      followButton: '.follow-btn',
      commentInput: '.comment-input',
      commentSubmit: '',
      commentSection: '.comment-panel'
    },
    apiEndpoints: {
      feed: '',
      commentList: '',
      commentPublish: '',
      like: '',
      collect: '',
      follow: ''
    },
    keyboardShortcuts: {
      nextVideo: 'ArrowDown',
      like: 'z',
      collect: 'c',
      comment: 'x',
      follow: 'f'
    }
  },
  wechat: {
    selectors: {
      activeVideo: '',
      videoIdAttr: '',
      likeButton: '',
      collectButton: '',
      followButton: '',
      commentInput: '',
      commentSubmit: '',
      commentSection: ''
    },
    apiEndpoints: {
      feed: '',
      commentList: '',
      commentPublish: '',
      like: '',
      collect: '',
      follow: ''
    },
    keyboardShortcuts: {
      nextVideo: '',
      like: '',
      collect: '',
      comment: '',
      follow: ''
    }
  }
}

export interface LoginResult {
  success: boolean
  userInfo?: {
    nickname: string
    avatar?: string
    uid: string
  }
  storageState?: unknown
  error?: string
}

export interface VideoInfo {
  videoId: string
  title: string
  description: string
  author: {
    userId: string
    nickname: string
    avatar?: string
    verified: boolean
    followerCount?: number
  }
  tags: string[]
  likeCount: number
  collectCount: number
  shareCount: number
  commentCount: number
  shareUrl: string
  createTime: number
  duration?: number  // 视频时长（秒）
}

export interface CommentInfo {
  commentId: string
  userId: string
  nickname: string
  avatar?: string
  content: string
  likeCount: number
  createTime: number
  ipLabel?: string
  replies?: CommentInfo[]
}

export interface CommentListResult {
  comments: CommentInfo[]
  cursor: number
  hasMore: boolean
  total: number
}

export interface OperationResult {
  success: boolean
  error?: string
}

export interface CommentResult extends OperationResult {
  commentId?: string
}
