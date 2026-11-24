import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import CollectionSourceDetails from '../CollectionSourceDetails.vue'
import type { CollectionSourceMetadata } from '../../models/collection'
import en from '../../lang/en.json'
import fi from '../../lang/fi.json'

const metadata: CollectionSourceMetadata = {
  source: 'TMDB',
  title: 'Title',
  originalTitle: null,
  overview: 'Original overview',
  localizedOverviews: { fi: 'Suomenkielinen yhteenveto', en: 'English overview' },
  releaseDate: null,
  language: 'fi-FI',
  platforms: [],
  fetchedAt: null,
}

describe('Source details overview', () => {
  it.each([1, 2])('follows language changes for TMDB media type %s', async (mediaType) => {
    const i18n = createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })
    const wrapper = mount(CollectionSourceDetails, {
      props: { metadata, mediaType },
      global: { plugins: [i18n] },
    })
    expect(wrapper.get('.source-details-overview').text()).toBe('Suomenkielinen yhteenveto')
    expect(wrapper.text()).not.toContain(fi.sourceMetadata.language)
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(wrapper.get('.source-details-overview').text()).toBe('English overview')
    expect(wrapper.text()).not.toContain(en.sourceMetadata.language)
    wrapper.unmount()
  })

  it.each([
    [{ fi: '', en: 'English fallback' }, 'English fallback'],
    [{ fi: '  ', en: '' }, fi.sourceMetadata.noOverview],
    [undefined, 'Original overview'],
  ] as const)('handles missing translations: %s', (localizedOverviews, expected) => {
    const wrapper = mount(CollectionSourceDetails, {
      props: { metadata: { ...metadata, localizedOverviews }, mediaType: 1 },
      global: { plugins: [createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })] },
    })
    expect(wrapper.get('.source-details-overview').text()).toBe(expected)
    wrapper.unmount()
  })

  it('keeps IGDB overviews unchanged', () => {
    const wrapper = mount(CollectionSourceDetails, {
      props: { metadata: { ...metadata, source: 'IGDB' }, mediaType: 3 },
      global: { plugins: [createI18n({ legacy: false, locale: 'fi', messages: { fi, en } })] },
    })
    expect(wrapper.get('.source-details-overview').text()).toBe('Original overview')
    wrapper.unmount()
  })
})
