<script setup lang="ts">
import { RouterView } from 'vue-router'
import {
  SidebarProvider,
  SidebarInset,
} from '@/components/ui/sidebar'
import AppSidebar from './Sidebar.vue'
import StatusBar from './StatusBar.vue'

</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset class="flex flex-col h-screen overflow-hidden">
      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
      <StatusBar class="flex-shrink-0" />
    </SidebarInset>
  </SidebarProvider>
</template>
