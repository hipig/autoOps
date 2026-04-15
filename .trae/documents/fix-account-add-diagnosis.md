# 账号添加问题诊断与修复

## 问题描述
浏览器登录成功，但账号界面没有反应，账号没有添加成功。

## 可能原因分析

### 原因 1: 获取用户信息失败
登录成功后，`login.ts` 中获取 `nickname` 的选择器可能失效，导致 `userInfo` 为空。

### 原因 2: storageState 序列化问题
`login.ts` 返回的 `storageState` 是 JSON 字符串化后的结果，前端传递给 `addAccount` 时可能有问题。

### 原因 3: Account 接口类型冲突
`src/main/ipc/account.ts` 中定义了局部的 `Account` 接口，与 `src/shared/account.ts` 中的接口可能冲突。

## 诊断步骤

### 步骤 1: 在 login.ts 中添加调试日志
在关键位置添加 `console.log` 输出中间变量值

### 步骤 2: 检查前端 handleLogin 返回值
在前端打印 `result` 的完整内容

### 步骤 3: 确认 storageState 是否正确传递
检查 storageState 是否正确被序列化/反序列化

## 修复方案

### 修复 1: 简化用户信息获取逻辑
使用更可靠的抖音页面元素选择器

### 修复 2: 添加详细日志输出
在 IPC 调用前后打印关键变量值

### 修复 3: 统一 Account 接口
移除 `src/main/ipc/account.ts` 中的重复接口定义，直接使用 `src/shared/account.ts`
