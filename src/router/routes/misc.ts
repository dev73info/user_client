/**
 * 门户的独立页面与旧地址：消息中心、工单、实名、领券、关于、积分商城、协议与说明、合同签署。
 *
 * 其中 `/my-custom-resources`、`/tickets`、`/realname` 是旧地址，只做跳转（落点是用户工作台）。
 */
import type { RouteRecordRaw } from 'vue-router'

export const portalMiscRoutes: RouteRecordRaw[] = [
  {
    path: '/messages',
    name: 'messages',
    component: () => import('@/views/MessagesView.vue'),
    meta: {
      hideSiteFooter: true,
    },
  },
  {
    path: '/my-custom-resources',
    name: 'my-custom-resources',
    redirect: { name: 'workbench-requirements' },
  },
  {
    path: '/tickets',
    name: 'tickets',
    redirect: { name: 'workbench-tickets' },
  },
  {
    path: '/realname',
    name: 'realname',
    redirect: (to) => ({
      name: 'workbench-account',
      query: to.query,
      hash: to.hash,
    }),
  },
  {
    path: '/coupon-claim',
    name: 'coupon-claim',
    component: () => import('@/views/CouponClaimView.vue'),
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
  },
  {
    path: '/points-mall',
    name: 'points-mall',
    component: () => import('@/views/MallView.vue'),
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
    path: '/contract-sign',
    name: 'contract-sign',
    component: () => import('@/views/ContractSignView.vue'),
  },
]
