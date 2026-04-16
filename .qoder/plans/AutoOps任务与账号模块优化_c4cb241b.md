# AutoOps 任务模块与账号模块优化计划

## 一、任务运行管理优化

### 1.1 TaskRunner 增加暂停/恢复能力
**文件**: `src/main/service/task-runner.ts`
- 增加 `paused` 标志和 `pause()` / `resume()` 方法
- `runTask` 循环中检查 `paused` 状态：暂停时等待 resume 信号（使用 Promise + resolve 机制）
- 增加 `getProgress()` 方法返回当前进度信息（已完成数/目标数/当前状态）
- 修复 `setupVideoDataListener` 硬编码抖音 URL 的问题，改为从 adapter 的 config 中获取 feed endpoint

### 1.2 新建 TaskRunnerManager - 多任务管理器
**新建文件**: `src/main/service/task-runner-manager.ts`
- 使用 `Map<string, { runner: TaskRunner; config: TaskRunConfig; status: TaskRunStatus }>` 管理多任务
- `TaskRunStatus` 类型：`pending | running | paused | completing | stopped | error`
- 最大并发数控制（默认3），超出的任务放入等待队列
- 任务队列：FIFO，当前任务完成后自动启动下一个等待中的任务
- 每个任务独立管理 progress/action 事件，通过 taskId 区分转发给前端
- 方法：
  - `start(config)` -> 返回 taskId，可能进入 pending 状态
  - `stop(taskId)` -> 停止指定任务
  - `pause(taskId)` / `resume(taskId)` -> 暂停/恢复
  - `getStatus(taskId?)` -> 查询单个或全部任务状态
  - `getProgress(taskId)` -> 查询任务进度

### 1.3 IPC 层改造
**文件**: `src/main/ipc/task.ts`
- 用 `TaskRunnerManager` 实例替代单一 `currentTaskRunner`
- 改造 `task:start`：接收完整任务配置，调用 manager.start()
- 新增 IPC：
  - `task:pause` -> 暂停指定任务
  - `task:resume` -> 恢复指定任务
  - `task:list` -> 列出所有运行中任务的状态
  - `task:progress` -> 获取指定任务进度
- `task:progress` 事件改为携带 `taskId` 字段，前端可区分不同任务的日志
- `task:action` 事件同样携带 `taskId`

### 1.4 Preload 层扩展
**文件**: `src/preload/index.ts`
- `task` 命名空间增加：`pause(taskId)` / `resume(taskId)` / `list()` / `getProgress(taskId)`
- `onProgress` / `onAction` 回调数据增加 `taskId` 字段

### 1.5 前端 TaskStore 改造
**文件**: `src/renderer/src/stores/task.ts`
- `runningTasks` Map 替代单一 `isRunning`，存储每个运行任务的状态和日志
- `start()` 返回后关联 taskId
- `pause(taskId)` / `resume(taskId)` 方法
- 日志按 taskId 分组存储
- 兼容处理：保留 `isRunning` 计算属性（是否有任何任务在运行）

### 1.6 前端任务页面 UI 改造
**文件**: `src/renderer/src/pages/tasks.vue`
- 任务列表项增加运行状态标识（运行中/暂停/等待/空闲）
- 选中任务时，根据状态显示不同操作按钮（启动/暂停/恢复/停止）
- 实时日志面板显示当前选中任务的日志
- 底部状态栏显示并发任务数

---

## 二、账号模块修复与扩展

### 2.1 统一 Account 类型定义
**文件**: `src/shared/account.ts` + `src/main/ipc/account.ts` + `src/renderer/src/stores/account.ts`
- 删除 `main/ipc/account.ts` 中重复的 Account 接口定义，统一使用 `shared/account.ts` 的定义
- 修改 `renderer/stores/account.ts` 的 Account 接口，`platform` 类型改为 `Platform`（支持 'douyin' | 'kuaishou' | 'xiaohongshu' | 'wechat'）
- 消除前端所有 `(account as any)` 类型断言

### 2.2 修复 storageState 类型
**文件**: `src/shared/account.ts`
- `storageState` 字段类型改为 `string`（JSON 序列化后的字符串），与 login.ts 返回的 `JSON.stringify(storageState)` 一致
- task-runner.ts 中使用时 `JSON.parse(account.storageState)` 还原

### 2.3 多平台登录支持
**文件**: `src/main/ipc/login.ts`
- 增加 `login:kuaishou` IPC handler：打开快手登录页，等待用户登录，提取用户信息，保存 storageState
- 增加 `login:xiaohongshu` IPC handler：打开小红书登录页，等待用户登录，提取用户信息，保存 storageState
- 登录流程复用已有的 PLATFORMS 配置（homeUrl/loginUrl）
- 提取公共登录逻辑为 `performLogin(platform, browserPath)` 函数

**文件**: `src/preload/index.ts`
- `login` 命名空间增加：`kuaishou()` / `xiaohongshu()`

### 2.4 账号添加页面改造
**文件**: `src/renderer/src/pages/accounts.vue`
- 添加账号时先选择平台（抖音/快手/小红书）
- 根据选择调用对应平台的登录 API
- 账号列表增加平台图标/标识
- 表格增加"平台"列

### 2.5 账号重新登录与状态管理
**文件**: `src/main/ipc/account.ts`
- 增加 `account:relogin` IPC：使用已有 storageState 尝试访问平台，检查是否仍有效
- 增加 `account:refreshState` IPC：重新打开浏览器让用户重新登录以刷新 Cookie

**文件**: `src/main/ipc/login.ts`
- 增加 `login:checkStatus` IPC：给定 storageState，检查账号是否仍有效

**文件**: `src/renderer/src/pages/accounts.vue`
- 操作菜单增加"重新登录"和"检查状态"选项
- 账号状态显示优化：正常/未激活/已过期
- 已过期账号提示用户重新登录

### 2.6 账号与任务联动
**文件**: `src/renderer/src/pages/tasks.vue`
- 创建任务时：选择账号后自动填充该账号对应的平台
- 任务配置中显示关联账号的平台信息
- 启动任务时验证：任务平台必须与关联账号平台一致

---

## 三、代码质量修复

### 3.1 IPC 注册命名冲突修复
**文件**: `src/main/index.ts` + `src/main/ipc/task.ts`
- `task.ts`（运行控制）导出函数改名为 `registerTaskRunIPC()`
- `task-crud.ts` 保持 `registerTaskIPC()`
- `index.ts` 中对应更新调用

### 3.2 前端类型安全
- 消除 tasks.vue 和 accounts.vue 中的 `(account as any)` / `(task as any)` 断言
- 确保 store 中的类型与 shared 层定义一致

---

## 实施顺序

1. **Phase 1 - 基础修复**：统一类型、修复命名冲突、修复 storageState 类型
2. **Phase 2 - 任务运行管理**：TaskRunner 暂停/恢复 -> TaskRunnerManager -> IPC 改造 -> 前端改造
3. **Phase 3 - 账号模块**：多平台登录 -> 账号页面改造 -> 状态管理 -> 账号与任务联动
