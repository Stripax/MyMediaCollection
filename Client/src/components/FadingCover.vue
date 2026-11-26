<script setup lang="ts">
withDefaults(
  defineProps<{
    src: string
    width: number
    height: number
    alt?: string
    imageClass?: string
    mode?: 'out-in'
  }>(),
  { alt: '' },
)
const emit = defineEmits<{ error: [src: string] }>()
</script>

<template>
  <span
    class="fading-cover"
    :class="{ 'fading-cover-sequential': mode === 'out-in' }"
    :style="{ width: `${width}px`, height: `${height}px` }"
  >
    <Transition
      name="cover-fade"
      :mode="mode"
      @before-enter="(element) => element.removeAttribute('aria-hidden')"
      @before-leave="(element) => element.setAttribute('aria-hidden', 'true')"
    >
      <img
        :key="src"
        :src="src"
        :alt="alt"
        :class="imageClass"
        :width="width"
        :height="height"
        @error="emit('error', ($event.target as HTMLImageElement).getAttribute('src') || src)"
      />
    </Transition>
  </span>
</template>

<style src="../style/fading-cover.css"></style>
<style src="../style/details-fade.css"></style>
