<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import TopBar from './components/TopBar.vue'
import SideBar from './components/SideBar.vue'
import AppSnackbar from './components/AppSnackbar.vue'
import MatrixRain from './components/MatrixRain.vue'
import SnackbarItemEditor from './components/SnackbarItemEditor.vue'
import { useCollectionRefresh } from './composables/useCollectionRefresh'
import type { CollectionCategory } from './models/collection'

const route = useRoute()
const router = useRouter()
const { refresh } = useCollectionRefresh()
const editRequest = shallowRef<{ id: number; trigger: HTMLElement; noticeId: number } | null>(null)
function editFromSnackbar(id: number, trigger: HTMLElement, noticeId: number) {
  if (!editRequest.value) editRequest.value = { id, trigger, noticeId }
}
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
  <AppSnackbar @edit="editFromSnackbar" />
  <SnackbarItemEditor :request="editRequest" @closed="editRequest = null" @saved="refresh" />
</template>

<style src="./style/app.css"></style>
