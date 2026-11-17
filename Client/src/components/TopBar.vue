<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSelector from './LanguageSelector.vue'

// Language preference is stored in localStorage, but if it's not available, the default is English.
const { t, locale: language } = useI18n({ useScope: 'global' })

function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Settings still work for this session when browser storage is unavailable.
  }
}

language.value = readPreference('mmc-language') === 'fi' ? 'fi' : 'en'
const darkMode = ref(readPreference('mmc-theme') === 'dark')

watch(
  language,
  (value) => {
    document.documentElement.lang = value
    document.title = t('title')
    savePreference('mmc-language', value)
  },
  { immediate: true },
)

watch(
  darkMode,
  (value) => {
    const theme = value ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    savePreference('mmc-theme', theme)
  },
  { immediate: true },
)
</script>

<template>
  <header class="top-bar">
    <span class="brand">{{ t('title') }}</span>

    <div class="settings" role="group" :aria-label="t('settings')">
      <LanguageSelector />

      <label class="theme-setting">
        <span>{{ t('darkMode') }}</span>
        <input v-model="darkMode" type="checkbox" role="switch" />
        <span class="switch-track" aria-hidden="true">
          <span class="switch-thumb">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path v-if="darkMode" d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
              <template v-else>
                <circle cx="12" cy="12" r="4" />
                <path
                  d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
                />
              </template>
            </svg>
          </span>
        </span>
      </label>
    </div>
  </header>
</template>

<style src="../style/top-bar.css"></style>
