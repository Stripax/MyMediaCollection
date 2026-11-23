<script setup lang="ts">
import { Menu } from '@ark-ui/vue/menu'
import { useI18n } from 'vue-i18n'
import ToolbarTooltip from './ToolbarTooltip.vue'
import ToolbarIcon from './ToolbarIcon.vue'

const { t, locale } = useI18n({ useScope: 'global' })
const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮' },
] as const
</script>

<template>
  <Menu.Root :positioning="{ placement: 'bottom-end', gutter: 8 }" lazy-mount>
    <ToolbarTooltip v-slot="{ describedby }" :text="t('topBar.languages')">
      <Menu.Trigger
        class="language-trigger toolbar-button toolbar-icon-button"
        :aria-label="t('selectLanguage')"
        :aria-describedby="describedby"
      >
        <ToolbarIcon name="language" />
      </Menu.Trigger>
    </ToolbarTooltip>
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
