<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TopBar from './components/TopBar.vue'
import SideBar from './components/SideBar.vue'

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <TopBar />

  <div class="app-layout">
    <SideBar />
    <main>
      <h1>{{ t('header') }}</h1>
      <p class="description">{{ t('description') }}</p>
    </main>
  </div>
</template>

<style src="./style/app.css"></style>
