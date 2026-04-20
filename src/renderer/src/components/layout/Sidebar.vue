<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import {
  Home,
  Settings,
  UserCircle,
  ListTodo,
} from 'lucide-vue-next'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProps,
  SidebarRail,
} from '@/components/ui/sidebar'

const router = useRouter()
const route = useRoute()

const navItems = [
  { path: '/', name: 'home', label: '首页', icon: Home },
  { path: '/tasks', name: 'tasks', label: '任务', icon: ListTodo },
  { path: '/accounts', name: 'accounts', label: '账号', icon: UserCircle },
  { path: '/settings', name: 'settings', label: '设置', icon: Settings }
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const navigate = (path: string) => {
  router.push(path)
}
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="childItem in navItems" :key="childItem.path">
              <SidebarMenuButton 
                :tooltip="childItem.label"
                :is-active="isActive(childItem.path)" 
                @click="navigate(childItem.path)"
              >
                <component :is="childItem.icon" />
                <span>{{ childItem.label }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
</template>
