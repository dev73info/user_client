/**
 * `/workbench` 用户工作台的父路由与子条目（含开发者工作台的 `devWorkbenchRoutes`）。
 *
 * 父级 `meta.workbenchShell` 与子条目的 `title` / `description` / `requiresRealname` 原样保留；
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
      workbenchShell: true,
    },
    children: [
      {
        path: '',
        name: 'workbench',
        component: () => import('@/views/UserWorkbenchOverviewView.vue'),
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
        path: 'requirement-hall',
        name: 'workbench-requirement-hall',
        component: () => import('@/views/RequirementHallView.vue'),
        meta: {
          title: '需求大厅',
          description: '浏览需求并进入工作台查看详情',
        },
      },
      {
        path: 'favorites',
        name: 'workbench-favorites',
        component: () => import('@/views/CommunityListView.vue'),
        meta: { title: '我的帖子', description: '查看我发布与收藏的社区帖子' },
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
        meta: { title: '我的积分', description: '签到、积分记录与打赏' },
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
      // 活动中心：列表 → 详情；「我的奖励」单独一条且排在 :code 前，避免被当成活动 code。
      {
        path: 'activities',
        name: 'workbench-activities',
        component: () => import('@/views/ActivityCenterView.vue'),
        meta: { title: '活动中心', description: '浏览活动、报名与查看我的奖励' },
      },
      {
        path: 'activities/rewards',
        name: 'workbench-activity-rewards',
        component: () => import('@/views/MyActivityRewardsView.vue'),
        meta: { title: '我的活动奖励', description: '查看活动奖励与转账单' },
      },
      {
        path: 'activities/:code',
        name: 'workbench-activity-detail',
        component: () => import('@/views/ActivityDetailView.vue'),
        meta: { title: '活动详情', description: '报名、兑换名额与查看奖励' },
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
        // 需求方「我的资源」：只列本人名下、已转为我的资源的定制交付。
        // 复用开发者资源项目那一套列表 / 主页编辑 / 版本管理组件，不要求开发者权限。
        path: 'resources',
        name: 'workbench-resources',
        component: () => import('@/views/MyResourcesView.vue'),
        meta: {
          title: '我的资源',
          description: '管理已转为我的资源的定制交付',
          resourceWorkspace: 'mine',
        },
      },
      {
        path: 'resources/:resourceId(\\d+)/homepage',
        name: 'workbench-resource-homepage-edit',
        component: () => import('@/views/DevResourceHomepageEditView.vue'),
        meta: {
          title: '我的资源 / 编辑资源主页',
          description: '维护资源介绍、展示内容和售卖信息',
          resourceWorkspace: 'mine',
        },
      },
      {
        path: 'resources/:resourceId(\\d+)/versions',
        name: 'workbench-resource-versions',
        component: () => import('@/views/DevResourceVersionsView.vue'),
        meta: {
          title: '我的资源 / 版本管理',
          description: '维护资源版本与文件',
          resourceWorkspace: 'mine',
        },
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
