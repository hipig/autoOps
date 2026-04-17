import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAppStore } from '@/stores/app'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/index.vue'),
    meta: { requiresInit: true }
  },
  {
    path: '/setup',
    name: 'setup',
    component: () => import('../pages/setup.vue')
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('../pages/tasks.vue'),
    meta: { requiresInit: true }
  },
  {
    path: '/accounts',
    name: 'accounts',
    component: () => import('../pages/accounts.vue'),
    meta: { requiresInit: true }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../pages/settings.vue'),
    meta: { requiresInit: true }
  }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to, _from, next) => {
  const appStore = useAppStore()

  // 如果访问 setup 页面
  if (to.name === 'setup') {
    // 已初始化（已配置浏览器）时不允许访问 setup 页，重定向到首页
    if (appStore.initialized) {
      next({ name: 'home' })
      return
    }
    next()
    return
  }

  // 需要初始化的页面
  if (to.meta.requiresInit) {
    // 使用 appStore.initialized 状态，避免重复 IPC 调用
    if (!appStore.initialized) {
      const isInit = await appStore.checkInitialized()
      if (!isInit) {
        next({ name: 'setup' })
        return
      }
    }
  }
  next()
})