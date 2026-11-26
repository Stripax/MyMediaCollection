<script setup lang="ts">
defineProps<{
  name:
    | 'settings'
    | 'sun'
    | 'moon'
    | 'github'
    | 'login'
    | 'language'
    | 'terminal'
    | 'wrench'
    | 'trash'
    | 'info'
}>()
</script>

<template>
  <svg
    class="toolbar-icon"
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="name === 'settings'">
      <path
        d="m9 3-.5 2a8 8 0 0 0-2 1.2l-2-.6-2 3.4L4 10.5a8 8 0 0 0 0 3l-1.5 1.5 2 3.4 2-.6a8 8 0 0 0 2 1.2l.5 2h6l.5-2a8 8 0 0 0 2-1.2l2 .6 2-3.4-1.5-1.5a8 8 0 0 0 0-3L21.5 9l-2-3.4-2 .6a8 8 0 0 0-2-1.2L15 3Z"
      />
      <circle cx="12" cy="12" r="3" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </template>
    <path v-else-if="name === 'moon'" d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
    <path
      v-else-if="name === 'github'"
      d="M9 19c-4.3 1.3-4.3-2.2-6-2.7m12 5v-3.4c0-1-.3-1.7-.8-2.1 2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.4 6c.1-.3.6-1.7-.1-3.5 0 0-1.1-.4-3.6 1.3a12.3 12.3 0 0 0-6.4 0C5.8 2.1 4.7 2.5 4.7 2.5 4 4.3 4.5 5.7 4.6 6a4.7 4.7 0 0 0-1.3 3.8c0 4.7 2.8 5.7 5.5 6-.5.4-.8 1.1-.8 2.1v3.4"
    />
    <path
      v-else-if="name === 'language'"
      fill="currentColor"
      stroke="none"
      d="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z"
    />
    <template v-else-if="name === 'terminal'">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3m6 0h4" />
    </template>
    <path
      v-else-if="name === 'wrench'"
      d="M14.7 6.3a5.5 5.5 0 0 0-7 7L3.4 17.6a2.1 2.1 0 0 0 3 3l4.3-4.3a5.5 5.5 0 0 0 7-7l-3.4 3.4-3-3Z"
    />
    <path v-else-if="name === 'info'" d="M9 5h6M12 5v14M9 19h6" />
    <template v-else-if="name === 'trash'">
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
    </template>
    <template v-else>
      <path d="M14 3h6v18h-6M3 12h12m-4-4 4 4-4 4" />
    </template>
  </svg>
</template>
