<script setup lang="ts">
import { RouterView } from 'vue-router'
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger
} from '@/components/ui/sidebar'
import AppSidebar from './Sidebar.vue'
import StatusBar from './StatusBar.vue'

</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
      <StatusBar />
    </SidebarInset>
  </SidebarProvider>
</template>
