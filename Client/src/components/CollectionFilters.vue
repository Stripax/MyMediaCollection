<script setup lang="ts">
import SelectControl from './SelectControl.vue'
import { useI18n } from 'vue-i18n'
import { ref, useId } from 'vue'
import type { CollectionFilters } from '../composables/useCollectionFilters'
import ToolbarTooltip from './ToolbarTooltip.vue'
import {
  mediaCategories,
  mediaFormats,
  gamePlatforms,
  gameStores,
  boardGameFormats,
  otherOption,
} from '../models/collection'
import '../style/collection-filters.css'

const filters = defineModel<CollectionFilters>({ required: true })
defineProps<{ allCategories: boolean; mediaType: number | ''; active: boolean }>()
const emit = defineEmits<{ reset: [] }>()
const { t } = useI18n({ useScope: 'global' })
const expanded = ref(false)
const panelId = useId()
function optionLabel(option: { value: number; label: string }) {
  return option.value === otherOption ? t('common.other') : option.label
}
function showPanel(element: Element) {
  element.removeAttribute('inert')
  element.removeAttribute('aria-hidden')
}
function hidePanel(element: Element) {
  element.setAttribute('inert', '')
  element.setAttribute('aria-hidden', 'true')
}
</script>

<template>
  <section class="collection-filters">
    <h2 class="collection-filters-heading">
      <ToolbarTooltip
        v-slot="{ describedby }"
        :text="t(expanded ? 'collection.filters.hide' : 'collection.filters.show')"
        class="collection-filters-tooltip"
      >
        <button
          type="button"
          class="collection-filters-toggle"
          :aria-expanded="expanded"
          :aria-controls="panelId"
          :aria-describedby="describedby"
          @click="expanded = !expanded"
        >
          {{ t('collection.filters.title') }}
          <svg
            :class="{ 'collection-filters-arrow-expanded': expanded }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </ToolbarTooltip>
    </h2>
    <Transition
      name="collection-filters-expand"
      @before-enter="showPanel"
      @before-leave="hidePanel"
    >
      <div v-if="expanded" :id="panelId" class="collection-filters-panel">
        <div class="collection-filters-clip">
          <fieldset class="collection-filter-fields" :aria-label="t('collection.filters.title')">
            <label v-if="allCategories">
              <span>{{ t('collection.category') }}</span>
              <SelectControl>
                <select v-model="filters.category" name="FilterCategory">
                  <option value="">{{ t('sidebar.all') }}</option>
                  <option v-for="entry in mediaCategories" :key="entry.value" :value="entry.value">
                    {{ t(entry.label) }}
                  </option>
                </select>
              </SelectControl>
            </label>
            <template v-if="mediaType === 1 || mediaType === 2">
              <label>
                <span>{{ t('itemForm.mediaFormat') }}</span>
                <SelectControl>
                  <select v-model="filters.format" name="FilterFormat">
                    <option value="">{{ t('collection.filters.all') }}</option>
                    <option v-for="entry in mediaFormats" :key="entry.value" :value="entry.value">
                      {{ optionLabel(entry) }}
                    </option>
                    <option value="unknown">{{ t('sourceMetadata.unknown') }}</option>
                  </select>
                </SelectControl>
              </label>
              <label>
                <span>{{ t('collection.filters.itemType') }}</span>
                <SelectControl>
                  <select v-model="filters.collectionType" name="FilterCollectionType">
                    <option value="">{{ t('collection.filters.all') }}</option>
                    <option value="single">
                      {{
                        t(
                          mediaType === 2
                            ? 'tvOwnership.individualSeasons'
                            : 'collection.filters.single',
                        )
                      }}
                    </option>
                    <option v-if="mediaType === 2" value="completeBox">
                      {{ t('tvOwnership.completeBoxShort') }}
                    </option>
                    <option v-else value="collection">{{ t('mediaCollection.label') }}</option>
                  </select>
                </SelectControl>
              </label>
            </template>
            <template v-if="mediaType === 3">
              <label>
                <span>{{ t('itemForm.platform') }}</span>
                <SelectControl>
                  <select v-model="filters.platform" name="FilterPlatform">
                    <option value="">{{ t('collection.filters.all') }}</option>
                    <option v-for="entry in gamePlatforms" :key="entry.value" :value="entry.value">
                      {{ optionLabel(entry) }}
                    </option>
                    <option value="unknown">{{ t('sourceMetadata.unknown') }}</option>
                  </select>
                </SelectControl>
              </label>
              <label>
                <span>{{ t('itemForm.store') }}</span>
                <SelectControl>
                  <select v-model="filters.store" name="FilterStore">
                    <option value="">{{ t('collection.filters.all') }}</option>
                    <option v-for="entry in gameStores" :key="entry.value" :value="entry.value">
                      {{ optionLabel(entry) }}
                    </option>
                    <option value="none">{{ t('collection.filters.noStore') }}</option>
                  </select>
                </SelectControl>
              </label>
              <label>
                <span>{{ t('collection.copyType') }}</span>
                <SelectControl>
                  <select v-model="filters.copyType" name="FilterCopyType">
                    <option value="">{{ t('collection.filters.all') }}</option>
                    <option value="physical">{{ t('collection.physicalCopy') }}</option>
                    <option value="digital">{{ t('collection.digitalCopy') }}</option>
                    <option value="unknown">{{ t('collection.unknownCopy') }}</option>
                  </select>
                </SelectControl>
              </label>
            </template>
            <template v-if="mediaType === 4">
              <label>
                <span>{{ t('itemForm.gameType') }}</span>
                <SelectControl>
                  <select v-model="filters.gameType" name="FilterGameType">
                    <option value="">{{ t('collection.filters.all') }}</option>
                    <option
                      v-for="entry in boardGameFormats"
                      :key="entry.value"
                      :value="entry.value"
                    >
                      {{ t(entry.label) }}
                    </option>
                    <option value="unknown">{{ t('sourceMetadata.unknown') }}</option>
                  </select>
                </SelectControl>
              </label>
              <label>
                <span>{{ t('bgg.classification') }}</span>
                <SelectControl>
                  <select v-model="filters.boardKind" name="FilterBoardKind">
                    <option value="">{{ t('collection.filters.all') }}</option>
                    <option :value="1">{{ t('bgg.baseGame') }}</option>
                    <option :value="2">{{ t('bgg.expansion') }}</option>
                    <option :value="99">{{ t('common.other') }}</option>
                    <option value="unknown">{{ t('sourceMetadata.unknown') }}</option>
                  </select>
                </SelectControl>
              </label>
            </template>
            <p v-if="allCategories && mediaType === ''" class="collection-filter-hint">
              {{ t('collection.filters.categoryHint') }}
            </p>
            <button
              type="button"
              class="collection-filters-clear"
              :disabled="!active"
              @click="emit('reset')"
            >
              {{ t('collection.filters.clear') }}
            </button>
          </fieldset>
        </div>
      </div>
    </Transition>
  </section>
</template>
