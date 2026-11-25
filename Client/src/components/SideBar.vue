<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolbarTooltip from './ToolbarTooltip.vue'
import type { CollectionCategory } from '../models/collection'

const { t } = useI18n({ useScope: 'global' })
const expanded = ref(false)
const panel = ref<HTMLElement | null>(null)
const toggle = ref<HTMLButtonElement | null>(null)
function close(restoreFocus = true) {
  if (!expanded.value) return
  expanded.value = false
  if (restoreFocus) nextTick(() => toggle.value?.focus())
}

function closeOutside(event: Event) {
  if (
    expanded.value &&
    panel.value &&
    event.target instanceof Node &&
    !panel.value.contains(event.target)
  )
    close(false)
}

onMounted(() => {
  document.addEventListener('pointerdown', closeOutside, true)
  document.addEventListener('click', closeOutside, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOutside, true)
  document.removeEventListener('click', closeOutside, true)
})
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{ select: [category: CollectionCategory] }>()
const selectedCategory = defineModel<CollectionCategory>({
  default: 'all',
})

function selectCategory(category: CollectionCategory) {
  selectedCategory.value = category
  emit('select', category)
  close()
}
const categories = [
  { id: 'all', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
  { id: 'movies', icon: 'M4 3h16v18H4z M4 8h16M4 16h16M8 3v18M16 3v18' },
  { id: 'tvSeries', icon: 'M3 7h18v13H3z M8 3l4 4 4-4' },
  {
    id: 'videoGames',
    icon: 'M7 8h10l4 10-2 2-5-4h-4l-5 4-2-2z M7 10v4M5 12h4M16 11h.01M18 13h.01',
  },
  { id: 'boardGames', icon: 'M4 4h16v16H4z M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01' },
] as const
</script>

<template>
  <aside
    ref="panel"
    class="side-bar"
    :class="{ 'side-bar-collapsed': !expanded }"
    :aria-label="t('sidebar.categories')"
    @keydown.esc.prevent="close()"
  >
    <div class="side-bar-heading">
      <span v-if="expanded" class="side-bar-title">{{ t('sidebar.categories') }}</span>
      <ToolbarTooltip
        v-slot="{ describedby }"
        :text="t(expanded ? 'sidebar.hide' : 'sidebar.show')"
        class="side-bar-toggle-tooltip"
      >
        <button
          ref="toggle"
          class="side-bar-toggle"
          type="button"
          :aria-label="t(expanded ? 'sidebar.hide' : 'sidebar.show')"
          :aria-describedby="describedby"
          :aria-expanded="expanded"
          aria-controls="collection-categories"
          @click="expanded = !expanded"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path v-if="expanded" d="m14 6-6 6 6 6" />
            <path v-else d="m10 6 6 6-6 6" />
          </svg>
        </button>
      </ToolbarTooltip>
    </div>
    <Transition name="sidebar-slide">
      <nav
        id="collection-categories"
        v-show="expanded"
        class="side-bar-navigation"
        :aria-label="t('sidebar.categories')"
        :aria-hidden="!expanded"
        :inert="!expanded"
      >
        <div class="side-bar-nav-content">
          <ul class="side-bar-categories">
            <li v-for="category in categories" :key="category.id">
              <button
                type="button"
                class="side-bar-category"
                :aria-pressed="props.active && selectedCategory === category.id"
                @click="selectCategory(category.id)"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path :d="category.icon" />
                </svg>
                {{ t(`sidebar.${category.id}`) }}
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </Transition>
  </aside>
</template>

<style src="../style/side-bar.css"></style>
