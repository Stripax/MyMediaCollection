<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ speed?: number; brightness?: number; density?: number }>(),
  {
    speed: 100,
    brightness: 55,
    density: 100,
  },
)
const alphabet = '0123456789アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ'
const columns = Array.from({ length: 144 }, () => {
  const length = 30 + Math.floor(Math.random() * 40)
  return {
    text: Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
      '\n',
    ),
    style: {
      '--rain-duration': `${14 + Math.random() * 18}s`,
      animationDelay: `${-Math.random() * 32}s`,
      opacity: 0.35 + Math.random() * 0.65,
    },
  }
})
const visibleColumns = computed(() => columns.slice(0, Math.round((48 * props.density) / 100)))
</script>

<template>
  <div
    class="matrix-rain"
    :style="{ '--rain-speed': speed / 100, opacity: brightness / 100 }"
    aria-hidden="true"
    inert
  >
    <span
      v-for="(column, index) in visibleColumns"
      :key="index"
      class="matrix-rain-column"
      :style="{ ...column.style, left: `${((index + 0.5) / visibleColumns.length) * 100}%` }"
      >{{ column.text }}</span
    >
  </div>
</template>

<style src="../style/matrix-rain.css"></style>
