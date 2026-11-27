<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  mediaFormats,
  otherOption,
  itemVersions,
  hasIndividualSeasons,
  versionFormats,
  type CollectionItem,
} from '../models/collection'
const props = defineProps<{ item: CollectionItem }>()
const { t } = useI18n({ useScope: 'global' })
const formats = computed(() => [...new Set(itemVersions(props.item).flatMap(versionFormats))])
function label(value: number | null) {
  return value === otherOption
    ? t('common.other')
    : (mediaFormats.find((format) => format.value === value)?.label ?? '—')
}
</script>
<template>
  <div class="media-format-badges">
    <span v-if="item.isCollection" class="media-format-badge">{{
      t('mediaCollection.label')
    }}</span>
    <span
      v-if="
        item.mediaType === 2 &&
        !item.isCollection &&
        itemVersions(item).some((version) => version.isCompleteBox)
      "
      class="media-format-badge media-complete-box-badge"
      >{{ t('tvOwnership.completeBoxShort') }}</span
    >
    <span
      v-if="
        item.mediaType === 2 && !item.isCollection && itemVersions(item).some(hasIndividualSeasons)
      "
      class="media-format-badge media-individual-seasons-badge"
      >{{ t('tvOwnership.individualSeasons') }}</span
    >
    <span
      v-for="format in formats"
      :key="format ?? 'unknown'"
      class="media-format-badge"
      :data-media-format="format ?? 'unknown'"
      :aria-label="`${t('itemForm.mediaFormat')}: ${label(format)}`"
      >{{ label(format) }}</span
    >
  </div>
</template>
<style src="../style/media-format-badges.css"></style>
