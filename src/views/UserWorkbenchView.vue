<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Box, Close, Connection, DataAnalysis, MagicStick, Menu as MenuIcon, UserFilled } from '@element-plus/icons-vue'

import { listRequirementConversations, type RequirementConversation } from '@/api/conversations'
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

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const conversations = ref<RequirementConversation[]>([])
const conversationLoading = ref(false)
const mobileMenuOpen = ref(false)
const touchStartX = ref(0)
const touchStartY = ref(0)
const touchTracking = ref(false)

const MOBILE_MENU_BREAKPOINT_PX = 900
const MOBILE_SWIPE_EDGE_PX = 44
const MOBILE_SWIPE_THRESHOLD_PX = 72
const MOBILE_SWIPE_VERTICAL_LIMIT_PX = 56

const overviewItem: WorkbenchMenuItem = {
  label: '工作台总览',
  name: 'workbench',
  description: '账户、需求与优惠券概览',
}

const menuGroups: WorkbenchMenuGroup[] = [
  {
    key: 'collaboration',
    label: '需求协作',
    icon: Connection,
    items: [
      { label: '我的需求单', name: 'workbench-requirements', description: '查看支付、交付与验收进度' },
      { label: '我的定制资源', name: 'workbench-resources', description: '查看需求关联交付资源' },
    ],
  },
  {
    key: 'account',
    label: '账户服务',
    icon: Box,
    items: [
      { label: '账户与优惠券', name: 'workbench-account', description: '管理优惠券与账户入口' },
      {
        label: '🎁 我的邀请',
        name: 'workbench-invite',
        description: '邀请好友得徽章，查看排行榜',
        activeNames: ['workbench-invite-leaderboard'],
      },
      { label: '实名认证', name: 'workbench-realname', description: '提交或查看实名审核' },
      { label: '工单中心', name: 'workbench-tickets', description: '提交问题与查看回复' },
    ],
  },
  {
    key: 'team',
    label: '团队服务',
    icon: UserFilled,
    items: [
      { label: '我的团队', name: 'workbench-teams', description: '查看和管理团队' },
      { label: '资源项目', name: 'workbench-team-resources', description: '管理团队共享资源项目' },
    ],
  },
  {
    key: 'developer-resources',
    label: '开发者功能',
    icon: MagicStick,
    items: [
      { label: '资源初始化', name: 'dev-plugins', description: '创建资源并提交审核' },
      {
        label: '资源列表',
        name: 'dev-resource-list',
        description: '管理主页、版本与资源状态',
        activeNames: ['dev-resource-homepage-edit', 'dev-resource-versions'],
      },
      { label: '需求大厅', name: 'dev-requirement-hall', description: '浏览并关联可接需求' },
      { label: '我的接单', name: 'dev-my-requirements', description: '查看已关联需求和会话' },
      { label: '收益钱包', name: 'dev-wallet', description: '查看余额与保证金信息' },
      { label: '交付记录', name: 'dev-wallet-releases', description: '查看资源交付与收入' },
      { label: '提现记录', name: 'dev-wallet-withdrawals', description: '查看提现申请状态' },
    ],
  },
]

const openGroupKeys = ref<string[]>(['collaboration'])
const sortedConversations = computed(() =>
  [...conversations.value].sort((left, right) =>
    parseConversationTime(right.last_message_at ?? right.updated_at ?? right.created_at)
    - parseConversationTime(left.last_message_at ?? left.updated_at ?? left.created_at),
  ),
)
const visibleConversations = computed(() => sortedConversations.value.slice(0, 3))
const hiddenConversationCount = computed(() => Math.max(sortedConversations.value.length - visibleConversations.value.length, 0))
const activeConversation = computed(() => {
  const requirementId = route.query.requirement_id
  if (typeof requirementId !== 'string') {
    return null
  }

  return conversations.value.find((item) => item.requirement_id === requirementId) ?? null
})

const currentTitle = computed(() => {
  if (route.name === 'workbench-messages') {
    return activeConversation.value?.requirement_title || '消息中心'
  }

  const active = findActiveItem()
  if (isActiveChildPage(active)) {
    return compactRouteTitle.value || active?.label || overviewItem.label
  }

  return active?.label ?? routeTitle.value ?? overviewItem.label
})

const routeTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''))
const compactRouteTitle = computed(() => routeTitle.value.split('/').at(-1)?.trim() || routeTitle.value)
const isWorkbenchOverview = computed(() =>
  route.name === overviewItem.name || route.matched.some((record) => record.name === overviewItem.name),
)
const isMessageDetailPage = computed(() => {
  const requirementId = route.query.requirement_id
  return route.name === 'workbench-messages' && typeof requirementId === 'string' && requirementId.trim().length > 0
})
const isMergedHeaderPage = computed(() =>
  route.name === 'dev-resource-homepage-edit' || route.name === 'dev-requirement-detail',
)
const showWorkbenchHeader = computed(
  () => !isWorkbenchOverview.value && !isMessageDetailPage.value && !isMergedHeaderPage.value,
)

watch(
  () => route.fullPath,
  () => {
    const activeGroup = menuGroups.find((group) => group.items.some((item) => isMenuItemActive(item)))
    if (activeGroup && !openGroupKeys.value.includes(activeGroup.key)) {
      openGroupKeys.value = [...openGroupKeys.value, activeGroup.key]
    }
    if (route.name === 'workbench-messages' && !openGroupKeys.value.includes('messages')) {
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
  },
  { immediate: true },
)

watch(
  () => route.name,
  (name) => {
    if (name === 'workbench-messages') {
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

function conversationTo(item: RequirementConversation) {
  return {
    name: 'workbench-messages',
    query: {
      requirement_id: item.requirement_id,
    },
  }
}

function isOverviewActive() {
  return route.name === overviewItem.name && !route.hash
}

function isMessageMenuActive() {
  return route.name === 'workbench-messages'
}

function isMessageMenuOpen() {
  return openGroupKeys.value.includes('messages')
}

function openMessageCenter() {
  if (!isMessageMenuOpen()) {
    openGroupKeys.value = [...openGroupKeys.value, 'messages']
  }

  mobileMenuOpen.value = false
  void router.push({ name: 'workbench-messages' })
}

function isConversationActive(item: RequirementConversation) {
  return route.name === 'workbench-messages' && route.query.requirement_id === item.requirement_id
}

function isMenuItemActive(item: WorkbenchMenuItem) {
  const currentName = String(route.name ?? '')
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

  if (route.name === 'workbench-messages') {
    return null
  }

  return menuGroups.flatMap((group) => group.items).find((item) => isMenuItemActive(item)) ?? null
}

function isActiveChildPage(item: WorkbenchMenuItem | null) {
  return Boolean(item && route.name && item.name !== route.name && item.activeNames?.includes(String(route.name)))
}

function isDeveloperArea() {
  return route.matched.some((record) => Boolean(record.meta.devArea))
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
    'user-workbench--messages': route.name === 'workbench-messages',
    'user-workbench--mobile-menu-open': mobileMenuOpen,
  }" @touchstart.passive="handleWorkbenchTouchStart" @touchend.passive="handleWorkbenchTouchEnd"
    @touchcancel.passive="touchTracking = false">
    <button v-if="mobileMenuOpen" class="user-workbench__menu-backdrop" type="button" aria-label="关闭工作台菜单"
      @click="closeMobileMenu" />

    <aside class="user-workbench__aside" aria-label="统一工作台菜单">
      <el-scrollbar class="app-scrollbar user-workbench__aside-scrollbar" max-height="calc(100vh - 120px)">
        <div class="user-workbench__aside-inner">
          <div class="user-workbench__brand">
            <div>
              <strong>个人工作台</strong>
            </div>
            <em>{{ isDeveloperArea() ? '开发者功能' : '用户中心' }}</em>
            <button class="user-workbench__drawer-close" type="button" aria-label="关闭工作台菜单" @click="closeMobileMenu">
              <el-icon>
                <Close />
              </el-icon>
            </button>
          </div>

          <nav class="user-workbench__menu">
            <p class="user-workbench__menu-section">我的事项</p>
            <RouterLink class="user-workbench__menu-link user-workbench__menu-link--root"
              :class="{ active: isOverviewActive() }" :to="menuItemTo(overviewItem)" @click="closeMobileMenu">
              <span class="user-workbench__menu-icon">
                <el-icon>
                  <DataAnalysis />
                </el-icon>
              </span>
              <span>
                <strong>{{ overviewItem.label }}</strong>
                <small>{{ overviewItem.description }}</small>
              </span>
            </RouterLink>

            <section class="user-workbench__menu-group"
              :class="{ active: isMessageMenuActive(), open: isMessageMenuOpen() }">
              <button class="user-workbench__menu-group-head" type="button" :aria-expanded="isMessageMenuOpen()"
                @click="openMessageCenter">
                <span class="user-workbench__menu-icon">
                  <el-icon>
                    <Connection />
                  </el-icon>
                </span>
                <strong>消息中心</strong>
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

            <section v-for="group in menuGroups" :key="group.key" class="user-workbench__menu-group"
              :class="{ active: isGroupActive(group), open: isGroupOpen(group) }">
              <p v-if="group.key !== 'collaboration'" class="user-workbench__menu-section">{{ group.label }}</p>
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
                    <small>{{ item.description }}</small>
                  </RouterLink>
                </div>
              </Transition>
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
          <strong>个人工作台</strong>
          <span>{{ currentTitle }}</span>
        </div>
      </div>

      <header v-if="showWorkbenchHeader" class="user-workbench__head">
        <div class="user-workbench__head-copy">
          <h1>{{ currentTitle }}</h1>
        </div>
        <RouterLink class="user-workbench__dev-link" :to="{ name: 'home' }">返回首页</RouterLink>
      </header>

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

.user-workbench__aside,
.user-workbench__head {
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

.user-workbench__aside {
  position: sticky;
  top: 98px;
  align-self: start;
  max-height: calc(100vh - 120px);
  overflow: hidden;
  padding: 0;
  border-radius: 22px;
}

.user-workbench__aside-inner {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.user-workbench__brand {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 4px 10px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

.user-workbench__brand span {
  color: #4f8cff;
  font-size: 12px;
  font-weight: 800;
}

.user-workbench__brand strong {
  color: #0f172a;
  font-size: 18px;
  line-height: 1.2;
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

.user-workbench__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 56px;
  padding: 12px 16px;
  border-radius: 16px;
}

.user-workbench__head-copy {
  min-width: 0;
  display: grid;
  align-items: baseline;
}

.user-workbench__head h1 {
  margin: 0;
}

.user-workbench__head h1 {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.2;
}

.user-workbench__dev-link {
  flex: 0 0 auto;
  align-self: center;
  padding: 8px 12px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 9px;
  background: #fff;
  color: #0f172a;
  text-decoration: none;
  font-size: 12px;
  font-weight: 800;
}

.user-workbench__content {
  min-width: 0;
}

.user-workbench__content :deep(.page-shell) {
  width: 100%;
  min-height: 0;
  align-content: start;
  margin: 0;
  padding: 0;
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

.user-workbench__content :deep(.wallet-section),
.user-workbench__content :deep(.messages-panel),
.user-workbench__content :deep(.messages-summary__item),
.user-workbench__content :deep(.portal-page__panel),
.user-workbench__content :deep(.portal-page__stat-card) {
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
}

.user-workbench__content :deep(.wallet-section),
.user-workbench__content :deep(.portal-page__panel) {
  padding: 18px;
  border-radius: 18px;
}

.user-workbench__content :deep(.portal-page__stats),
.user-workbench__content :deep(.messages-summary) {
  gap: 12px;
}

.user-workbench__content :deep(.portal-page__stat-card),
.user-workbench__content :deep(.messages-summary__item) {
  padding: 16px;
  border-radius: 16px;
}

.user-workbench__content :deep(.portal-page__stat-card strong) {
  margin-bottom: 6px;
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

.user-workbench__content :deep(.dev-page) {
  width: 100%;
  margin: 0;
  gap: 16px;
}

.user-workbench__content :deep(.dev-grid) {
  gap: 16px;
}

.user-workbench__content :deep(.dev-surface-card) {
  border-radius: 18px;
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
}

.user-workbench__content :deep(.dev-surface-card .el-card__body) {
  padding: 14px;
}

.user-workbench__content :deep(.dev-stat--compact) {
  min-height: 74px;
}

.user-workbench__content :deep(.dev-stat) {
  gap: 5px;
}

.user-workbench__content :deep(.dev-stat__value) {
  font-size: 28px;
}

.user-workbench__content :deep(.dev-stat__hint) {
  font-size: 13px;
  line-height: 1.35;
}

.user-workbench__content :deep(.messages-page) {
  width: 100%;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 12px;
  margin: 0;
  padding: 0;
}

.user-workbench__content :deep(.messages-search) {
  position: sticky !important;
  top: 8px !important;
  z-index: 12 !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  width: calc(100% - 16px) !important;
  margin: 8px 8px 12px !important;
  height: 50px !important;
  min-height: 50px !important;
  padding: 0 12px !important;
  border: 1px solid rgba(224, 232, 255, 0.96) !important;
  border-radius: 16px !important;
  background: rgba(255, 255, 255, 0.94) !important;
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08) !important;
}

@media (max-width: 900px) {
  .user-workbench__content :deep(.messages-page) {
    width: 100%;
    min-height: 0;
    display: grid;
    align-content: start;
    gap: 10px;
    margin: 0;
    padding: 0;
  }
}

@media (max-width: 960px) {
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

  .user-workbench__mobile-menu-btn {
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

  .user-workbench--messages {
    margin-top: 0;
  }

  .user-workbench--messages .user-workbench__aside,
  .user-workbench--messages .user-workbench__head,
  .user-workbench--messages .user-workbench__mobile-bar {
    display: none;
  }
}

@media (max-width: 200px) {
  .user-workbench {
    gap: 12px;
    margin-top: 10px;
  }

  .user-workbench__aside,
  .user-workbench__head {
    border-radius: 18px;
  }

  .user-workbench__head {
    min-height: 50px;
    padding: 10px 12px;
  }

  .user-workbench__head h1 {
    font-size: 19px;
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

  .user-workbench__dev-link {
    align-self: center;
    text-align: center;
  }
}
</style>
