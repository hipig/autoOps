# AutoOps 多平台自动化运营工具 - 扩展计划

## 一、项目现状分析

### 1.1 已实现功能
- ✅ 抖音平台单账号登录管理
- ✅ 基于 Playwright 的浏览器自动化
- ✅ AI 评论生成（支持 DeepSeek、字节火山引擎、阿里百炼、OpenAI）
- ✅ 关键词规则匹配（作者名、视频描述、视频标签）
- ✅ AI 规则智能筛选视频
- ✅ 屏蔽词过滤
- ✅ 模拟真人观看行为
- ✅ 视频活跃度检测
- ✅ 任务模板系统
- ✅ 任务执行历史记录

### 1.2 现有架构问题
1. **平台耦合严重**: `DouyinElementSelector` 和 `DouyinTask` 直接耦合抖音平台
2. **账号体系简单**: 仅支持单个平台（抖音），`platform` 字段硬编码为 `'douyin'`
3. **任务类型单一**: 只有评论任务，缺少点赞、收藏、关注等
4. **AI 分析维度有限**: 只能获取视频基本信息，缺少评论列表分析

---

## 二、架构重构设计方案

### 2.1 核心设计原则
```
Platform（平台）
    ↓
┌─────────────────────────────┐
│   Account（账号）            │
│   - 抖音账号A               │
│   - 快手账号B               │
│   - 小红书账号C             │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│   Platform Adapter（适配器）│
│   - 元素选择器              │
│   - API 封装                │
│   - 视频信息获取            │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│   Task Engine（任务引擎）   │
│   - 点赞任务                │
│   - 评论任务                │
│   - 收藏任务                │
│   - 关注任务                │
│   - 组合任务                │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│   AI Service（AI 服务）     │
│   - 视频内容分析            │
│   - 评论列表分析            │
│   - 智能评论生成            │
└─────────────────────────────┘
```

### 2.2 目录结构变更
```
src/
├── main/
│   ├── elements/
│   │   ├── base.ts              # 基础选择器接口
│   │   ├── douyin.ts            # 抖音选择器（重构）
│   │   ├── kuaishou.ts          # 快手选择器（新增）
│   │   └── xiaohongshu.ts       # 小红书选择器（新增）
│   │
│   ├── platform/                # 平台适配层（新增）
│   │   ├── base.ts              # 平台基础接口
│   │   ├── douyin/
│   │   │   ├── index.ts         # 抖音适配器
│   │   │   ├── api.ts           # 抖音 API 封装
│   │   │   ├── elements.ts      # 元素选择器
│   │   │   └── task-handlers.ts # 任务处理器
│   │   ├── kuaishou/
│   │   └── xiaohongshu/
│   │
│   ├── service/
│   │   ├── base-task.ts         # 基础任务类（重构）
│   │   ├── douyin-task.ts       # 抖音任务（适配新架构）
│   │   ├── kuaishou-task.ts     # 快手任务（新增）
│   │   ├── xiaohongshu-task.ts  # 小红书任务（新增）
│   │   └── task-factory.ts      # 任务工厂（新增）
│   │
│   ├── integration/ai/
│   │   ├── analyzer/            # AI 分析器（新增）
│   │   │   ├── base.ts          # 基础分析器
│   │   │   ├── video-analyzer.ts    # 视频内容分析
│   │   │   ├── comment-analyzer.ts  # 评论列表分析
│   │   │   └── sentiment-analyzer.ts # 情感分析
│   │   ├── generator/
│   │   │   ├── base.ts
│   │   │   ├── comment-generator.ts # 评论生成器
│   │   │   └── reply-generator.ts   # 回复生成器
│   │   └── factory.ts
│   │
│   └── ipc/
│       ├── account.ts           # 扩展支持多平台
│       ├── task-crud.ts        # 扩展任务类型
│       └── platform.ts         # 平台管理 IPC（新增）
│
├── renderer/src/
│   ├── pages/
│   │   ├── accounts.vue        # 账号管理（重构）
│   │   ├── tasks.vue           # 任务管理（重构）
│   │   ├── platforms.vue       # 平台管理页面（新增）
│   │   └── ai-config.vue       # AI 分析配置（新增）
│   │
│   ├── stores/
│   │   ├── account.ts          # 账号 store（重构）
│   │   ├── platform.ts          # 平台 store（新增）
│   │   └── task.ts             # 任务 store（重构）
│   │
│   └── components/
│       ├── platform-selector.vue   # 平台选择器（新增）
│       ├── account-card.vue        # 账号卡片（重构）
│       ├── task-card.vue          # 任务卡片（重构）
│       └── ai-analysis-panel.vue  # AI 分析面板（新增）
│
└── shared/
    ├── platform.ts             # 平台类型定义（新增）
    ├── account.ts              # 账号类型扩展
    ├── task.ts                 # 任务类型扩展
    └── feed-ac-setting.ts      # 任务配置扩展
```

---

## 三、具体实现步骤

### 阶段一：架构重构（平台抽象层）

#### 3.1 定义平台抽象接口
```typescript
// src/shared/platform.ts
export type Platform = 'douyin' | 'kuaishou' | 'xiaohongshu' | 'wechat'

export interface PlatformConfig {
  name: string
  homeUrl: string
  loginUrl: string
  selectors: PlatformSelectors
  apiEndpoints: PlatformAPIEndpoints
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
}

export interface PlatformAPIEndpoints {
  feed: string
  commentList: string
  commentPublish: string
  like: string
  collect: string
  follow: string
}
```

#### 3.2 实现平台适配器基类
```typescript
// src/main/platform/base.ts
export abstract class BasePlatformAdapter {
  abstract platform: Platform
  abstract config: PlatformConfig

  abstract login(): Promise<LoginResult>
  abstract getVideoInfo(videoId: string): Promise<VideoInfo>
  abstract getCommentList(videoId: string, cursor?: number): Promise<CommentListResult>
  abstract like(videoId: string): Promise<OperationResult>
  abstract collect(videoId: string): Promise<OperationResult>
  abstract follow(userId: string): Promise<OperationResult>
  abstract comment(videoId: string, content: string): Promise<CommentResult>
}
```

#### 3.3 抖音平台适配器实现
- 将现有 `DouyinElementSelector` 重构为 `DouyinPlatformAdapter`
- 保持现有功能兼容
- 统一接口定义

### 阶段二：账号体系扩展

#### 3.4 账号类型扩展
```typescript
// src/shared/account.ts
export interface Account {
  id: string
  name: string
  platform: Platform  // 从 'douyin' 扩展为多平台
  platformAccountId?: string  // 平台原始账号ID
  avatar?: string
  storageState: unknown
  cookies?: Record<string, string>
  createdAt: number
  isDefault: boolean
  status: 'active' | 'inactive' | 'expired'
  expiresAt?: number
}
```

#### 3.5 账号管理页面重构
- 添加平台筛选下拉框
- 账号卡片显示平台图标
- 支持按平台分组展示
- 批量导入/导出账号

### 阶段三：任务系统扩展

#### 3.6 任务类型扩展
```typescript
// src/shared/task.ts
export type TaskType = 'comment' | 'like' | 'collect' | 'follow' | 'watch' | 'combo'

export interface Task {
  id: string
  name: string
  accountId: string
  platform: Platform
  taskType: TaskType
  config: TaskConfig
  createdAt: number
  updatedAt: number
}

export interface ComboTaskConfig extends TaskConfig {
  operations: Array<{
    type: TaskType
    probability: number  // 执行概率
    order: number         // 执行顺序
  }>
}
```

#### 3.7 任务引擎重构
```typescript
// src/main/service/base-task.ts
export abstract class BaseTask extends EventEmitter {
  abstract platform: Platform
  abstract taskType: TaskType

  protected browser?: Browser
  protected context?: BrowserContext
  protected page?: Page
  protected adapter: BasePlatformAdapter

  abstract start(config: TaskConfig): Promise<string>
  abstract stop(): Promise<void>
  abstract pause(): Promise<void>
  abstract resume(): Promise<void>
}
```

### 阶段四：AI 服务增强

#### 3.8 视频内容深度分析
```typescript
// src/main/integration/ai/analyzer/video-analyzer.ts
export interface VideoAnalysisInput {
  title: string
  description: string
  author: {
    name: string
    followers: number
    verified: boolean
  }
  tags: string[]
  commentExamples: string[]  // 热门评论示例
  likeCount: number
  collectCount: number
  shareCount: number
}

export interface VideoAnalysisResult {
  category: string           // 视频分类
  topic: string              // 话题/主题
  targetAudience: string     // 目标受众
  engagementLevel: 'high' | 'medium' | 'low'
  commentSentiment: 'positive' | 'neutral' | 'negative'
  recommendedCommentStyle: string[]
  avoidKeywords: string[]
}
```

#### 3.9 评论生成增强
```typescript
// src/main/integration/ai/generator/comment-generator.ts
export interface CommentGenerationInput extends VideoAnalysisResult {
  videoContext: string
  userRequirements?: string  // 用户自定义要求
  commentExamples?: string[] // 参考评论风格
  maxLength?: number
  style?: 'humorous' | 'serious' | 'question' | 'praise' | 'mixed'
}

export interface CommentGenerationResult {
  content: string
  score: number             // 评论质量评分
  suggestedEmoji?: string[]
  avoidWords?: string[]      // 建议避免的词
}
```

### 阶段五：其他平台适配

#### 3.10 快手平台适配器
- 元素选择器实现
- 视频信息获取
- 评论列表 API
- 关注/点赞/收藏/评论操作

#### 3.11 小红书平台适配器
- 元素选择器实现
- 笔记信息获取
- 评论列表 API
- 点赞/收藏/关注操作

---

## 四、数据结构变更

### 4.1 任务配置结构
```typescript
// src/shared/feed-ac-setting.ts（扩展）
export interface FeedAcSettingsV3 {
  version: 'v3'
  platform: Platform
  taskType: TaskType

  // 视频筛选
  ruleGroups: FeedAcRuleGroups[]

  // 屏蔽词
  blockKeywords: string[]
  authorBlockKeywords: string[]

  // 行为模拟
  simulateWatchBeforeComment: boolean
  watchTimeRangeSeconds: [number, number]

  // 活跃度检测
  onlyCommentActiveVideo: boolean
  activityThresholds: {
    minComments: number
    recentCommentHours: number
  }

  // AI 设置
  aiCommentEnabled: boolean
  aiAnalysisEnabled: boolean      // 新增：启用AI分析视频内容
  aiAnalyzeComments: boolean       // 新增：分析评论列表
  aiStyle?: string

  // 任务数量
  maxCount: number
  maxLikeCount?: number            // 新增：最大点赞数
  maxCollectCount?: number         // 新增：最大收藏数

  // 组合任务
  operations?: Array<{
    type: TaskType
    enabled: boolean
    probability: number
  }>
}
```

---

## 五、前端页面变更

### 5.1 账号管理页面（accounts.vue）
- 顶部添加平台切换 Tab
- 账号列表按平台分组
- 每个账号显示所属平台图标
- 支持筛选特定平台的账号

### 5.2 任务管理页面（tasks.vue）
- 新建任务时选择平台和任务类型
- 任务卡片显示平台图标和任务类型图标
- AI 配置区域增加分析维度选项
- 历史记录按平台和任务类型分类

### 5.3 新增页面
- **平台管理页面**（platforms.vue）：配置各平台浏览器路径、API 设置
- **AI 分析配置页面**（ai-config.vue）：配置 AI 分析维度、评论风格偏好

---

## 六、优先级规划

### P0（核心重构）
1. 平台抽象层接口定义
2. 抖音适配器重构
3. 账号体系扩展
4. 任务引擎重构

### P1（主要功能）
5. AI 视频内容分析增强
6. AI 评论列表分析
7. 快手平台适配器
8. 任务类型扩展（点赞、收藏、关注）

### P2（次要功能）
9. 小红书平台适配器
10. 组合任务支持
11. 批量账号导入导出
12. 任务调度系统

### P3（优化）
13. 情感分析器
14. 评论风格学习
15. 异常检测与自动处理

---

## 七、技术风险与应对

### 7.1 各平台反爬机制
- **风险**: 不同平台有不同的反爬策略
- **应对**: 分离平台适配器，单独处理各平台的登录验证和请求逻辑

### 7.2 AI API 成本控制
- **风险**: 频繁调用 AI API 可能产生较高成本
- **应对**:
  - 实现本地缓存分析结果
  - 支持批量视频预分析
  - 提供每日 API 调用限额配置

### 7.3 多账号并发管理
- **风险**: 多账号同时操作可能触发平台风控
- **应对**:
  - 实现任务队列和限流机制
  - 支持错峰执行配置
  - 账号健康度检测和自动暂停

---

## 八、配置示例

### 8.1 多平台任务配置
```json
{
  "id": "task-multi-001",
  "name": "跨平台运营任务",
  "accountId": "acc-douyin-001",
  "platform": "douyin",
  "taskType": "combo",
  "config": {
    "version": "v3",
    "ruleGroups": [
      {
        "id": "rg-001",
        "name": "美妆类视频",
        "type": "ai",
        "aiPrompt": "筛选美妆、护肤、穿搭类视频"
      }
    ],
    "aiCommentEnabled": true,
    "aiAnalyzeComments": true,
    "operations": [
      { "type": "like", "enabled": true, "probability": 0.3 },
      { "type": "collect", "enabled": true, "probability": 0.2 },
      { "type": "comment", "enabled": true, "probability": 1.0 }
    ],
    "maxCount": 50,
    "maxLikeCount": 20,
    "maxCollectCount": 10
  }
}
```

### 8.2 AI 分析结果缓存
```json
{
  "videoId": "728573829374857",
  "platform": "douyin",
  "analyzedAt": 1713001234567,
  "result": {
    "category": "美食",
    "topic": "家常菜做法",
    "targetAudience": "30-50岁家庭主妇",
    "engagementLevel": "high",
    "commentSentiment": "positive",
    "recommendedCommentStyle": [
      "请教类（询问做法）",
      "赞美类（看起来很好吃）",
      "分享类（我家也这样做）"
    ],
    "avoidKeywords": ["难吃", "失败", "吐槽"]
  }
}
```

---

## 九、后续扩展方向

### 9.1 微信视频号
- 实现微信扫一扫登录
- 公众号关联视频号操作
- 朋友圈分享逻辑

### 9.2 任务模板市场
- 用户可分享任务模板
- 模板评分和评论系统
- 模板分类检索

### 9.3 数据分析面板
- 运营数据可视化
- ROI 计算
- 竞争对手分析

### 9.4 云端同步
- 账号数据云端备份
- 多设备同步配置
- 团队协作功能
