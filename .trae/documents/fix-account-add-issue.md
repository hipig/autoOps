# 修复账号添加问题和升级 Playwright

## 问题分析

### 问题 1: Playwright 版本过旧
- **package.json 当前版本**: `@playwright/test@^1.55.0`
- **用户期望版本**: 1.59.1 (最新稳定版)
- **影响**: 可能有兼容性问题

### 问题 2: Playwright 导入错误
- **文件**: `src/main/ipc/login.ts` 第 26 行
- **当前代码**: `import('playwright')`
- **问题**: package.json 中依赖的是 `@playwright/test`，而不是 `playwright`
- **这会导致运行时错误**: Cannot find module 'playwright'

## 修复步骤

### 步骤 1: 升级 Playwright 到最新版本
```bash
npm install @playwright/test@latest
npx playwright install chromium
```

### 步骤 2: 修复 login.ts 中的导入
将 `import('playwright')` 改为 `import('@playwright/test')`

### 步骤 3: 验证修复
运行 `npm run typecheck` 确认类型正确
运行 `npm run dev` 测试账号添加功能

## 具体修改

### src/main/ipc/login.ts
```typescript
// 修改前 (第 26 行)
const { chromium } = await import('playwright')

// 修改后
const { chromium } = await import('@playwright/test')
```
