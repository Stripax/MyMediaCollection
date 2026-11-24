<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CollectionSourceMetadata } from '../models/collection'

const props = defineProps<{ metadata: CollectionSourceMetadata; mediaType: number }>()
const { t, locale } = useI18n({ useScope: 'global' })
const headingId = useId()
const releaseYear = computed(() => props.metadata.releaseDate?.match(/^\d{4}/)?.[0])
const dataLanguage = computed(() => {
  if (props.metadata.language?.startsWith('fi')) return t('sourceMetadata.finnish')
  if (props.metadata.language?.startsWith('en')) return t('sourceMetadata.english')
  return props.metadata.language
})

function formatDate(value: string, withTime = false) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value === 'fi' ? 'fi-FI' : 'en-GB', {
    dateStyle: 'long',
    ...(withTime ? { timeStyle: 'short' as const } : { timeZone: 'UTC' }),
  }).format(date)
}
</script>

<template>
  <section class="source-details" :aria-labelledby="headingId">
    <h3 :id="headingId">{{ t('sourceMetadata.title', { source: metadata.source }) }}</h3>
    <dl>
      <div class="source-details-row">
        <dt>{{ t('sourceMetadata.name') }}</dt>
        <dd>{{ metadata.title || t('sourceMetadata.unknown') }}</dd>
      </div>
      <div
        v-if="metadata.originalTitle && metadata.originalTitle !== metadata.title"
        class="source-details-row"
      >
        <dt>{{ t('sourceMetadata.originalTitle') }}</dt>
        <dd>{{ metadata.originalTitle }}</dd>
      </div>
      <div class="source-details-row">
        <dt>{{ t('sourceMetadata.releaseYear') }}</dt>
        <dd>{{ releaseYear || t('sourceMetadata.unknown') }}</dd>
      </div>
      <div v-if="metadata.releaseDate" class="source-details-row">
        <dt>
          {{ t(mediaType === 2 ? 'sourceMetadata.firstAirDate' : 'sourceMetadata.releaseDate') }}
        </dt>
        <dd>
          <time :datetime="metadata.releaseDate">{{ formatDate(metadata.releaseDate) }}</time>
        </dd>
      </div>
      <div v-if="dataLanguage" class="source-details-row">
        <dt>{{ t('sourceMetadata.language') }}</dt>
        <dd>{{ dataLanguage }}</dd>
      </div>
      <div v-if="metadata.platforms.length" class="source-details-row">
        <dt>{{ t('sourceMetadata.platforms') }}</dt>
        <dd>{{ metadata.platforms.join(', ') }}</dd>
      </div>
      <div class="source-details-row">
        <dt>{{ t('sourceMetadata.overview') }}</dt>
        <dd class="source-details-overview">
          {{ metadata.overview || t('sourceMetadata.noOverview') }}
        </dd>
      </div>
      <template v-if="mediaType === 2">
        <div class="source-details-row">
          <dt>{{ t('tvOwnership.seasonCount') }}</dt>
          <dd>{{ metadata.numberOfSeasons ?? t('sourceMetadata.unknown') }}</dd>
        </div>
        <div class="source-details-row">
          <dt>{{ t('tvOwnership.episodeCount') }}</dt>
          <dd>{{ metadata.numberOfEpisodes ?? t('sourceMetadata.unknown') }}</dd>
        </div>
      </template>
      <div v-if="metadata.fetchedAt" class="source-details-row">
        <dt>{{ t('sourceMetadata.fetchedAt') }}</dt>
        <dd>
          <time :datetime="metadata.fetchedAt">{{ formatDate(metadata.fetchedAt, true) }}</time>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style src="../style/source-details.css"></style>
