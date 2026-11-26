import { readonly, ref } from 'vue'

const revision = ref(0)

export function useCollectionRefresh() {
  return {
    revision: readonly(revision),
    refresh: () => {
      revision.value++
    },
  }
}
