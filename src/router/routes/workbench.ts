/**
 * `/workbench` 用户工作台的父路由与子条目（含开发者工作台的 `devWorkbenchRoutes`）。
 *
 * 父级 `meta.hideSiteFooter` 与子条目的 `title` / `description` / `requiresRealname` 原样保留；
 * 末尾 `...devWorkbenchRoutes` 的位置也不能动——它就是开发者条目的插入点。
 */
import type { RouteRecordRaw } from 'vue-router'

import { devWorkbenchRoutes } from '@/router/dev'

export const workbenchRoutes: RouteRecordRaw[] = [
  {
    path: '/profile',
    name: 'profile',
    redirect: { name: 'workbench', query: { view: 'profile' } },
  },
  {
    path: '/workbench',
    component: () => import('@/views/UserWorkbenchView.vue'),
    meta: {
      hideSiteFooter: true,
      workbenchShell: true,
    },
    children: [
      {
        path: '',
        name: 'workbench',
        component: () => import('@/views/WorkbenchHomeView.vue'),
        meta: {
          workbenchChat: true,
        },
      },
      {
        path: 'requirements',
        name: 'workbench-requirements',
        component: () => import('@/views/MyRequirementsView.vue'),
        meta: {
          title: '我的需求',
          description: '查看支付、交付与验收进度',
        },
      },
      {
        path: 'favorites',
        name: 'workbench-favorites',
        component: () => import('@/views/CommunityListView.vue'),
        meta: { title: '我的收藏', description: '查看收藏的社区帖子' },
      },
      // 需求方不再提供独立 AI 助手页面，旧链接直接回到需求列表。
      { path: 'assistant', redirect: { name: 'workbench-requirements' } },
      {
        path: 'invoices',
        name: 'workbench-invoices',
        component: () => import('@/views/InvoiceCenterView.vue'),
        meta: {
          title: '我的发票',
          description: '获取发票、查看与下载发票',
        },
      },
      {
        path: 'signatures',
        name: 'workbench-signatures',
        component: () => import('@/views/MySignaturesView.vue'),
        meta: { title: '我的合同', requiresRealname: true },
      },
      {
        path: 'signatures/:contractId(\\d+)',
        name: 'workbench-signature-detail',
        component: () => import('@/views/ContractSignView.vue'),
        meta: { title: '我的合同 / 合同详情', requiresRealname: true },
      },
      {
        path: 'account',
        name: 'workbench-account',
        component: () => import('@/views/AccountCouponsView.vue'),
        meta: {
          title: '账户与优惠券',
          description: '管理账户资料、安全设置与优惠券',
        },
      },
      {
        path: 'account/authorized-apps',
        name: 'workbench-authorized-apps',
        component: () => import('@/views/AuthorizedAppsView.vue'),
        meta: { title: '已授权应用', description: '查看并撤销对开发者站点的授权' },
      },
      {
        path: 'tickets',
        name: 'workbench-tickets',
        component: () => import('@/views/TicketCenterView.vue'),
        meta: { title: '工单中心', description: '提交问题与查看回复' },
      },
      {
        // 「我的背包」下的优惠券中心：券包与券码。
        path: 'coupons',
        name: 'workbench-coupons',
        component: () => import('@/views/CouponCenterView.vue'),
        meta: {
          title: '优惠券中心',
          description: '查看券包并复制券码',
        },
      },
      {
        path: 'points',
        name: 'workbench-points',
        component: () => import('@/views/PointsCenterView.vue'),
        meta: { title: '积分中心', description: '签到、积分明细与打赏' },
      },
      {
        path: 'perks',
        name: 'workbench-perks',
        component: () => import('@/views/PerksCenterView.vue'),
        meta: { title: '我的权益', description: '佩戴已解锁权益' },
      },
      {
        path: 'invite',
        name: 'workbench-invite',
        redirect: { name: 'workbench-badges' },
      },
      {
        path: 'invite/leaderboard',
        name: 'workbench-invite-leaderboard',
        component: () => import('@/views/InviteLeaderboardView.vue'),
        meta: { title: '邀请排行榜', description: '查看周榜与总榜' },
      },
      {
        path: 'badges',
        name: 'workbench-badges',
        component: () => import('@/views/BadgeCenterView.vue'),
        meta: { title: '勋章与邀请', description: '查看徽章与邀请记录' },
      },
      {
        path: 'resource-purchases',
        name: 'workbench-resource-purchases',
        component: () => import('@/views/MyResourcePurchasesView.vue'),
        meta: {
          title: '我的已购资源',
          description: '查看已购数字化资源（退款由卖家或平台发起）',
        },
      },
      {
        path: 'purchase-transfers',
        name: 'workbench-purchase-transfers',
        component: () => import('@/views/PurchaseTransfersView.vue'),
        meta: { title: '过户与转移', description: '处理资源所有权与订单使用权申请' },
      },
      // 团队服务已并入开发者工作台（路由见 router/dev.ts 的 devWorkbenchRoutes），旧路径保留重定向
      { path: 'teams', redirect: { name: 'workbench-teams' } },
      {
        path: 'teams/:teamId',
        redirect: (to) => ({
          name: 'workbench-team-detail',
          params: to.params as Record<string, string | string[]>,
        }),
      },
      { path: 'team-resources', redirect: { name: 'workbench-team-resources' } },
      {
        // 系统通知：公开申请、解除合作案件与本人评论警告聚合展示。
        // 开发者工作台另有 dev-notifications（见 router/dev.ts），同一个页面、各自一条路由。
        path: 'notifications',
        name: 'workbench-notifications',
        component: () => import('@/views/NotificationCenterView.vue'),
        meta: {
          title: '系统通知',
          description: '公开申请、评论警告与解除合作案件',
        },
      },
      {
        path: 'messages',
        name: 'workbench-messages',
        component: () => import('@/components/workbench/WorkbenchChatView.vue'),
        meta: {
          workbenchChat: true,
        },
      },
      {
        // 「我的定制」已并入「我的需求」：旧路径保留为跳转，避免站外旧链接 404。
        path: 'resources',
        redirect: { name: 'workbench-requirements' },
      },
      {
        path: 'realname',
        name: 'workbench-realname',
        redirect: (to) => ({
          name: 'workbench-account',
          query: to.query,
          hash: to.hash,
        }),
      },
      ...devWorkbenchRoutes,
    ],
  },
]
