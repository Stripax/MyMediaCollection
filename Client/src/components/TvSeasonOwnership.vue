<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { mediaFormats, otherOption, type OwnedSeason, type TmdbSeason } from '../models/collection'

const props = defineProps<{
  defaultFormat: number
  seasonCount?: number | null
  episodeCount?: number | null
  seasons?: TmdbSeason[]
}>()
const completeBox = defineModel<boolean>('completeBox', { required: true })
const ownedSeasons = defineModel<OwnedSeason[]>('ownedSeasons', { required: true })
const { t } = useI18n({ useScope: 'global' })
const manualCount = ref(Math.max(1, ...ownedSeasons.value.map((season) => season.seasonNumber)))
const hasKnownSeasons = computed(() => !!props.seasons?.length || props.seasonCount != null)
const available = computed(() => {
  if (props.seasons?.length)
    return props.seasons
      .filter((season) => season.seasonNumber > 0)
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
  const count = hasKnownSeasons.value ? (props.seasonCount ?? 0) : Number(manualCount.value)
  return Array.from(
    { length: Number.isInteger(count) ? Math.min(1000, Math.max(0, count)) : 0 },
    (_, index) => ({ seasonNumber: index + 1, name: '', episodeCount: null }),
  )
})
const rows = computed(() => {
  const known = new Map(available.value.map((season) => [season.seasonNumber, season]))
  for (const owned of ownedSeasons.value)
    if (!known.has(owned.seasonNumber))
      known.set(owned.seasonNumber, {
        seasonNumber: owned.seasonNumber,
        name: '',
        episodeCount: null,
      })
  return [...known.values()].sort((a, b) => a.seasonNumber - b.seasonNumber)
})

function selectAll() {
  ownedSeasons.value = available.value.map((season) => ({
    seasonNumber: season.seasonNumber,
    mediaFormat: props.defaultFormat,
  }))
}
function setComplete(checked: boolean) {
  completeBox.value = checked
}
watch(
  [available, completeBox, () => props.defaultFormat],
  () => {
    if (completeBox.value) selectAll()
  },
  { immediate: true },
)
function toggleSeason(number: number, checked: boolean) {
  if (completeBox.value) return
  if (checked)
    ownedSeasons.value = [
      ...ownedSeasons.value,
      { seasonNumber: number, mediaFormat: props.defaultFormat },
    ].sort((a, b) => a.seasonNumber - b.seasonNumber)
  else {
    ownedSeasons.value = ownedSeasons.value.filter((season) => season.seasonNumber !== number)
    completeBox.value = false
  }
}
function setFormat(number: number, value: string) {
  if (completeBox.value) return
  ownedSeasons.value = ownedSeasons.value.map((season) =>
    season.seasonNumber === number ? { ...season, mediaFormat: Number(value) } : season,
  )
}
</script>

<template>
  <fieldset class="tv-ownership">
    <legend>{{ t('tvOwnership.title') }}</legend>
    <p v-if="seasonCount != null || episodeCount != null" class="tv-season-totals">
      <span v-if="seasonCount != null">{{
        t('tvOwnership.totalSeasons', { count: seasonCount })
      }}</span>
      <span v-if="episodeCount != null">{{
        t('tvOwnership.totalEpisodes', { count: episodeCount })
      }}</span>
    </p>
    <label class="item-form-checkbox">
      <input
        name="IsCompleteBox"
        type="checkbox"
        :checked="completeBox"
        @change="setComplete(($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t('tvOwnership.completeBox') }}</span>
    </label>
    <p class="tv-ownership-help">{{ t('tvOwnership.help') }}</p>
    <label v-if="!hasKnownSeasons" class="item-form-field">
      <span>{{ t('tvOwnership.manualCount') }}</span>
      <input
        v-model.number="manualCount"
        name="SeasonCount"
        type="number"
        min="1"
        max="1000"
        step="1"
        required
      />
    </label>
    <div v-for="season in rows" :key="season.seasonNumber" class="tv-season-row">
      <label class="item-form-checkbox">
        <input
          type="checkbox"
          :name="`OwnedSeason${season.seasonNumber}`"
          :checked="ownedSeasons.some((owned) => owned.seasonNumber === season.seasonNumber)"
          :disabled="completeBox"
          @change="toggleSeason(season.seasonNumber, ($event.target as HTMLInputElement).checked)"
        />
        <span
          >{{ t('tvOwnership.season', { number: season.seasonNumber })
          }}<small v-if="season.episodeCount != null">{{
            t('tvOwnership.episodes', { count: season.episodeCount })
          }}</small></span
        >
      </label>
      <select
        :name="`SeasonFormat${season.seasonNumber}`"
        :aria-label="t('tvOwnership.seasonFormat', { number: season.seasonNumber })"
        :disabled="
          completeBox || !ownedSeasons.some((owned) => owned.seasonNumber === season.seasonNumber)
        "
        :value="
          ownedSeasons.find((owned) => owned.seasonNumber === season.seasonNumber)?.mediaFormat ??
          defaultFormat
        "
        @change="setFormat(season.seasonNumber, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="format in mediaFormats" :key="format.value" :value="format.value">
          {{ format.value === otherOption ? t('common.other') : format.label }}
        </option>
      </select>
    </div>
  </fieldset>
</template>

<style src="../style/tv-season-ownership.css"></style>
