<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ServiceAttribution from './ServiceAttribution.vue'
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <ServiceAttribution
    :label="t('igdb.credits')"
    href="https://www.igdb.com"
    logo="https://upload.wikimedia.org/wikipedia/commons/1/19/IGDB_logo.svg"
    logo-alt="IGDB"
    :text="t('igdb.attribution')"
  />
</template>
