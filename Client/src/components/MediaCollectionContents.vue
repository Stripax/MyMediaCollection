<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CollectionContent } from '../models/collection'
const contents = defineModel<CollectionContent[]>({ default: () => [] })
const { t } = useI18n({ useScope: 'global' })
</script>
<template>
  <div class="media-collection-contents">
    <p>{{ t('mediaCollection.sharedFormat') }}</p>
    <div v-for="(entry, index) in contents" :key="index" class="media-collection-entry">
      <label class="item-form-field">
        <span>{{ t('mediaCollection.entryName', { number: index + 1 }) }}</span>
        <input
          :value="entry.name"
          :name="`CollectionContent-${index}`"
          required
          maxlength="300"
          autocomplete="off"
          @input="
            contents = contents.map((item, current) =>
              current === index
                ? { ...item, name: ($event.target as HTMLInputElement).value }
                : item,
            )
          "
        />
      </label>
      <button type="button" @click="contents = contents.filter((_, current) => current !== index)">
        {{ t('mediaCollection.remove') }}
      </button>
    </div>
    <button
      type="button"
      :disabled="contents.length >= 100"
      @click="contents = [...contents, { name: '' }]"
    >
      {{ t('mediaCollection.addEntry') }}
    </button>
  </div>
</template>
<style src="../style/media-collection.css"></style>
