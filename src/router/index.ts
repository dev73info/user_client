import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/payment',
      name: 'payment',
      component: () => import('@/views/PaymentView.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('@/views/TermsView.vue'),
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('@/views/PrivacyPolicyView.vue'),
    },
    {
      path: '/payment-refund',
      name: 'payment-refund',
      component: () => import('@/views/PaymentRefundView.vue'),
    },
    {
      path: '/mc-plugins',
      component: () => import('@/views/McPluginsView.vue'),
      children: [
        {
          path: '',
          redirect: { name: 'mc-plugins-java' },
        },
        {
          path: 'java',
          name: 'mc-plugins-java',
          component: () => import('@/views/McPluginsJavaView.vue'),
        },
        {
          path: 'bedrock',
          name: 'mc-plugins-bedrock',
          component: () => import('@/views/McPluginsBedrockView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  auth.hydrate()

  const oauthToken = typeof to.query.oauth_token === 'string' ? to.query.oauth_token.trim() : ''
  const oauthError = typeof to.query.oauth_error === 'string' ? to.query.oauth_error.trim() : ''

  if (oauthToken) {
    auth.setToken(oauthToken)
    return next({ path: to.path, query: {}, replace: true })
  }

  if (oauthError) {
    return next({ path: to.path, query: {}, replace: true })
  }

  const authRequired = to.name === 'profile' || to.name === 'payment'
  if (authRequired && !auth.isAuthed) {
    return next({ name: 'home' })
  }

  return next()
})

export default router
