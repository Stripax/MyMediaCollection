<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import '../style/tmdb.css'
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <aside class="tmdb-attribution" :aria-label="t('igdb.credits')">
    <a href="https://www.igdb.com" target="_blank" rel="noopener noreferrer">{{
      t('igdb.attribution')
    }}</a>
  </aside>
</template>
