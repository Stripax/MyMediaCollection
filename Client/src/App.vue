<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import TopBar from './components/TopBar.vue'
import SideBar from './components/SideBar.vue'
import AppSnackbar from './components/AppSnackbar.vue'
import MatrixRain from './components/MatrixRain.vue'
import type { CollectionCategory } from './models/collection'

const route = useRoute()
const router = useRouter()
const theme = ref('light')
const matrixRain = ref(true)
const rainSettings = ref({ speed: 100, brightness: 55, density: 100 })
const selectedCategory = computed(() => (route.params.category || 'all') as CollectionCategory)

function openCollection(category: CollectionCategory) {
  router.push({ name: 'collection', params: { category } })
}
</script>

<template>
  <MatrixRain v-if="theme === 'black' && matrixRain" v-bind="rainSettings" />
  <TopBar
    @theme-change="theme = $event"
    @matrix-rain-change="matrixRain = $event"
    @matrix-rain-settings-change="rainSettings = $event"
  />
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
