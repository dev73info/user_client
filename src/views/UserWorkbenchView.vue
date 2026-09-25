<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Box, ChatDotRound, Close, Compass, Connection, DataAnalysis, Files, Grid, Menu as MenuIcon, Promotion, Service, Switch as SwitchIcon, Tickets, UserFilled, Wallet } from '@element-plus/icons-vue'

import { listRequirementConversations, type RequirementConversation } from '@/api/conversations'
import { listMyRequirements } from '@/api/devRequirements'
import { listUserInvitations } from '@/api/team'
import { getMyRealnameVerification } from '@/api/realname'
import { isActiveRequirement } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

type WorkbenchRouteName = string

type WorkbenchMenuItem = {
  label: string
  name: WorkbenchRouteName
  hash?: string
  description: string
  activeNames?: WorkbenchRouteName[]
}

type WorkbenchMenuGroup = {
  key: string
  label: string
  icon: Component
  items: WorkbenchMenuItem[]
}

/** 开发者菜单的一级条目：与用户菜单的一级条目同版式，每条带一个图标。 */
type DevWorkbenchItem = WorkbenchMenuItem & { icon: Component }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const conversations = ref<RequirementConversation[]>([])
const conversationLoading = ref(false)
const teamInvitationCount = ref(0)
/** 「我的接单」角标：在途接单数，与总览页「进行中项目」同一口径。 */
const devActiveOrderCount = ref(0)
const mobileMenuOpen = ref(false)
const touchStartX = ref(0)
const touchStartY = ref(0)
const touchTracking = ref(false)
const realnameApproved = ref(false)

const MOBILE_MENU_BREAKPOINT_PX = 900
const MOBILE_SWIPE_EDGE_PX = 44
const MOBILE_SWIPE_THRESHOLD_PX = 72
const MOBILE_SWIPE_VERTICAL_LIMIT_PX = 56

const overviewItem: WorkbenchMenuItem = {
  label: '工作台总览',
  name: 'workbench',
  description: '账户、需求与优惠券概览',
}

const ticketsItem: WorkbenchMenuItem = {
  label: '工单中心',
  name: 'workbench-tickets',
  description: '提交问题与查看回复',
}

// 开发者工作台菜单：侧边栏切到开发者模式时展示（此前是底部「开发者工作台」折叠组的内容）。
// 版式与用户菜单的一级条目一致（图标 + 加粗标题），切换模式时侧边栏只有文字在变。
// 一级条目不再分小标题，按开发者每天的动线从上往下排：总览 → 资源 → 接单 → 交付；
// 与钱有关的两条（收益钱包、我的发票）收进下面的「财务中心」折叠组，
// 团队服务那一段也不顶小标题，靠折叠组的分组头自己报名字。
const devWorkbenchItems: DevWorkbenchItem[] = [
  {
    label: '工作台总览',
    name: 'dev-home',
    description: '接单收入、保证金与交付概览',
    icon: DataAnalysis,
  },
  {
    label: '资源项目',
    name: 'dev-resource-list',
    description: '管理主页、版本与资源状态',
    activeNames: ['dev-resource-homepage-edit', 'dev-resource-versions'],
    icon: Files,
  },
  { label: '需求大厅', name: 'dev-requirement-hall', description: '浏览并关联可接需求', icon: Compass },
  { label: '我的接单', name: 'dev-my-requirements', description: '查看已关联需求和会话', icon: Tickets },
  { label: '交付记录', name: 'dev-wallet-releases', description: '查看资源交付与收入', icon: Promotion },
]

// 财务中心：只跟钱有关的两条收成一组的折叠组。收益钱包原先是开发者菜单的一级条目，
// 发票页原挂在用户模式的「账户服务」下——同一件钱的事被分在了两处，这里合并成一组。
// 开发者模式下渲染，用户模式看不到；用户模式的账户服务里仍保留「我的发票」那一条。
const financeMenuGroup: WorkbenchMenuGroup = {
  key: 'finance',
  label: '财务中心',
  icon: Wallet,
  items: [
    { label: '收益钱包', name: 'dev-wallet', description: '查看余额与保证金信息' },
    { label: '我的发票', name: 'dev-invoices', description: '查看与上传开发者发票' },
  ],
}

// 团队服务已整体移入开发者工作台：用户模式下不出现，开发者模式下按原来的折叠组版式展示。
// 组内条目叫「团队资源」：开发者侧边栏另有一条自己的「资源项目」，重名会让两条菜单分不清。
const teamMenuGroup: WorkbenchMenuGroup = {
  key: 'team',
  label: '团队服务',
  icon: UserFilled,
  items: [
    { label: '我的团队', name: 'workbench-teams', description: '查看和管理团队' },
    { label: '团队资源', name: 'workbench-team-resources', description: '管理团队共享资源项目' },
  ],
}

// 分组头已经写着组名，因此这几类分组不再额外顶一行灰色小标题：
// 账户服务、团队服务、财务中心都靠分组头识别，再加一行会把组名写成两遍。
const GROUPS_WITHOUT_SECTION_LABEL = ['account', 'team', 'finance']

const menuGroups = computed<WorkbenchMenuGroup[]>(() => [
  {
    // 只剩一个页面：侧边栏按一级条目渲染成「需求协作」，
    // 条目的 label 仍用于工作台顶部标题（进的是「我的需求」这一页）。
    key: 'collaboration',
    label: '需求协作',
    icon: Connection,
    items: [
      { label: '我的需求', name: 'workbench-requirements', description: '查看支付、交付与验收进度' },
    ],
  },
  {
    key: 'account',
    label: '账户服务',
    icon: Box,
    items: [
      { label: '账户详情', name: 'workbench-account', description: '管理账户' },
      ...(realnameApproved.value ? [{ label: '我的合同', name: 'workbench-signatures', description: '查看合同与签署进度', activeNames: ['workbench-signature-detail'] }] : []),
        { label: '我的发票', name: 'workbench-invoices', description: '获取发票、查看与下载' },
      { label: '我的背包', name: 'workbench-points', description: '查看积分余额与明细' },
      { label: '我的收藏', name: 'workbench-favorites', description: '查看收藏的社区帖子' },
      {
        label: '我的邀请',
        name: 'workbench-invite',
        description: '邀请好友得徽章，查看排行榜',
        activeNames: ['workbench-invite-leaderboard'],
      },
    ],
  },
])

const openGroupKeys = ref<string[]>([])
const sortedConversations = computed(() =>
  [...conversations.value].sort((left, right) =>
    parseConversationTime(right.last_message_at ?? right.updated_at ?? right.created_at)
    - parseConversationTime(left.last_message_at ?? left.updated_at ?? left.created_at),
  ),
)
const visibleConversations = computed(() => sortedConversations.value.slice(0, 3))
const hiddenConversationCount = computed(() => Math.max(sortedConversations.value.length - visibleConversations.value.length, 0))

/**
 * 消息中心角标：最后一条不是我发的、且会话仍然打开的，就是要我回复的。
 * 后端没有「未读」字段，所以这里表达的是「待我回复」，不是「未读消息数」。
 */
const messagesAwaitingReplyCount = computed(
  () =>
    conversations.value.filter(
      (item) => item.status === 'open' && Boolean(item.last_message_by) && item.last_message_by !== auth.username,
    ).length,
)

const activeConversation = computed(() => {
  const requirementId = route.query.requirement_id
  if (typeof requirementId !== 'string') {
    return null
  }

  return conversations.value.find((item) => item.requirement_id === requirementId) ?? null
})

const currentTitle = computed(() => {
  if (isMessagesRoute.value) {
    return activeConversation.value?.requirement_title || '消息中心'
  }

  const active = findActiveItem()
  if (isActiveChildPage(active)) {
    return compactRouteTitle.value || active?.label || overviewItem.label
  }

  return active?.label ?? routeTitle.value ?? overviewItem.label
})

const routeTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''))
const compactRouteTitle = computed(() => {
  const parts = routeTitle.value.split('/')
  const last = parts.length > 0 ? parts[parts.length - 1]?.trim() : ''
  return last || routeTitle.value
})
const isWorkbenchOverview = computed(() =>
  route.name === overviewItem.name || route.matched.some((record) => record.name === overviewItem.name),
)
const isMessageDetailPage = computed(() => {
  const requirementId = route.query.requirement_id
  return isMessagesRoute.value && typeof requirementId === 'string' && requirementId.trim().length > 0
})
// 外壳不再给每个页面铺一条「标题 + 返回」：页面名由各页自己出示（页头或页内卡片标题），
// 认路靠侧边栏。移动端顶部栏只留一颗「返回」，落地页与页内自带返回的页面不给。
const showWorkbenchMobileBack = computed(
  () => !isWorkbenchOverview.value
    && !isMessageDetailPage.value
    && route.name !== 'dev-home'
    && route.name !== 'dev-resource-homepage-edit'
    && route.name !== 'dev-requirement-detail',
)

// 工作台模式跟随路由：命中 devArea 路由时侧边栏整体换成开发者菜单，回到用户端页面即自动切回。
const isDevWorkbenchMode = computed(
  () => route.matched.some((record) => Boolean(record.meta.devArea)),
)

// 全部菜单分组：财务中心与团队服务只在开发者模式下渲染，但两种模式都要能解析当前页归属的条目。
const allMenuGroups = computed<WorkbenchMenuGroup[]>(() => [...menuGroups.value, financeMenuGroup, teamMenuGroup])

// 开发者模式下侧边栏不渲染用户菜单分组，只保留财务中心与团队服务。
const visibleMenuGroups = computed(() =>
  isDevWorkbenchMode.value ? [financeMenuGroup, teamMenuGroup] : menuGroups.value,
)

// 消息中心在两种工作台各有一条路由（开发者端走 devArea 路由，点进去不会切回用户工作台），
// 页面内的高亮、会话链接与「查看全部消息」都跟着当前所处的那条走。
const MESSAGES_ROUTE_NAMES = ['workbench-messages', 'dev-messages']
function isMessagesRouteName(name: unknown) {
  return MESSAGES_ROUTE_NAMES.includes(String(name ?? ''))
}
const isMessagesRoute = computed(() => isMessagesRouteName(route.name))
const messagesRouteName = computed(() => (isDevWorkbenchMode.value ? 'dev-messages' : 'workbench-messages'))

/**
 * 消息中心夹在分组之间、两端各只渲染一次，插在哪个位置两种工作台不一样：
 * 用户工作台插在第一个分组之后（需求协作与账户服务之间）；
 * 开发者工作台插在最后一个分组之后（团队服务之下、工单中心之上）。
 * 开发者侧多出「财务中心」一组后，仍按原来那一档排，不落到两组中间。
 */
const messagesAnchorIndex = computed(() =>
  isDevWorkbenchMode.value ? Math.max(visibleMenuGroups.value.length - 1, 0) : 0,
)

// 工单中心与消息中心同一套办法：两种工作台各有一条路由，开发者端那条带 devArea，
// 侧边栏的高亮与链接都跟着当前模式走，点进去不会把菜单切回用户工作台。
const ticketsRouteName = computed(() => (isDevWorkbenchMode.value ? 'dev-tickets' : 'workbench-tickets'))
const ticketsMenuItem = computed<WorkbenchMenuItem>(() => ({ ...ticketsItem, name: ticketsRouteName.value }))

watch(
  [() => auth.token, () => route.fullPath],
  async ([token], [previousToken], onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true })
    if (token !== previousToken) realnameApproved.value = false
    if (!token) return
    try {
      const verification = await getMyRealnameVerification(auth.token)
      if (!cancelled) realnameApproved.value = verification.status === 'approved'
    } catch {
      if (!cancelled) realnameApproved.value = false
    }
  },
  { immediate: true },
)

watch(
  [() => route.fullPath, menuGroups],
  () => {
    const activeGroup = allMenuGroups.value.find((group) => group.items.some((item) => isMenuItemActive(item)))
    if (activeGroup && !openGroupKeys.value.includes(activeGroup.key)) {
      openGroupKeys.value = [...openGroupKeys.value, activeGroup.key]
    }
    if (isMessagesRoute.value && !openGroupKeys.value.includes('messages')) {
      openGroupKeys.value = [...openGroupKeys.value, 'messages']
    }
    mobileMenuOpen.value = false
    void scrollToHash()
  },
  { immediate: true },
)

watch(
  () => auth.token,
  () => {
    void loadConversations()
    void loadTeamInvitations()
  },
  { immediate: true },
)

// 「我的接单」角标只在开发者模式拉取：用户模式下这个接口会 403，没必要发。
watch(
  [() => auth.token, () => isDevWorkbenchMode.value],
  ([token, devMode]) => {
    if (!token || !devMode) {
      devActiveOrderCount.value = 0
      return
    }

    void loadDevActiveOrders()
  },
  { immediate: true },
)

watch(
  () => route.name,
  (name) => {
    if (isMessagesRouteName(name)) {
      void loadConversations(true)
    }
  },
)

function menuItemTo(item: WorkbenchMenuItem) {
  return {
    name: item.name,
    hash: item.hash ?? '',
  }
}

/** 一级条目上的角标：只有「我的接单」有，计数为 0 时不显示，避免一条空数字挂在菜单上。 */
function menuItemBadge(item: WorkbenchMenuItem) {
  if (item.name === 'dev-my-requirements' && devActiveOrderCount.value > 0) {
    return String(devActiveOrderCount.value)
  }

  return ''
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'home' })
  }
}

// 切换工作台：用户模式进开发者工作台总览，开发者模式回到用户工作台总览。
function switchWorkbenchMode() {
  mobileMenuOpen.value = false
  void router.push(isDevWorkbenchMode.value ? { name: overviewItem.name } : { name: 'dev-home' })
}

function conversationTo(item: RequirementConversation) {
  return {
    name: messagesRouteName.value,
    query: {
      requirement_id: item.requirement_id,
    },
  }
}

function isOverviewActive() {
  return route.name === overviewItem.name && !route.hash
}

function isMessageMenuActive() {
  return isMessagesRoute.value
}

function isMessageMenuOpen() {
  return openGroupKeys.value.includes('messages')
}

function openMessageCenter() {
  if (!isMessageMenuOpen()) {
    openGroupKeys.value = [...openGroupKeys.value, 'messages']
  }

  mobileMenuOpen.value = false
  void router.push({ name: messagesRouteName.value })
}

function toggleMessageCenter() {
  if (isMessageMenuOpen()) {
    openGroupKeys.value = openGroupKeys.value.filter((key) => key !== 'messages')
    mobileMenuOpen.value = false
    return
  }

  openMessageCenter()
}

function isConversationActive(item: RequirementConversation) {
  return isMessagesRoute.value && route.query.requirement_id === item.requirement_id
}

function isMenuItemActive(item: WorkbenchMenuItem) {
  const currentName = String(route.name ?? '')
  const isTeamResourceAction =
    route.query.from === 'team-resources' &&
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

  return item.hash ? route.hash === item.hash : !route.hash
}

function isGroupActive(group: WorkbenchMenuGroup) {
  return group.items.some((item) => isMenuItemActive(item))
}

function isGroupOpen(group: WorkbenchMenuGroup) {
  return openGroupKeys.value.includes(group.key)
}

function toggleGroup(group: WorkbenchMenuGroup) {
  if (isGroupOpen(group)) {
    openGroupKeys.value = openGroupKeys.value.filter((key) => key !== group.key)
    return
  }

  openGroupKeys.value = [...openGroupKeys.value, group.key]
}

function openMobileMenu() {
  mobileMenuOpen.value = true
}

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

function isMobileWorkbenchViewport() {
  return typeof window !== 'undefined' && window.matchMedia(`(max-width: ${MOBILE_MENU_BREAKPOINT_PX}px)`).matches
}

function handleWorkbenchTouchStart(event: TouchEvent) {
  if (!isMobileWorkbenchViewport()) {
    touchTracking.value = false
    return
  }

  const touch = event.touches[0]
  if (!touch) {
    touchTracking.value = false
    return
  }

  const canStartGesture = mobileMenuOpen.value || touch.clientX <= MOBILE_SWIPE_EDGE_PX
  touchTracking.value = canStartGesture
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
}

function handleWorkbenchTouchEnd(event: TouchEvent) {
  if (!touchTracking.value) {
    return
  }

  touchTracking.value = false
  const touch = event.changedTouches[0]
  if (!touch) {
    return
  }

  const deltaX = touch.clientX - touchStartX.value
  const deltaY = touch.clientY - touchStartY.value
  if (Math.abs(deltaY) > MOBILE_SWIPE_VERTICAL_LIMIT_PX) {
    return
  }

  if (!mobileMenuOpen.value && deltaX >= MOBILE_SWIPE_THRESHOLD_PX) {
    openMobileMenu()
    return
  }

  if (mobileMenuOpen.value && deltaX <= -MOBILE_SWIPE_THRESHOLD_PX) {
    closeMobileMenu()
  }
}

function findActiveItem() {
  if (isOverviewActive()) {
    return overviewItem
  }

  if (isMessagesRoute.value) {
    return null
  }

  return [...allMenuGroups.value.flatMap((group) => group.items), ticketsMenuItem.value]
    .find((item) => isMenuItemActive(item)) ?? null
}

function isActiveChildPage(item: WorkbenchMenuItem | null) {
  return Boolean(item && route.name && item.name !== route.name && item.activeNames?.includes(String(route.name)))
}

async function loadTeamInvitations() {
  if (!auth.token.trim()) {
    teamInvitationCount.value = 0
    return
  }
  try {
    const invitations = await listUserInvitations(auth.token)
    teamInvitationCount.value = invitations.filter((inv) => inv.status === 'pending').length
  } catch {
    teamInvitationCount.value = 0
  }
}

/** 侧边栏角标只做提示，拿不到数据就当没有，不弹提示打断页面。 */
async function loadDevActiveOrders() {
  if (!auth.token.trim()) {
    devActiveOrderCount.value = 0
    return
  }

  try {
    const items = await listMyRequirements(auth.token)
    devActiveOrderCount.value = items.filter((item) => isActiveRequirement(item.status)).length
  } catch {
    devActiveOrderCount.value = 0
  }
}

async function loadConversations(silent = false) {
  auth.hydrate()
  if (!auth.token.trim()) {
    conversations.value = []
    return
  }

  conversationLoading.value = true
  try {
    conversations.value = await listRequirementConversations(auth.token)
  } catch (error) {
    conversations.value = []
    if (!silent) {
      showToast(error instanceof Error ? error.message : '加载会话菜单失败', 'error')
    }
  } finally {
    conversationLoading.value = false
  }
}

function parseConversationTime(value?: string | null) {
  if (!value) {
    return 0
  }
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function partnerLabel(item: RequirementConversation) {
  if (auth.username === item.customer) {
    return `开发者：${item.developer}`
  }
  if (auth.username === item.developer) {
    return `用户：${item.customer}`
  }
  return `${item.customer} / ${item.developer}`
}

function conversationMeta(item: RequirementConversation) {
  if (!item.last_message_at) {
    return '暂无消息'
  }

  return `最近 ${formatConversationTime(item.last_message_at)}`
}

function formatConversationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }

  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function scrollToHash() {
  if (!route.hash) {
    return
  }

  await nextTick()
  const target = document.getElementById(route.hash.slice(1))
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <main class="user-workbench" :class="{
    'user-workbench--dev': isDevWorkbenchMode,
    'user-workbench--messages': isMessagesRoute,
    'user-workbench--mobile-menu-open': mobileMenuOpen,
  }" @touchstart.passive="handleWorkbenchTouchStart" @touchend.passive="handleWorkbenchTouchEnd"
    @touchcancel.passive="touchTracking = false">
    <button v-if="mobileMenuOpen" class="user-workbench__menu-backdrop" type="button" aria-label="关闭工作台菜单"
      @click="closeMobileMenu" />

    <aside class="user-workbench__aside" aria-label="统一工作台菜单">
      <el-scrollbar class="app-scrollbar user-workbench__aside-scrollbar" max-height="calc(100vh - var(--portal-header-footprint, 98px) - 22px)">
        <div class="user-workbench__aside-inner">
          <div class="user-workbench__brand">
            <!-- 开发者模式在标题前挂一个工作台字标；用户模式不挂，标题仍是纯文字 -->
            <span v-if="isDevWorkbenchMode" class="user-workbench__brand-mark" aria-hidden="true">
              <el-icon>
                <Grid />
              </el-icon>
            </span>
            <!-- 侧边栏标题用普通标题样式（原版是有浅蓝底的药丸标签），模式切换按钮靠右 -->
            <strong class="user-workbench__brand-title">{{ isDevWorkbenchMode ? '开发者工作台' : '工作台' }}</strong>
            <!-- 开发者模式下标题有六个字，按钮缩成图标，否则标题会被挤成「开发者…」 -->
            <button class="user-workbench__mode-switch" type="button"
              :class="{ 'user-workbench__mode-switch--icon': isDevWorkbenchMode }"
              :title="isDevWorkbenchMode ? '回到用户工作台' : '进入开发者工作台'"
              :aria-label="isDevWorkbenchMode ? '回到用户工作台' : '进入开发者工作台'" @click="switchWorkbenchMode">
              <el-icon>
                <SwitchIcon />
              </el-icon>
              <span v-if="!isDevWorkbenchMode">切换工作台</span>
            </button>
            <button class="user-workbench__drawer-close" type="button" aria-label="关闭工作台菜单" @click="closeMobileMenu">
              <el-icon>
                <Close />
              </el-icon>
            </button>
          </div>

          <nav class="user-workbench__menu">
            <template v-if="isDevWorkbenchMode">
              <!-- 开发者菜单不分小标题，一级条目直接平铺；角标给「我的接单」 -->
              <RouterLink v-for="item in devWorkbenchItems" :key="item.name"
                class="user-workbench__menu-link user-workbench__menu-link--root"
                :class="{
                  active: isMenuItemActive(item),
                  'user-workbench__menu-link--badged': Boolean(menuItemBadge(item)),
                }" :to="menuItemTo(item)" @click="closeMobileMenu">
                <span class="user-workbench__menu-icon">
                  <el-icon>
                    <component :is="item.icon" />
                  </el-icon>
                </span>
                <span>
                  <strong>{{ item.label }}</strong>
                </span>
                <span v-if="menuItemBadge(item)" class="user-workbench__menu-badge">{{ menuItemBadge(item) }}</span>
              </RouterLink>
            </template>

            <!-- 开发者模式下整块换成开发者菜单，用户菜单不出现在侧边栏 -->
            <p v-if="!isDevWorkbenchMode" class="user-workbench__menu-section">我的事项</p>
            <RouterLink v-if="!isDevWorkbenchMode" class="user-workbench__menu-link user-workbench__menu-link--root"
              :class="{ active: isOverviewActive() }" :to="menuItemTo(overviewItem)" @click="closeMobileMenu">
              <span class="user-workbench__menu-icon">
                <el-icon>
                  <DataAnalysis />
                </el-icon>
              </span>
              <span>
                <strong>{{ overviewItem.label }}</strong>
              </span>
            </RouterLink>

            <template v-for="(group, index) in visibleMenuGroups" :key="group.key">
              <!-- 只剩一个页面的分组（如「需求协作」）直接渲染成一级条目，省掉一层没意义的展开 -->
              <section v-if="group.items.length === 1" class="user-workbench__menu-group">
                <RouterLink v-for="item in group.items" :key="item.name"
                  class="user-workbench__menu-link user-workbench__menu-link--root"
                  :class="{ active: isMenuItemActive(item) }" :to="menuItemTo(item)" @click="closeMobileMenu">
                  <span class="user-workbench__menu-icon">
                    <el-icon>
                      <component :is="group.icon" />
                    </el-icon>
                  </span>
                  <span>
                    <strong>{{ group.label }}</strong>
                  </span>
                </RouterLink>
              </section>

              <section v-else class="user-workbench__menu-group"
                :class="{ active: isGroupActive(group), open: isGroupOpen(group) }">
                <!-- 账户服务与团队服务不另起小标题：两者都靠分组头自己识别，
                     再加一行会把组名写成两遍 -->
                <p v-if="!GROUPS_WITHOUT_SECTION_LABEL.includes(group.key)" class="user-workbench__menu-section">
                  {{ group.label }}
                </p>
                <button class="user-workbench__menu-group-head" type="button" :aria-expanded="isGroupOpen(group)"
                  @click="toggleGroup(group)">
                  <span class="user-workbench__menu-icon">
                    <el-icon>
                      <component :is="group.icon" />
                    </el-icon>
                  </span>
                  <strong>{{ group.label }}</strong>
                  <el-icon class="user-workbench__menu-arrow">
                    <ArrowDown />
                  </el-icon>
                </button>

                <Transition name="workbench-submenu">
                  <div v-show="isGroupOpen(group)" class="user-workbench__submenu">
                    <RouterLink v-for="item in group.items" :key="`${item.name}-${item.hash ?? ''}`"
                      class="user-workbench__submenu-link" :class="{ active: isMenuItemActive(item) }"
                      :to="menuItemTo(item)" @click="closeMobileMenu">
                      <span>{{ item.label }}</span>
                      <span v-if="item.name === 'workbench-teams' && teamInvitationCount > 0"
                        class="user-workbench__submenu-badge">{{ teamInvitationCount }}</span>
                    </RouterLink>
                  </div>
                </Transition>
              </section>

              <!-- 消息中心已从「需求协作」里提出来做一级条目（原来嵌在需求协作的子菜单里），两种工作台各一份 -->
              <section v-if="index === messagesAnchorIndex" class="user-workbench__menu-group"
                :class="{ active: isMessageMenuActive(), open: isMessageMenuOpen() }">
                <button class="user-workbench__menu-group-head" type="button" :aria-expanded="isMessageMenuOpen()"
                  @click="toggleMessageCenter">
                  <span class="user-workbench__menu-icon">
                    <el-icon>
                      <ChatDotRound />
                    </el-icon>
                  </span>
                  <span class="user-workbench__menu-label">
                    <strong>消息中心</strong>
                    <span v-if="messagesAwaitingReplyCount > 0" class="user-workbench__menu-badge"
                      title="待我回复的会话">{{ messagesAwaitingReplyCount }}</span>
                  </span>
                  <el-icon class="user-workbench__menu-arrow">
                    <ArrowDown />
                  </el-icon>
                </button>

                <Transition name="workbench-submenu">
                  <div v-show="isMessageMenuOpen()" class="user-workbench__submenu user-workbench__submenu--messages">
                    <RouterLink v-for="item in visibleConversations" :key="item.conversation_id"
                      class="user-workbench__submenu-link user-workbench__conversation-link"
                      :class="{ active: isConversationActive(item) }" :to="conversationTo(item)" @click="closeMobileMenu">
                      <span>{{ item.requirement_title || item.requirement_id }}</span>
                      <small>{{ partnerLabel(item) }} · {{ conversationMeta(item) }}</small>
                    </RouterLink>
                    <button v-if="hiddenConversationCount > 0" class="user-workbench__submenu-more" type="button"
                      @click="openMessageCenter">
                      查看全部消息
                    </button>
                    <span v-if="!conversationLoading && sortedConversations.length === 0"
                      class="user-workbench__submenu-empty">暂无会话</span>
                    <span v-else-if="conversationLoading" class="user-workbench__submenu-empty">同步会话中</span>
                  </div>
                </Transition>
              </section>
            </template>

            <section
              class="user-workbench__menu-group user-workbench__menu-group--standalone">
              <RouterLink class="user-workbench__menu-link user-workbench__menu-link--root"
                :class="{ active: isMenuItemActive(ticketsMenuItem) }" :to="menuItemTo(ticketsMenuItem)"
                @click="closeMobileMenu">
                <span class="user-workbench__menu-icon">
                  <el-icon>
                    <Service />
                  </el-icon>
                </span>
                <span>
                  <strong>{{ ticketsItem.label }}</strong>
                </span>
              </RouterLink>
            </section>
          </nav>

        </div>
      </el-scrollbar>
    </aside>

    <section class="user-workbench__main">
      <div class="user-workbench__mobile-bar">
        <button class="user-workbench__mobile-menu-btn" type="button" aria-label="打开工作台菜单" @click="openMobileMenu">
          <el-icon>
            <MenuIcon />
          </el-icon>
          <span>菜单</span>
        </button>
        <div>
          <strong>{{ isDevWorkbenchMode ? '开发者工作台' : '工作台' }}</strong>
          <span>{{ currentTitle }}</span>
        </div>
        <!-- 外壳不再铺页面标题栏，返回只在移动端顶部栏里给一颗（落地页与页内自带返回的页面不给） -->
        <button v-if="showWorkbenchMobileBack" class="user-workbench__mobile-back" type="button" @click="goBack">
          返回
        </button>
      </div>

      <div class="user-workbench__content">
        <RouterView />
      </div>
    </section>
  </main>
</template>

<style scoped>
.user-workbench {
  width: min(1280px, calc(100% - 24px));
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, 252px) minmax(0, 1fr);
  gap: 14px;
  margin: 12px auto 0;
}

.user-workbench__aside {
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

.user-workbench__aside {
  position: sticky;
  /* 顶栏占位高度由顶栏自己公布（--portal-header-footprint，随断点变化）：
     侧边栏按它做 sticky 偏移与高度，长短页面之间才会停在同一个位置，不再上下跳。 */
  top: var(--portal-header-footprint, 98px);
  align-self: start;
  height: calc(100vh - var(--portal-header-footprint, 98px) - 22px);
  overflow: hidden;
  padding: 0;
  border-radius: 22px;
}

/* 侧边栏内层用纵向 flex，菜单组之间保持固定间距。
   不要改用 flex-grow 撑菜单——菜单是 grid，多出来的高度会把条目间距拉开。 */
.user-workbench__aside-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  padding: 16px;
}

.user-workbench__aside-scrollbar :deep(.el-scrollbar__bar) {
  display: none;
}

.user-workbench__aside-scrollbar :deep(.el-scrollbar__wrap) {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.user-workbench__aside-scrollbar :deep(.el-scrollbar__wrap::-webkit-scrollbar) {
  display: none;
  width: 0;
  height: 0;
}

.user-workbench__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 左右不再留内边距：右边缘与下方菜单项对齐 */
  padding: 4px 0 10px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

/* 开发者菜单的品牌字标：小方块 + 图标，与标题同排；用户模式不挂 */
.user-workbench__brand-mark {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: rgba(219, 234, 254, 0.9);
  color: #1d4ed8;
  font-size: 14px;
}

/* 品牌行标题：普通标题样式，空间不足时省略号截断 */
.user-workbench__brand-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: #0f172a;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-workbench__brand span {
  color: #4f8cff;
  font-size: 12px;
  font-weight: 800;
}

.user-workbench__brand em {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 26px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.94);
  color: #1d4ed8;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.user-workbench__drawer-close,
.user-workbench__mobile-bar,
.user-workbench__menu-backdrop {
  display: none;
}

.user-workbench__drawer-close,
.user-workbench__mobile-menu-btn,
.user-workbench__mobile-back,
.user-workbench__menu-backdrop {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.user-workbench__menu,
.user-workbench__menu-group,
.user-workbench__submenu {
  display: grid;
  gap: 6px;
}

.user-workbench__menu-section {
  margin: 10px 4px 2px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.user-workbench__menu-link,
.user-workbench__menu-group-head,
.user-workbench__submenu-link {
  width: 100%;
  border: 0;
  color: #334155;
  text-decoration: none;
  text-align: left;
  font: inherit;
}

.user-workbench__menu-link,
.user-workbench__menu-group-head {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 10px;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
  transition:
    background 180ms ease,
    box-shadow 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.user-workbench__menu-link::before,
.user-workbench__menu-group-head::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 999px;
  background: #2563eb;
  opacity: 0;
  transform: scaleY(0.45);
  transform-origin: center;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.user-workbench__menu-link--root {
  grid-template-columns: auto minmax(0, 1fr);
}

/* 带角标的一级条目多占一列：图标 / 标题 / 角标 */
.user-workbench__menu-link--root.user-workbench__menu-link--badged {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

/* 菜单角标：一级条目与折叠组头共用，口径与子菜单角标一致（红底白字） */
.user-workbench__menu-badge {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}

/* 折叠组头里的标题 + 角标：同排，标题被挤时先截断 */
.user-workbench__menu-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.user-workbench__menu-link:hover,
.user-workbench__menu-group-head:hover,
.user-workbench__menu-link.active,
.user-workbench__menu-group.active>.user-workbench__menu-group-head {
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
  box-shadow: inset 0 0 0 1px rgba(191, 219, 254, 0.52);
}

.user-workbench__menu-link:hover,
.user-workbench__menu-group-head:hover {
  transform: translateX(2px);
}

.user-workbench__menu-link.active::before,
.user-workbench__menu-group.active>.user-workbench__menu-group-head::before {
  opacity: 1;
  transform: scaleY(1);
}

.user-workbench__menu-icon {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 11px;
  background: rgba(219, 234, 254, 0.82);
  color: #2563eb;
  transition:
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.user-workbench__menu-link:hover .user-workbench__menu-icon,
.user-workbench__menu-group-head:hover .user-workbench__menu-icon,
.user-workbench__menu-link.active .user-workbench__menu-icon,
.user-workbench__menu-group.active>.user-workbench__menu-group-head .user-workbench__menu-icon {
  background: rgba(37, 99, 235, 0.14);
  color: #1d4ed8;
  transform: scale(1.04);
}

.user-workbench__menu-link strong,
.user-workbench__menu-group-head strong {
  display: block;
  font-size: 14px;
  line-height: 1.25;
}

.user-workbench__menu-link small,
.user-workbench__submenu-link small {
  display: block;
  margin-top: 3px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}

.user-workbench__menu-arrow {
  color: #94a3b8;
  transition:
    color 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.user-workbench__menu-group-head:hover .user-workbench__menu-arrow,
.user-workbench__menu-group.active>.user-workbench__menu-group-head .user-workbench__menu-arrow {
  color: #2563eb;
}

.user-workbench__menu-group.open .user-workbench__menu-arrow {
  transform: rotate(180deg);
}

.user-workbench__submenu {
  --workbench-submenu-max: 420px;
  margin-left: 38px;
  padding-left: 10px;
  border-left: 1px solid rgba(209, 220, 243, 0.95);
}

/* 工作台模式切换：用户菜单与开发者菜单之间来回切，在品牌行里靠右 */
.user-workbench__mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  margin-left: auto;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(191, 219, 254, 0.9);
  border-radius: 999px;
  background: rgba(239, 246, 255, 0.6);
  color: #1d4ed8;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.user-workbench__mode-switch:hover,
.user-workbench__mode-switch:focus-visible {
  border-color: rgba(147, 197, 253, 0.95);
  background: rgba(219, 234, 254, 0.95);
}

/* 开发者模式：按钮只留图标（两个类名是为了盖住 900px 断点里那条 padding 覆盖） */
.user-workbench__mode-switch.user-workbench__mode-switch--icon {
  width: 28px;
  min-width: 28px;
  padding: 0;
  justify-content: center;
}

.user-workbench__menu-group--standalone {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid rgba(209, 220, 243, 0.95);
}

.user-workbench__submenu-link {
  position: relative;
  display: grid;
  gap: 2px;
  min-height: 38px;
  padding: 8px 10px;
  border-radius: 12px;
  align-content: center;
  transition:
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.user-workbench__submenu-link:hover {
  transform: translateX(2px);
}

.user-workbench__submenu-link:hover,
.user-workbench__submenu-link.active {
  background: rgba(248, 251, 255, 0.96);
  color: #1d4ed8;
}

.user-workbench__submenu-link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 800;
}

.user-workbench__submenu-link span.user-workbench__submenu-badge {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  white-space: nowrap;
}

.user-workbench__submenu:not(.user-workbench__submenu--messages) .user-workbench__submenu-link small {
  max-height: 0;
  margin-top: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 180ms ease,
    margin-top 180ms ease,
    opacity 160ms ease;
}

.user-workbench__submenu:not(.user-workbench__submenu--messages) .user-workbench__submenu-link:hover small,
.user-workbench__submenu:not(.user-workbench__submenu--messages) .user-workbench__submenu-link.active small {
  max-height: 34px;
  margin-top: 3px;
  opacity: 1;
}

.user-workbench__submenu--messages {
  --workbench-submenu-max: 230px;
  max-height: 210px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-color: rgba(56, 189, 248, 0.7) transparent;
  scrollbar-width: thin;
}

.user-workbench__submenu-more {
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.86);
  color: #2563eb;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.user-workbench__submenu-more:hover {
  background: rgba(219, 234, 254, 0.96);
}

.workbench-submenu-enter-active,
.workbench-submenu-leave-active {
  max-height: var(--workbench-submenu-max, 420px);
  opacity: 1;
  overflow: hidden;
  transform-origin: top;
  transition:
    max-height 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 160ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.workbench-submenu-enter-from,
.workbench-submenu-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px) scaleY(0.98);
}

.workbench-submenu-enter-to,
.workbench-submenu-leave-from {
  max-height: var(--workbench-submenu-max, 420px);
  opacity: 1;
  transform: translateY(0) scaleY(1);
}

@media (prefers-reduced-motion: reduce) {

  .user-workbench__menu-link,
  .user-workbench__menu-group-head,
  .user-workbench__submenu-link,
  .user-workbench__menu-icon,
  .user-workbench__menu-arrow,
  .workbench-submenu-enter-active,
  .workbench-submenu-leave-active {
    transition: none;
  }

  .user-workbench__menu-link:hover,
  .user-workbench__menu-group-head:hover,
  .user-workbench__submenu-link:hover,
  .user-workbench__menu-link:hover .user-workbench__menu-icon,
  .user-workbench__menu-group-head:hover .user-workbench__menu-icon,
  .user-workbench__menu-link.active .user-workbench__menu-icon,
  .user-workbench__menu-group.active>.user-workbench__menu-group-head .user-workbench__menu-icon {
    transform: none;
  }
}

.user-workbench__submenu--messages::-webkit-scrollbar {
  width: 8px;
}

.user-workbench__submenu--messages::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.user-workbench__submenu--messages::-webkit-scrollbar-track {
  background: transparent;
}

.user-workbench__submenu--messages::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.7), rgba(149, 213, 178, 0.8));
}

.user-workbench__submenu--messages::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(125, 211, 252, 0.9), rgba(149, 213, 178, 1));
}

.user-workbench__conversation-link small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-workbench__submenu-empty {
  padding: 9px 10px;
  color: #94a3b8;
  font-size: 12px;
}

.user-workbench__main {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 12px;
}

.user-workbench__content {
  min-width: 0;
  /* 与侧边栏底部留白（sticky aside 顶部 98 + max-height 100vh-120 => 底部 22px）保持一致 */
  padding-bottom: 22px;
}

.user-workbench__content :deep(.page-shell) {
  width: 100%;
  min-height: 0;
  align-content: start;
  margin: 0;
  padding: 0;
  /* 纵向节奏与开发者侧的 .dev-page 对齐：两侧页面在同一个外壳里，行距不能一宽一窄 */
  gap: 24px;
}

.user-workbench__content :deep(.portal-page) {
  width: 100%;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 16px;
  margin: 0;
  padding: 0;
}

/* 面板外观（描边 / 底色 / 阴影）与内边距、圆角都归页面自己的统一层管：
   - 用户工作台侧 .wallet-section 见 profile.css（24px 内边距 / 22px 圆角），读数条是 22px，两者对齐；
   - 开发者侧 .dev-surface-card 见 dev-base.css。
   外壳曾经把工作台里的面板一律压成 18px 圆角 + 18px 内边距，于是「顶部读数条 22px 圆角、下面的面板 18px」，
   面板里的标题也不再与读数左对齐；同一套页面从别的入口进来又换一种外观。
   现在外壳只负责把页面根节点收进内容列，不再改写卡片几何。 */

/* 还没换成 .wallet-section 的旧门户页仍用 .portal-page__panel，由外壳补同一档几何值 */
.user-workbench__content :deep(.portal-page__panel) {
  padding: 24px;
  border-radius: 22px;
}

.user-workbench__content :deep(.portal-page__stats) {
  gap: 12px;
}

.user-workbench__content :deep(.portal-page__stat-card) {
  padding: 16px;
  border-radius: 16px;
}

.user-workbench__content :deep(.portal-page__stat-card strong) {
  margin-bottom: 0;
  font-size: 28px;
  line-height: 1;
}

.user-workbench__content :deep(.profile-page-head) {
  display: none;
}

.user-workbench__content :deep(.invite-view),
.user-workbench__content :deep(.badges-view) {
  width: 100%;
  margin: 0;
}

/* 开发者页在两种模式下是同一套外观：.dev-page / .dev-grid / .dev-surface-card 的间距、
   圆角、内边距与阴影都由 dev-base.css 统一规定，外壳不再用 :deep 改写它们。
   外壳曾经把卡片压成 18px 圆角 + 14px 内边距、栅格间距压成 16px，
   结果是「顶部读数条 24px 圆角、下面的卡片 18px」，标题左右也不再与读数对齐；
   而且同一页从 /dev 旧入口进来时又是 24px，同一套页面出现两种外观。 */
.user-workbench__content :deep(.dev-page) {
  width: 100%;
  margin: 0;
}

@media (max-width: 900px) {
  .user-workbench {
    grid-template-columns: 1fr;
  }

  .user-workbench__aside {
    position: static;
    max-height: none;
  }

  .user-workbench__aside-inner {
    gap: 12px;
  }

  .user-workbench__menu {
    grid-template-columns: 1fr;
  }

  .user-workbench__submenu--messages {
    max-height: 160px;
  }
}

@media (max-width: 900px) {
  .user-workbench {
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .user-workbench__menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: block;
    background: rgba(15, 23, 42, 0.36);
    backdrop-filter: blur(2px);
  }

  .user-workbench__aside {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 80;
    width: min(84vw, 320px);
    height: auto;
    max-height: none;
    border-radius: 0 22px 22px 0;
    transform: translateX(-104%);
    transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .user-workbench--mobile-menu-open .user-workbench__aside {
    transform: translateX(0);
  }

  .user-workbench__aside-scrollbar {
    height: 100%;
    max-height: none !important;
  }

  .user-workbench__aside-inner {
    min-height: 100%;
    padding: 16px;
  }

  .user-workbench__drawer-close {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    border-radius: 11px;
    background: rgba(239, 246, 255, 0.94);
    color: #1d4ed8;
  }

  /* 抽屉里的模式切换与关闭按钮同高，便于手指点击 */
  .user-workbench__mode-switch {
    min-height: 32px;
    padding: 0 11px;
  }

  .user-workbench__mobile-bar {
    position: sticky;
    top: 8px;
    z-index: 12;
    display: flex;
    align-items: center;
    gap: 10px;
    width: calc(100% - 16px);
    margin: 8px 8px 12px;
    height: auto;
    min-height: 66px;
    padding: 12px;
    border: 1px solid rgba(224, 232, 255, 0.96);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08);
  }

  .user-workbench__mobile-bar>div {
    display: grid;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .user-workbench__mobile-bar strong,
  .user-workbench__mobile-bar span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-workbench__mobile-bar strong {
    color: #0f172a;
    font-size: 15px;
    line-height: 1.2;
  }

  .user-workbench__mobile-bar span {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
  }

  .user-workbench__mobile-menu-btn,
  .user-workbench__mobile-back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 12px;
    background: rgba(219, 234, 254, 0.9);
    color: #1d4ed8;
    font-size: 13px;
    font-weight: 800;
  }

  /* 消息页不再隐藏侧边栏与顶部栏：顶部栏被 unified-top-card.css 用 !important 强制保留，
     若只隐藏侧边栏，「菜单」按钮点开就只剩遮罩、抽屉不出现（移动端曾出现的白屏+遮罩 bug）。 */
  .user-workbench--messages {
    margin-top: 0;
  }
}

@media (max-width: 200px) {
  .user-workbench {
    gap: 12px;
    margin-top: 10px;
  }

  .user-workbench__aside {
    border-radius: 18px;
  }

  .user-workbench__brand {
    align-items: center;
  }

  .user-workbench__menu-link,
  .user-workbench__menu-group-head {
    min-height: 44px;
  }

  .user-workbench__submenu {
    margin-left: 16px;
  }

  .user-workbench__menu-link small,
  .user-workbench__submenu-link small {
    display: none;
  }
}
</style>
