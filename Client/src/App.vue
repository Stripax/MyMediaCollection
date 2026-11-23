<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import TopBar from './components/TopBar.vue'
import SideBar from './components/SideBar.vue'
import AppSnackbar from './components/AppSnackbar.vue'
import type { CollectionCategory } from './models/collection'

const route = useRoute()
const router = useRouter()
const selectedCategory = computed(() => (route.params.category || 'all') as CollectionCategory)

function openCollection(category: CollectionCategory) {
  router.push({ name: 'collection', params: { category } })
}
</script>

<template>
  <TopBar />
  <div class="app-layout">
    <SideBar
      :model-value="selectedCategory"
      :active="route.name === 'collection'"
      @select="openCollection"
    />
    <main>
      <RouterView />
    </main>
  </div>
  <AppSnackbar />
</template>

<style src="./style/app.css"></style>
