<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ServiceAttribution from './ServiceAttribution.vue'
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <ServiceAttribution
    :label="t('tmdb.credits')"
    href="https://www.themoviedb.org"
    logo="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
    logo-alt="TMDB"
    :text="t('tmdb.attribution')"
    notice="This product uses the TMDB API but is not endorsed or certified by TMDB."
  />
</template>
