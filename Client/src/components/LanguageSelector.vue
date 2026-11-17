<script setup lang="ts">
import { Menu } from '@ark-ui/vue/menu'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n({ useScope: 'global' })
const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
] as const
const selectedLanguage = computed(
  () => languages.find((language) => language.code === locale.value) ?? languages[0],
)
</script>

<template>
  <Menu.Root :positioning="{ placement: 'bottom-end', gutter: 8 }" lazy-mount>
    <Menu.Trigger class="language-trigger">
      <span aria-hidden="true">{{ selectedLanguage.flag }}</span>
      <span :lang="selectedLanguage.code">{{ selectedLanguage.name }}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        class="language-chevron"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </Menu.Trigger>
    <Teleport to="body">
      <Menu.Positioner class="language-positioner">
        <Menu.Content class="language-menu" :aria-label="t('selectLanguage')">
          <Menu.RadioItemGroup v-model="locale">
            <Menu.ItemGroupLabel class="language-menu-label">
              {{ t('selectLanguage') }}
            </Menu.ItemGroupLabel>
            <Menu.Separator class="language-menu-separator" />
            <Menu.RadioItem
              v-for="language in languages"
              :key="language.code"
              :value="language.code"
              class="language-menu-item"
            >
              <span aria-hidden="true">{{ language.flag }}</span>
              <Menu.ItemText :lang="language.code">{{ language.name }}</Menu.ItemText>
            </Menu.RadioItem>
          </Menu.RadioItemGroup>
        </Menu.Content>
      </Menu.Positioner>
    </Teleport>
  </Menu.Root>
</template>
