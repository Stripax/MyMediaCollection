import { createRouter, createWebHistory, type RouterHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import CollectionView from '../views/CollectionView.vue'
import type { CollectionCategory } from '../models/collection'

export function createAppRouter(history: RouterHistory) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomeView },
      {
        path: '/collection/:category(all|movies|tvSeries|videoGames|boardGames)?',
        name: 'collection',
        component: CollectionView,
        props: (route) => ({ category: (route.params.category || 'all') as CollectionCategory }),
      },
      { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
    ],
    scrollBehavior: () => ({ top: 0 }),
  })
}

export default createAppRouter(createWebHistory(import.meta.env.BASE_URL))
