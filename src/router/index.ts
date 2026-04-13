import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '@/views/HomeView.vue'
import PaymentView from '@/views/PaymentView.vue'
import ProfileView from '@/views/ProfileView.vue'
import TermsView from '@/views/TermsView.vue'
import PrivacyPolicyView from '@/views/PrivacyPolicyView.vue'
import PaymentRefundView from '@/views/PaymentRefundView.vue'
import McPluginsView from '@/views/McPluginsView.vue'
import McPluginsJavaView from '@/views/McPluginsJavaView.vue'
import McPluginsBedrockView from '@/views/McPluginsBedrockView.vue'

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
    {
      path: '/terms',
      name: 'terms',
      component: TermsView,
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: PrivacyPolicyView,
    },
    {
      path: '/payment-refund',
      name: 'payment-refund',
      component: PaymentRefundView,
    },
    {
      path: '/mc-plugins',
      component: McPluginsView,
      children: [
        {
          path: '',
          redirect: { name: 'mc-plugins-java' },
        },
        {
          path: 'java',
          name: 'mc-plugins-java',
          component: McPluginsJavaView,
        },
        {
          path: 'bedrock',
          name: 'mc-plugins-bedrock',
          component: McPluginsBedrockView,
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
    return next({ path: to.path, query: {} })
  }

  if (oauthError) {
    return next({ path: to.path, query: {} })
  }

  const authRequired = to.name === 'profile' || to.name === 'payment'
  if (authRequired && !auth.isAuthed) {
    return next({ name: 'home' })
  }

  return next()
})

export default router
