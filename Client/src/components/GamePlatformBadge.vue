<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { gamePlatforms, gameStores, otherOption, pcPlatform } from '../models/collection'

const props = defineProps<{ platform?: number | null; store?: number | null }>()
const { t } = useI18n({ useScope: 'global' })
const family = computed(() => {
  const platform = props.platform ?? 0
  if (platform >= 1 && platform <= 4) return 'xbox'
  if (platform >= 5 && platform <= 11) return 'playstation'
  if ((platform >= 12 && platform <= 22) || platform === 25) return 'nintendo'
  if (platform === pcPlatform) return 'pc'
  if (platform === 23 || platform === 24) return 'sega'
  return 'other'
})
const label = computed(() => {
  const platform = gamePlatforms.find((option) => option.value === props.platform)
  const store = gameStores.find((option) => option.value === props.store)
  const name = platform?.value === otherOption ? t('common.other') : (platform?.label ?? '—')
  return store ? `${name} · ${store.value === otherOption ? t('common.other') : store.label}` : name
})
</script>

<template>
  <span
    class="game-platform-badge"
    :data-platform-family="family"
    :aria-label="`${t('itemForm.platform')}: ${label}`"
    >{{ label }}</span
  >
</template>

<style src="../style/game-platform-badge.css"></style>
