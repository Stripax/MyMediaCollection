<script setup lang="ts">
import SelectControl from './SelectControl.vue'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BoardGameReference, CollectionItem } from '../models/collection'

const props = withDefaults(defineProps<{ items?: CollectionItem[]; itemId?: number }>(), {
  items: () => [],
})
const kind = defineModel<number>('kind', { default: 1 })
const games = defineModel<BoardGameReference[]>('baseGames', { default: () => [] })
const { t } = useI18n({ useScope: 'global' })
const options = computed(() =>
  props.items.filter((item) => item.mediaType === 4 && item.id !== props.itemId),
)
watch(
  kind,
  (value) => {
    if (value !== 2 && value !== 99) games.value = []
    else if (!games.value.length) games.value = [{ name: '' }]
  },
  { immediate: true },
)

function select(index: number, event: Event) {
  const id = Number((event.target as HTMLSelectElement).value)
  const item = options.value.find((item) => item.id === id)
  games.value = games.value.map((game, current) =>
    current !== index
      ? game
      : item
        ? { collectionItemId: item.id, bggId: item.bggId, name: item.name }
        : { name: game.name, bggId: game.bggId },
  )
}

function name(index: number, event: Event) {
  games.value = games.value.map((game, current) =>
    current !== index ? game : { name: (event.target as HTMLInputElement).value },
  )
}
</script>

<template>
  <label class="item-form-field">
    <span>{{ t('bgg.classification') }}</span>
    <SelectControl>
      <select v-model.number="kind" name="BoardGameKind" required>
        <option :value="1">{{ t('bgg.baseGame') }}</option>
        <option :value="2">{{ t('bgg.expansion') }}</option>
        <option :value="99">{{ t('common.other') }}</option>
      </select>
    </SelectControl>
  </label>
  <div v-if="kind === 2 || kind === 99" class="board-game-parents">
    <div v-for="(game, index) in games" :key="index" class="board-game-parent">
      <label class="item-form-field">
        <span>{{ t('bgg.baseGame') }}</span>
        <SelectControl>
          <select
            :value="game.collectionItemId ?? ''"
            :name="`BaseGameId-${index}`"
            @change="select(index, $event)"
          >
            <option value="">{{ t('bgg.enterBaseGameManually') }}</option>
            <option v-for="item in options" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </SelectControl>
      </label>
      <label v-if="!game.collectionItemId" class="item-form-field">
        <span>{{ t('bgg.baseGameName') }}</span>
        <input
          :value="game.name"
          :name="`BaseGameName-${index}`"
          maxlength="300"
          autocomplete="off"
          @input="name(index, $event)"
        />
      </label>
      <button
        type="button"
        class="board-game-parent-remove"
        @click="games = games.filter((_, current) => current !== index)"
      >
        {{ t('bgg.removeBaseGame') }}
      </button>
    </div>
    <button type="button" @click="games = [...games, { name: '' }]">
      {{ t('bgg.addBaseGame') }}
    </button>
  </div>
</template>

<style src="../style/board-game-fields.css"></style>
