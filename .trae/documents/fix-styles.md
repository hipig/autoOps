# 修复样式变量问题

## 问题分析

### 问题 1: Destructive 按钮文字颜色看不清
**原因**: `main.css` 中 `--destructive-foreground` 使用了和 `--destructive` 相同的深红色值
```css
--destructive: oklch(0.577 0.245 27.325);
--destructive-foreground: oklch(0.577 0.245 27.325);  /* 错误！应该对比度高 */
```

### 问题 2: 侧边栏宽度 CSS 变量不生效
**分析**:
1. `SidebarProvider.vue` 确实通过 `:style` 设置了 `--sidebar-width: 16rem`
2. `Sidebar.vue` 使用了 `w-[--sidebar-width]` 类
3. **根本原因**: 项目使用的是 **Tailwind CSS 4**，它使用 `@theme inline` 语法
4. 在 Tailwind CSS 4 中，`w-[--sidebar-width]` 这种使用未声明 CSS 变量的语法可能不工作
5. 需要在 `@theme inline` 中显式声明 `--sidebar-width` 等变量

### 问题 3: 图标大小不生效
**原因**: 可能是类似的问题 - lucide-vue-next 图标有固定尺寸，需要确保 Tailwind 能正确覆盖

## 修复方案

### 修复 1: 修正 destructive-foreground 颜色
在 `main.css` 中将 `--destructive-foreground` 改为高对比度的白色

### 修复 2: 在 @theme inline 中添加侧边栏变量
在 `main.css` 的 `@theme inline` 中添加：
```css
--sidebar-width: 16rem;
--sidebar-width-icon: 3rem;
```

### 修复 3: 确认图标大小处理
Button 的 cva 中已有 `[&_svg]:size-4`，这应该可以工作

## 具体修改文件

### src/renderer/src/assets/main.css
1. 修正 `--destructive-foreground` 颜色值
2. 在 `@theme inline` 中添加侧边栏 CSS 变量
