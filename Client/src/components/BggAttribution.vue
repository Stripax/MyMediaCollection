<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ServiceAttribution from './ServiceAttribution.vue'
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <ServiceAttribution
    :label="t('bgg.credits')"
    href="https://boardgamegeek.com"
    logo="https://dm1i7q1ruvbhg.cloudfront.net/assets/powered_by_bgg-9f2993c7fad826d5407c35b5c8117b08d2a6cdf5beb1f0c02d06a7dc7f5cdd7f.png"
    logo-alt="Powered by BGG"
    :text="t('bgg.attribution')"
  />
</template>
