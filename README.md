# AutoOps

多平台自动化运营工具

## 功能特性

- **AI 智能评论**: 支持火山引擎(豆包)、DeepSeek、阿里云百炼、OpenAI 等 AI 服务，根据视频内容实时生成独特评论
- **多操作自动化**: 支持评论、点赞、收藏、关注等操作
- **模拟真人行为**: 随机观看时长、智能输入延迟、随机操作概率
- **规则配置灵活**: 支持手动规则(关键词匹配)和 AI 规则
- **视频活跃度检测**: 自动检测视频评论活跃度
- **任务历史记录**: 详细记录每个任务的执行情况

## 技术栈

- Electron 38.x
- Vue 3 + TypeScript
- Vite + electron-vite
- Tailwind CSS 4
- Pinia
- Playwright

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 项目结构

```
src/
├── main/                 # Electron 主进程
│   ├── elements/         # 元素选择器
│   ├── integration/ai/   # AI 服务集成
│   ├── ipc/              # IPC 处理器
│   ├── service/           # 业务逻辑
│   └── utils/            # 工具函数
├── preload/              # 预加载脚本
├── renderer/             # Vue 前端应用
│   └── src/
│       ├── components/   # UI 组件
│       ├── pages/        # 页面
│       ├── stores/       # Pinia 状态
│       └── router/       # 路由
└── shared/               # 共享类型定义
```