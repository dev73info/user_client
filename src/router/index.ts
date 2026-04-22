import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routerHistory =
  import.meta.env.VITE_ROUTER_MODE === 'history'
    ? createWebHistory(import.meta.env.BASE_URL)
    : createWebHashHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history: routerHistory,
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/free-resources',
      name: 'free-resources',
      component: () => import('@/views/FreeResourcesView.vue'),
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
      path: '/my-custom-resources',
      name: 'my-custom-resources',
      component: () => import('@/views/MyCustomResourcesView.vue'),
    },
    {
      path: '/tickets',
      name: 'tickets',
      component: () => import('@/views/TicketCenterView.vue'),
    },
    {
      path: '/coupon-claim',
      name: 'coupon-claim',
      component: () => import('@/views/CouponClaimView.vue'),
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
      path: '/:rootSlug/:entrySlug?',
      name: 'resource-catalog',
      component: () => import('@/views/ResourceCatalogView.vue'),
    },
    {
      path: '/:rootSlug/:entrySlug/:resourceSlug',
      name: 'resource-detail',
      component: () => import('@/views/ResourceDetailView.vue'),
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()
  auth.hydrate()

  const searchParams = new URLSearchParams(window.location.search)
  const oauthTokenFromSearch = (searchParams.get('oauth_token') ?? '').trim()
  const oauthErrorFromSearch = (searchParams.get('oauth_error') ?? '').trim()
  const oauthTokenFromQuery =
    typeof to.query.oauth_token === 'string' ? to.query.oauth_token.trim() : ''
  const oauthErrorFromQuery =
    typeof to.query.oauth_error === 'string' ? to.query.oauth_error.trim() : ''
  const oauthToken = oauthTokenFromQuery || oauthTokenFromSearch
  const oauthError = oauthErrorFromQuery || oauthErrorFromSearch

  if ((oauthTokenFromSearch || oauthErrorFromSearch) && window.location.search) {
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
  }

  if ((oauthToken || oauthError) && window.opener && !window.opener.closed) {
    window.opener.postMessage(
      {
        type: '73hub-github-oauth',
        oauthToken,
        oauthError,
      },
      window.location.origin,
    )
    window.close()
    return next(false)
  }

  if (oauthToken) {
    auth.setToken(oauthToken)
    const nextQuery = { ...to.query }
    delete nextQuery.oauth_token
    delete nextQuery.oauth_error
    return next({ path: to.path, query: nextQuery, replace: true })
  }

  if (oauthError) {
    const nextQuery = { ...to.query }
    delete nextQuery.oauth_token
    delete nextQuery.oauth_error
    return next({ path: to.path, query: nextQuery, replace: true })
  }

  const authRequired =
    to.name === 'profile' ||
    to.name === 'payment' ||
    to.name === 'my-custom-resources' ||
    to.name === 'tickets'

  if (auth.isAuthed && !auth.profileLoaded) {
    try {
      await auth.initializeSession()
    } catch {
      if (authRequired) {
        return next({ name: 'home' })
      }
    }
  }

  if (authRequired && !auth.isAuthed) {
    return next({ name: 'home' })
  }

  return next()
})

export default router
