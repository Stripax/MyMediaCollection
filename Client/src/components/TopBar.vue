<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Menu } from '@ark-ui/vue/menu'
import ToolbarTooltip from './ToolbarTooltip.vue'
import ToolbarIcon from './ToolbarIcon.vue'
import ThemePreview from './ThemePreview.vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import LanguageSelector from './LanguageSelector.vue'

// Language preference is stored in localStorage, but if it's not available, the default is English.
const { t, locale: language } = useI18n({ useScope: 'global' })
const emit = defineEmits<{
  'theme-change': [theme: string]
  'matrix-rain-change': [enabled: boolean]
  'matrix-rain-settings-change': [settings: { speed: number; brightness: number; density: number }]
}>()

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

function readNumberPreference(key: string, fallback: number, min: number, max: number) {
  const stored = readPreference(key)
  const value = stored === null ? NaN : Number(stored)
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

function handleRainKeydown(event: KeyboardEvent) {
  if (
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ', 'Enter'].includes(
      event.key,
    )
  )
    event.stopPropagation()
}

language.value = readPreference('mmc-language') === 'fi' ? 'fi' : 'en'
const savedTheme = readPreference('mmc-theme')
const theme = ref(savedTheme === 'dark' || savedTheme === 'black' ? savedTheme : 'light')
const matrixRain = ref(readPreference('mmc-matrix-rain') !== 'false')
const rainDefaults = { speed: 100, brightness: 55, density: 100 }
const rainSettings = reactive({
  speed: readNumberPreference('mmc-matrix-rain-speed', rainDefaults.speed, 25, 200),
  brightness: readNumberPreference('mmc-matrix-rain-brightness', rainDefaults.brightness, 10, 100),
  density: readNumberPreference('mmc-matrix-rain-density', rainDefaults.density, 0, 300),
})

function resetRainSettings() {
  Object.assign(rainSettings, rainDefaults)
}

watch(
  () => ({ ...rainSettings }),
  (value) => {
    savePreference('mmc-matrix-rain-speed', String(value.speed))
    savePreference('mmc-matrix-rain-brightness', String(value.brightness))
    savePreference('mmc-matrix-rain-density', String(value.density))
    emit('matrix-rain-settings-change', value)
  },
  { immediate: true },
)

watch(
  matrixRain,
  (value) => {
    savePreference('mmc-matrix-rain', String(value))
    emit('matrix-rain-change', value)
  },
  { immediate: true },
)

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
    emit('theme-change', value)
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
              <template v-if="theme === 'black'">
                <Menu.Separator class="language-menu-separator" />
                <Menu.CheckboxItem
                  v-model:checked="matrixRain"
                  value="matrix-rain"
                  class="language-menu-item matrix-rain-toggle"
                  :close-on-select="false"
                >
                  <Menu.ItemText>{{ t('topBar.matrixRain') }}</Menu.ItemText>
                  <span class="matrix-rain-switch" aria-hidden="true" />
                </Menu.CheckboxItem>
                <Transition
                  name="matrix-settings"
                  @before-enter="(element) => element.removeAttribute('inert')"
                  @before-leave="(element) => element.setAttribute('inert', '')"
                >
                  <div v-if="matrixRain" class="matrix-settings-panel">
                    <div class="matrix-settings-clip">
                      <fieldset class="matrix-rain-settings" @keydown="handleRainKeydown">
                        <legend>{{ t('topBar.matrixRainSettings') }}</legend>
                        <label class="matrix-rain-setting">
                          <span
                            >{{ t('topBar.matrixRainSpeed') }}
                            <output>{{ rainSettings.speed }} %</output></span
                          >
                          <input
                            v-model.number="rainSettings.speed"
                            name="MatrixRainSpeed"
                            type="range"
                            min="25"
                            max="200"
                            step="5"
                          />
                        </label>
                        <label class="matrix-rain-setting">
                          <span
                            >{{ t('topBar.matrixRainBrightness') }}
                            <output>{{ rainSettings.brightness }} %</output></span
                          >
                          <input
                            v-model.number="rainSettings.brightness"
                            name="MatrixRainBrightness"
                            type="range"
                            min="10"
                            max="100"
                            step="5"
                          />
                        </label>
                        <label class="matrix-rain-setting">
                          <span
                            >{{ t('topBar.matrixRainDensity') }}
                            <output>{{ rainSettings.density }} %</output></span
                          >
                          <input
                            v-model.number="rainSettings.density"
                            name="MatrixRainDensity"
                            type="range"
                            min="0"
                            max="300"
                            step="25"
                          />
                        </label>
                        <button
                          type="button"
                          class="matrix-rain-reset"
                          @click.stop="resetRainSettings"
                        >
                          {{ t('topBar.matrixRainReset') }}
                        </button>
                      </fieldset>
                    </div>
                  </div>
                </Transition>
              </template>
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
