<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <h1>{{ t('header') }}</h1>
  <p class="description">{{ t('description') }}</p>
</template>
