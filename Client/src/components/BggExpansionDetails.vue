<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BggGameReference } from '../models/bgg'

const props = defineProps<{ isExpansion?: boolean | null; requiredGames?: BggGameReference[] }>()
const { t } = useI18n({ useScope: 'global' })
const games = computed(() => [
  ...new Map(
    (props.requiredGames ?? [])
      .filter((game) => Number.isSafeInteger(game.bggId) && game.bggId > 0 && game.name?.trim())
      .map((game) => [game.bggId, game]),
  ).values(),
])
</script>

<template>
  <dl class="bgg-expansion-details">
    <div>
      <dt>{{ t('bgg.classification') }}</dt>
      <dd>
        {{
          t(
            isExpansion === true
              ? 'bgg.expansion'
              : isExpansion === false
                ? 'bgg.baseGame'
                : 'sourceMetadata.unknown',
          )
        }}
      </dd>
    </div>
    <div v-if="isExpansion === true">
      <dt>{{ t('bgg.requiredGames') }}</dt>
      <dd>
        <ul v-if="games.length" class="bgg-required-games">
          <li v-for="game in games" :key="game.bggId">
            <a
              :href="`https://boardgamegeek.com/boardgame/${game.bggId}`"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="t('sourceMetadata.openSource', { name: game.name, source: 'BGG' })"
              >{{ game.name }}</a
            >
          </li>
        </ul>
        <span v-else>{{ t('bgg.requiredGamesUnknown') }}</span>
      </dd>
    </div>
  </dl>
</template>

<style src="../style/bgg.css"></style>
