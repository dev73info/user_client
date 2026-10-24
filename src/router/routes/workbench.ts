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
    redirect: { name: 'workbench' },
  },
  {
    path: '/workbench',
    component: () => import('@/views/UserWorkbenchView.vue'),
    meta: {
      hideSiteFooter: true,
    },
    children: [
      {
        path: '',
        name: 'workbench',
        component: () => import('@/views/ProfileView.vue'),
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
        // R041：买家查看并撤销对接口资源站点的 OAuth 授权。
        path: 'account/authorized-apps',
        name: 'workbench-authorized-apps',
        component: () => import('@/views/AuthorizedAppsView.vue'),
        meta: {
          title: '已授权应用',
          description: '查看并撤销对开发者站点的授权',
        },
      },
      {
        // 「我的背包」下的四页：积分中心（余额、打赏、明细）、权益中心、优惠券中心、我的徽章墙。
        // 路径 workbench/points 沿用原「我的背包」那一条，老书签仍然落到积分中心。
        path: 'points',
        name: 'workbench-points',
        component: () => import('@/views/PointsCenterView.vue'),
        meta: {
          title: '积分中心',
          description: '查看积分余额、打赏与明细',
        },
      },
      {
        path: 'perks',
        name: 'workbench-perks',
        component: () => import('@/views/PerksCenterView.vue'),
        meta: {
          title: '权益中心',
          description: '管理已解锁的权益与用户名颜色',
        },
      },
      {
        path: 'coupons',
        name: 'workbench-coupons',
        component: () => import('@/views/CouponCenterView.vue'),
        meta: {
          title: '优惠券中心',
          description: '查看券包并复制券码',
        },
      },
      {
        path: 'favorites',
        name: 'workbench-favorites',
        component: () => import('@/views/MyFavoritesView.vue'),
        meta: {
          title: '我的收藏',
          description: '查看收藏的社区帖子',
        },
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
        // R042：接口资源订单的使用权转移申请（待我确认 / 我发起的）。
        path: 'resource-purchases/transfers',
        name: 'workbench-purchase-transfers',
        component: () => import('@/views/PurchaseTransfersView.vue'),
        meta: {
          title: '使用权转移',
          description: '处理接口资源订单的转移申请',
        },
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
        // 「我的邀请」已与「我的徽章墙」合并成一页（见下方 badges 路由），本路径保留为跳转：
        // 老书签、站内旧链接与首页「立即邀请」入口都还指着它，不能 404。
        path: 'invite',
        name: 'workbench-invite',
        redirect: { name: 'workbench-badges' },
      },
      {
        path: 'invite/leaderboard',
        name: 'workbench-invite-leaderboard',
        component: () => import('@/views/InviteLeaderboardView.vue'),
        meta: {
          title: '邀请排行榜',
          description: '查看周榜与总榜',
        },
      },
      {
        // 「勋章与邀请」：徽章墙原是从「我的邀请」页底搬出来单独成页的，
        // 现在两件事合成同一页（徽章墙一块 + 邀请一块），菜单也只留这一条入口。
        path: 'badges',
        name: 'workbench-badges',
        component: () => import('@/views/BadgeCenterView.vue'),
        meta: {
          title: '勋章与邀请',
          description: '查看与佩戴徽章、邀请好友并查看邀请记录',
        },
      },
      {
        // 系统通知：三类系统消息（评论警告、历史沟通公开申请、平台公告）聚合展示。
        // 开发者工作台另有 dev-notifications（见 router/dev.ts），同一个页面、各自一条路由。
        path: 'notifications',
        name: 'workbench-notifications',
        component: () => import('@/views/NotificationCenterView.vue'),
        meta: {
          title: '系统通知',
          description: '平台公告、评论警告与待确认事项',
        },
      },
      {
        path: 'messages',
        name: 'workbench-messages',
        component: () => import('@/views/MessagesView.vue'),
      },
      {
        // 「我的定制」已并入「我的需求」：旧路径保留为跳转，避免收藏夹与站外链接 404。
        path: 'resources',
        redirect: { name: 'workbench-requirements' },
      },
      {
        path: 'tickets',
        name: 'workbench-tickets',
        component: () => import('@/views/TicketCenterView.vue'),
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
