<script setup lang="ts">
import { ref, useId } from 'vue'

defineProps<{ text: string }>()
const id = useId()
const visible = ref(false)
</script>

<template>
  <span
    class="toolbar-tooltip"
    @mouseenter="visible = true"
    @mouseleave="visible = false"
    @keydown.esc="visible = false"
    @click="visible = false"
  >
    <slot :describedby="visible ? id : undefined" />
    <Transition name="toolbar-tooltip">
      <span v-if="visible" :id="id" class="toolbar-tooltip-content" role="tooltip">
        {{ text }}
      </span>
    </Transition>
  </span>
</template>
