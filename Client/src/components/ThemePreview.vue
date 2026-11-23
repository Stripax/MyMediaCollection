<script setup lang="ts">
defineProps<{ theme: 'light' | 'dark' | 'black' }>()
</script>

<template>
  <span class="theme-preview" :data-theme="theme" aria-hidden="true">
    <span>Aa</span>
    <span class="theme-preview-accent" />
  </span>
</template>
