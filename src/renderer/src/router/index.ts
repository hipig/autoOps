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

let initChecked = false

router.beforeEach(async (to, _from, next) => {
  if (to.name === 'setup') {
    next()
    return
  }

  if (to.meta.requiresInit && !initChecked) {
    const appStore = useAppStore()
    const initialized = await appStore.checkInitialized()
    if (!initialized) {
      next({ name: 'setup' })
      return
    }
    initChecked = true
  }
  next()
})