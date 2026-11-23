<script setup lang="ts">
import { ref, watch } from 'vue'
import { Menu } from '@ark-ui/vue/menu'
import ToolbarTooltip from './ToolbarTooltip.vue'
import ToolbarIcon from './ToolbarIcon.vue'
import ThemePreview from './ThemePreview.vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
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
const savedTheme = readPreference('mmc-theme')
const theme = ref(savedTheme === 'dark' || savedTheme === 'black' ? savedTheme : 'light')

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
  theme,
  (value) => {
    document.documentElement.dataset.theme = value
    savePreference('mmc-theme', value)
  },
  { immediate: true },
)
</script>

<template>
  <header class="top-bar">
    <RouterLink class="brand" :to="{ name: 'home' }">{{ t('title') }}</RouterLink>

    <div class="settings" role="group" :aria-label="t('settings')">
      <ToolbarTooltip v-slot="{ describedby }" text="Github">
        <a
          class="toolbar-button toolbar-icon-button"
          href="https://github.com/Stripax/MyMediaCollection"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Github"
          :aria-describedby="describedby"
        >
          <ToolbarIcon name="github" />
        </a>
      </ToolbarTooltip>
      <LanguageSelector />
      <Menu.Root :positioning="{ placement: 'bottom-end', gutter: 8 }" lazy-mount>
        <ToolbarTooltip v-slot="{ describedby }" :text="t('topBar.themesAndInfo')">
          <Menu.Trigger
            class="toolbar-button toolbar-icon-button theme-trigger"
            :aria-label="t('topBar.themesAndInfo')"
            :aria-describedby="describedby"
          >
            <ToolbarIcon name="settings" />
          </Menu.Trigger>
        </ToolbarTooltip>
        <Teleport to="body">
          <Menu.Positioner class="language-positioner">
            <Menu.Content class="language-menu theme-menu" :aria-label="t('topBar.themes')">
              <Menu.RadioItemGroup v-model="theme">
                <Menu.ItemGroupLabel class="language-menu-label">{{
                  t('topBar.themes')
                }}</Menu.ItemGroupLabel>
                <Menu.Separator class="language-menu-separator" />
                <Menu.RadioItem value="light" class="language-menu-item">
                  <ToolbarIcon name="sun" />
                  <Menu.ItemText>{{ t('topBar.lightMode') }}</Menu.ItemText>
                  <ThemePreview theme="light" />
                </Menu.RadioItem>
                <Menu.RadioItem value="dark" class="language-menu-item">
                  <ToolbarIcon name="moon" />
                  <Menu.ItemText>{{ t('darkMode') }}</Menu.ItemText>
                  <ThemePreview theme="dark" />
                </Menu.RadioItem>
                <Menu.RadioItem value="black" class="language-menu-item">
                  <ToolbarIcon name="terminal" />
                  <Menu.ItemText>{{ t('topBar.blackMode') }}</Menu.ItemText>
                  <ThemePreview theme="black" />
                </Menu.RadioItem>
              </Menu.RadioItemGroup>
            </Menu.Content>
          </Menu.Positioner>
        </Teleport>
      </Menu.Root>
      <span class="toolbar-divider" aria-hidden="true" />
      <ToolbarTooltip v-slot="{ describedby }" :text="t('topBar.login')" class="login-tooltip">
        <button type="button" class="login-button" :aria-describedby="describedby">
          {{ t('topBar.login') }}
          <ToolbarIcon name="login" />
        </button>
      </ToolbarTooltip>
    </div>
  </header>
</template>

<style src="../style/top-bar.css"></style>
