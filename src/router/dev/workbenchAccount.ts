/**
 * 开发者工作台路由：账号、钱包与发票。
 *
 * 路由表按域拆分（R047）后仍然只有这里新增条目；`path` / `name` / `meta` 与拆分前逐项一致，
 * 汇总顺序见同目录 `workbench.ts`（顺序影响 `getRoutes()` 的产出与匹配优先级，不能重排）。
 */
import type { RouteRecordRaw } from 'vue-router'

export const devWorkbenchAccountRoutes: RouteRecordRaw[] = [
  {
    path: 'developer/overview',
    name: 'dev-overview',
    // 开发概览（DevOverviewView）已废弃：开发者入口统一指向资源初始化。
    redirect: { name: 'dev-plugins' },
    meta: {
      title: '开发概览',
      description: '账户实名、资源、需求和交付入口。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    // 开发者工作台首页：接单收入、保证金、接单与交付概览。
    // 刻意不带 requiresRealname —— 落地页若要求实名，未实名的开发者一进来就被弹去认证，看不到任何概览数据。
    path: 'developer/home',
    name: 'dev-home',
    component: () => import('@/views/DevHomeView.vue'),
    meta: {
      title: '工作台总览',
      description: '接单收入、保证金与交付概览。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    path: 'developer/oauth-clients',
    name: 'dev-oauth-clients',
    component: () => import('@/views/DevOAuthClientsView.vue'),
    meta: {
      title: '接入客户端',
      description: '创建与管理 OAuth 应用，在自己的站点使用 73Info 账号登录',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    path: 'developer/wallet',
    redirect: { name: 'dev-wallet' },
  },
  {
    path: 'developer/wallet/order-deposit',
    redirect: { name: 'dev-wallet' },
  },
  {
    path: 'developer/wallet/overview',
    name: 'dev-wallet',
    component: () => import('@/views/DevWalletView.vue'),
    meta: {
      title: '钱包 / 我的余额',
      description: '查看开发者余额、保证金和结算信息。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    // 「交付记录」已并进「我的接单」：路径与名称都留着，老书签落到合并后的那一页。
    path: 'developer/wallet/releases',
    name: 'dev-wallet-releases',
    redirect: { name: 'dev-my-requirements' },
    meta: {
      title: '钱包 / 交付记录',
      description: '已并入「我的接单」，这条路径只作为老链接的入口。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  {
    path: 'developer/wallet/withdrawals',
    name: 'dev-wallet-withdrawals',
    redirect: { name: 'dev-wallet' },
    meta: {
      title: '钱包 / 提现记录',
      description: '查看开发者提现申请和处理状态。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
  // 发票页同样是「两端共用一页」：用户端的入口留在用户区（账户服务 → 我的发票），
  // 这里是开发者工作台财务中心里的入口，带 devArea 才不会把侧边栏切回用户菜单。
  // 页面还据此决定这一侧的职责：开发者工作台是我作为乙方要开的票（可上传），用户端只能查看与下载
  // （见 InvoiceCenterView 的 perspective 与 shared/invoiceAction.ts）。
  {
    path: 'developer/invoices',
    name: 'dev-invoices',
    component: () => import('@/views/InvoiceCenterView.vue'),
    meta: {
      title: '我的发票',
      description: '查看与上传开发者发票。',
      devArea: true,
      requiresDevAccess: true,
    },
  },
]
