<script setup lang="ts">
import { Select, createListCollection } from '@ark-ui/vue/select'
import { computed, onBeforeUnmount, onMounted, onUpdated, reactive, ref, shallowRef } from 'vue'

interface Option {
  value: string
  label: string
  disabled: boolean
}
const nativeHost = ref<HTMLElement | null>(null)
const trigger = ref<{ $el: HTMLButtonElement } | null>(null)
const options = shallowRef<Option[]>([])
const selected = ref<string[]>([])
const ready = ref(false)
const open = ref(false)
const invalid = ref(false)
const state = reactive({
  disabled: false,
  required: false,
  label: '',
  describedby: undefined as string | undefined,
})
const collection = computed(() => createListCollection({ items: options.value }))
let observer: MutationObserver | undefined
let signature = ''
function nativeSelect() {
  return nativeHost.value?.querySelector('select')
}
function syncNative() {
  const select = nativeSelect()
  if (!select) return
  const entries = Array.from(select.options, (option) => ({
    value: option.value,
    label: option.textContent?.trim() ?? '',
    disabled:
      option.disabled ||
      (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
  }))
  const nextSignature = JSON.stringify(entries)
  if (nextSignature !== signature) {
    signature = nextSignature
    options.value = entries
  }
  const value = select.selectedIndex < 0 ? [] : [select.value]
  if (JSON.stringify(selected.value) !== JSON.stringify(value)) selected.value = value
  state.disabled = select.matches(':disabled')
  state.required = select.required
  state.label =
    select.getAttribute('aria-label') ||
    select
      .closest('label')
      ?.querySelector(':scope > span:not(.select-control)')
      ?.textContent?.trim() ||
    select.name
  state.describedby = select.getAttribute('aria-describedby') ?? undefined
  if (select.validity.valid) invalid.value = false
  if (state.disabled) open.value = false
}
function choose(values: string[]) {
  const select = nativeSelect()
  if (!select || select.matches(':disabled')) return
  select.value = values[0] ?? ''
  select.dispatchEvent(new Event('input', { bubbles: true }))
  select.dispatchEvent(new Event('change', { bubbles: true }))
  syncNative()
}
function focusTrigger() {
  trigger.value?.$el.focus({ preventScroll: true })
}
function showValidation() {
  invalid.value = true
  focusTrigger()
}
function showList(element: Element) {
  element.removeAttribute('inert')
  element.removeAttribute('aria-hidden')
}
function hideList(element: Element) {
  element.setAttribute('inert', '')
  element.setAttribute('aria-hidden', 'true')
}
onMounted(() => {
  const select = nativeSelect()
  if (!select || !nativeHost.value) return
  // Keep the original select for v-model, change handlers, form data and native validation.
  select.tabIndex = -1
  select.setAttribute('aria-hidden', 'true')
  syncNative()
  ready.value = true
  observer = new MutationObserver(syncNative)
  observer.observe(nativeHost.value, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  const label = select.closest('label')
  if (label) observer.observe(label, { subtree: true, childList: true, characterData: true })
  for (let parent = select.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'FIELDSET')
      observer.observe(parent, { attributes: true, attributeFilter: ['disabled'] })
  }
})
onUpdated(syncNative)
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <span class="select-control">
    <Select.Root
      v-if="ready"
      v-model:open="open"
      :collection="collection"
      :model-value="selected"
      :disabled="state.disabled"
      :required="state.required"
      :invalid="invalid"
      :positioning="{ placement: 'bottom-start', gutter: 4, sameWidth: true, strategy: 'fixed' }"
      as="span"
      class="select-control-widget"
      @update:model-value="choose"
    >
      <Select.Label as="span" class="select-control-label">{{ state.label }}</Select.Label>
      <Select.Control as="span">
        <Select.Trigger
          ref="trigger"
          class="select-control-trigger"
          :aria-label="state.label"
          :aria-describedby="state.describedby"
        >
          <Select.ValueText class="select-control-value" />
          <svg
            class="select-control-arrow"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Select.Trigger>
      </Select.Control>
      <Teleport to="body">
        <Transition name="select-options" @before-enter="showList" @before-leave="hideList">
          <Select.Positioner v-if="open" class="select-control-positioner">
            <Select.Content
              class="select-control-listbox"
              :hidden="false"
              :aria-label="state.label"
            >
              <Select.Item
                v-for="option in options"
                :key="option.value"
                :item="option"
                class="select-control-option"
                ><Select.ItemText>{{ option.label }}</Select.ItemText></Select.Item
              >
            </Select.Content>
          </Select.Positioner>
        </Transition>
      </Teleport>
    </Select.Root>
    <span
      ref="nativeHost"
      class="select-control-native"
      @input.capture="syncNative"
      @change.capture="syncNative"
      @focusin="focusTrigger"
      @invalid.capture="showValidation"
      ><slot
    /></span>
  </span>
</template>

<style src="../style/select-control.css"></style>
