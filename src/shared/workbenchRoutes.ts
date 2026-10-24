import { overviewItem, type MenuRouteContext, type WorkbenchMenuItem } from './workbenchMenu'

/**
 * 工作台外壳的路由名、条目高亮判定与标题文案（纯函数）。
 *
 * 消息中心 / 系统通知两种工作台各有一条路由，侧边栏高亮与顶栏标题都从这些判定来。
 * 都是「值 → 值」的映射，与菜单模型（`workbenchMenu.ts`）分开一个文件放，两边都在 300 行预算内。
 */

/* ---------- 路由名：消息中心 / 系统通知两种工作台各一条 ---------- */

// 消息中心在两种工作台各有一条路由（开发者端走 devArea 路由，点进去不会切回用户工作台），
// 页面内的高亮、会话链接与「查看全部消息」都跟着当前所处的那条走。
const MESSAGES_ROUTE_NAMES = ['workbench-messages', 'dev-messages']

export function isMessagesRouteName(name: unknown): boolean {
  return MESSAGES_ROUTE_NAMES.includes(String(name ?? ''))
}

export function messagesRouteNameFor(isDevWorkbenchMode: boolean): string {
  return isDevWorkbenchMode ? 'dev-messages' : 'workbench-messages'
}

// 「系统通知」同理：两端共用同一个页面，各挂一条自己的路由（见 router/dev.ts 的 dev-notifications）。
export function notificationsRouteNameFor(isDevWorkbenchMode: boolean): string {
  return isDevWorkbenchMode ? 'dev-notifications' : 'workbench-notifications'
}

export function workbenchBrandTitleFor(isDevWorkbenchMode: boolean): string {
  return isDevWorkbenchMode ? '开发者工作台' : '我的工作台'
}

/**
 * 消息中心夹在分组之间、两端各只渲染一次，插在哪个位置两种工作台不一样：
 * 用户工作台插在第一个分组之后（我的需求与账户服务之间）；
 * 开发者工作台插在最后一个分组之后（团队服务之下、系统通知之上）。
 * 开发者侧多出「财务中心」一组后，仍按原来那一档排，不落到两组中间。
 */
export function messagesAnchorIndexFor(
  isDevWorkbenchMode: boolean,
  visibleGroupCount: number,
): number {
  return isDevWorkbenchMode ? Math.max(visibleGroupCount - 1, 0) : 0
}

/* ---------- 条目的链接与高亮 ---------- */

export function menuItemTo(item: WorkbenchMenuItem) {
  return {
    name: item.name,
    hash: item.hash ?? '',
  }
}

/** 一级条目上的角标：只有「我的接单」有，计数为 0 时不显示，避免一条空数字挂在菜单上。 */
export function menuItemBadgeText(item: WorkbenchMenuItem, devActiveOrderCount: number): string {
  if (item.name === 'dev-my-requirements' && devActiveOrderCount > 0) {
    return String(devActiveOrderCount)
  }

  return ''
}

export function isMenuItemActive(item: WorkbenchMenuItem, context: MenuRouteContext): boolean {
  const { name: currentName, fromTeamResources } = context
  const isTeamResourceAction =
    fromTeamResources &&
    (currentName === 'dev-resource-versions' || currentName === 'dev-resource-homepage-edit')

  // 从团队资源进入版本管理/编辑主页时，高亮「资源项目」而非「资源项目」
  if (item.name === 'workbench-team-resources' && isTeamResourceAction) {
    return true
  }
  if (item.name === 'dev-resource-list' && isTeamResourceAction) {
    return false
  }

  if (item.activeNames?.includes(currentName)) {
    return true
  }

  if (currentName !== item.name) {
    return false
  }

  return item.hash ? context.hash === item.hash : !context.hash
}

/** 当前页是这条菜单的子页面（售出订单之于资源项目）：标题要显示子页自己的名字。 */
export function isActiveChildPage(item: WorkbenchMenuItem | null, routeName: string): boolean {
  return Boolean(
    item && routeName && item.name !== routeName && item.activeNames?.includes(routeName),
  )
}

export function compactRouteTitle(title: string): string {
  const parts = title.split('/')
  const last = parts.length > 0 ? parts[parts.length - 1]?.trim() : ''
  return last || title
}

/**
 * 移动端顶栏与大标题的那行字：消息中心优先报会话名，子页面用路由标题的后半段，
 * 其余按「命中的条目 → 路由标题 → 工作台总览」的顺序兜底。判定顺序与拆分前一致。
 */
export function resolveWorkbenchTitle(options: {
  isMessagesRoute: boolean
  conversationTitle?: string | null
  activeItem: WorkbenchMenuItem | null
  routeName: string
  routeTitle: string
}): string {
  const { activeItem } = options
  if (options.isMessagesRoute) {
    return options.conversationTitle || '消息中心'
  }

  if (isActiveChildPage(activeItem, options.routeName)) {
    return compactRouteTitle(options.routeTitle) || activeItem?.label || overviewItem.label
  }

  return activeItem?.label ?? options.routeTitle ?? overviewItem.label
}

/* ---------- 会话链接 ---------- */

export function conversationLink(routeName: string, requirementId: string) {
  return {
    name: routeName,
    query: {
      requirement_id: requirementId,
    },
  }
}

/** 会话行的高亮：停在消息中心、且地址栏里的需求号就是这一条。 */
export function isConversationRouteActive(
  requirementId: string,
  activeRequirementId: unknown,
  isMessagesRoute: boolean,
): boolean {
  return isMessagesRoute && activeRequirementId === requirementId
}
