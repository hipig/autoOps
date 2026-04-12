<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { Button } from './ui/button'

const mode = useColorMode()
</script>

<template>
  <Button
    variant="outline"
    size="icon"
    @click="mode.value = mode.value === 'dark' ? 'light' : 'dark'"
  >
    <span v-if="mode.value === 'dark'">🌙</span>
    <span v-else>☀️</span>
  </Button>
</template>