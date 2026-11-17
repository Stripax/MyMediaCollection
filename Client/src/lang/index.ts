import { createI18n } from 'vue-i18n'
import en from './en.json'
import fi from './fi.json'

export default createI18n({
  legacy: false,
  locale: 'fi',
  fallbackLocale: 'fi',
  messages: { en, fi },
})
