/**
 * 开发者工作台路由：团队、消息、工单、通知与权限兜底页（与用户工作台共用页面，靠 `devArea` 归属开发者侧）。
 *
 * 路由表按域拆分（R047）后仍然只有这里新增条目；`path` / `name` / `meta` 与拆分前逐项一致，
 * 汇总顺序见同目录 `workbench.ts`（顺序影响 `getRoutes()` 的产出与匹配优先级，不能重排）。
 */
import type { RouteRecordRaw } from 'vue-router'

export const devWorkbenchSharedRoutes: RouteRecordRaw[] = [
  // 团队服务从用户工作台整体移入开发者工作台：侧边栏模式下路由需带 devArea，否则进页会切回用户菜单
  {
    path: 'developer/teams',
    name: 'workbench-teams',
    component: () => import('@/views/TeamsView.vue'),
    meta: {
      title: '我的团队',
      description: '查看和管理团队',
      devArea: true,
    },
  },
  {
    path: 'developer/teams/:teamId',
    name: 'workbench-team-detail',
    component: () => import('@/views/TeamDetailView.vue'),
    meta: {
      title: '团队详情',
      description: '团队信息、成员管理',
      devArea: true,
    },
  },
  {
    path: 'developer/team-resources',
    name: 'workbench-team-resources',
    component: () => import('@/views/TeamResourcesView.vue'),
    meta: {
      title: '团队资源项目',
      description: '管理团队共享资源项目',
      devArea: true,
    },
  },
  // 消息中心用户端也要用，用户端路由留在用户区；这里是开发者工作台的入口，
  // 带上 devArea 才不会被侧边栏当成用户页面、一点就切回用户工作台。
  {
    path: 'developer/messages',
    name: 'dev-messages',
    component: () => import('@/views/MessagesView.vue'),
    meta: {
      title: '消息中心',
      description: '查看需求会话与沟通记录。',
      devArea: true,
    },
  },
  // 工单中心同理：开发者侧边栏也有这一条，带 devArea 才不会把侧边栏切回用户菜单，
  // 页面自身也据此走开发者体系的读数条与卡片（见 TicketCenterView 的 isDevWorkbench）。
  {
    path: 'developer/tickets',
    name: 'dev-tickets',
    component: () => import('@/views/TicketCenterView.vue'),
    meta: {
      title: '工单中心',
      description: '提交问题与查看客服回复。',
      devArea: true,
    },
  },
  // 系统通知与消息中心、工单中心同一办法：用户工作台与开发者工作台共用同一个页面，
  // 各挂一条路由；开发者这条带 devArea，点进去侧边栏不会切回用户菜单。
  {
    path: 'developer/notifications',
    name: 'dev-notifications',
    component: () => import('@/views/NotificationCenterView.vue'),
    meta: {
      title: '系统通知',
      description: '平台公告、评论警告与待确认事项。',
      devArea: true,
    },
  },
  {
    path: 'developer/realname',
    redirect: { name: 'workbench-realname' },
  },
  {
    path: 'developer/no-access',
    name: 'dev-no-access',
    component: () => import('@/views/DevNoAccessView.vue'),
    meta: {
      title: '开发者权限',
      description: '当前账号还没有开发者访问权限。',
      devArea: true,
    },
  },
]
