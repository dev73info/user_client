import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '@/views/HomeView.vue'
import PaymentView from '@/views/PaymentView.vue'
import ProfileView from '@/views/ProfileView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/payment',
      name: 'payment',
      component: PaymentView,
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
    },
  ],
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  auth.hydrate()

  const authRequired = to.name === 'profile' || to.name === 'payment'
  if (authRequired && !auth.isAuthed) {
    return next({ name: 'home' })
  }

  return next()
})

export default router
