<script setup lang="ts">
defineProps<{
  label: string
  href: string
  logo: string
  logoAlt: string
  text: string
  notice?: string
}>()
</script>

<template>
  <aside class="service-attribution" :aria-label="label">
    <a class="service-credit" :href="href" target="_blank" rel="noopener noreferrer">
      <img
        class="service-credit-logo"
        :src="logo"
        :alt="logoAlt"
        width="96"
        height="48"
        loading="lazy"
      />
      <span class="service-credit-text">
        <span>{{ text }}</span>
        <span v-if="notice" class="service-credit-notice">{{ notice }}</span>
      </span>
    </a>
  </aside>
</template>

<style src="../style/service-attribution.css"></style>
