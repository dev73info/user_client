<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, Box, Connection, DataAnalysis, MagicStick, Wallet } from '@element-plus/icons-vue'

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
      { label: '实名认证', name: 'workbench-realname', description: '提交或查看实名审核' },
      { label: '工单中心', name: 'workbench-tickets', description: '提交问题与查看回复' },
    ],
  },
  {
    key: 'developer-resources',
    label: '开发者资源',
    icon: MagicStick,
    items: [
      { label: '资源初始化', name: 'dev-plugins', description: '创建资源并提交审核' },
      {
        label: '资源列表',
        name: 'dev-resource-list',
        description: '管理主页、版本与资源状态',
        activeNames: ['dev-resource-homepage-edit', 'dev-resource-versions'],
      },
    ],
  },
  {
    key: 'developer-requirements',
    label: '开发者接单',
    icon: Connection,
    items: [
      { label: '需求大厅', name: 'dev-requirement-hall', description: '浏览并关联可接需求' },
      { label: '我的接单', name: 'dev-my-requirements', description: '查看已关联需求和会话' },
    ],
  },
  {
    key: 'developer-wallet',
    label: '开发者收益',
    icon: Wallet,
    items: [
      { label: '收益钱包', name: 'dev-wallet', description: '查看余额与保证金信息' },
      { label: '交付记录', name: 'dev-wallet-releases', description: '查看资源交付与收入' },
      { label: '提现记录', name: 'dev-wallet-withdrawals', description: '查看提现申请状态' },
    ],
  },
]

const openGroupKeys = ref<string[]>(['messages', 'collaboration', 'account'])
const sortedConversations = computed(() =>
  [...conversations.value].sort((left, right) =>
    parseConversationTime(right.last_message_at ?? right.updated_at ?? right.created_at)
    - parseConversationTime(left.last_message_at ?? left.updated_at ?? left.created_at),
  ),
)
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
  return active?.label ?? routeTitle.value ?? overviewItem.label
})

const currentDescription = computed(() => {
  if (route.name === 'workbench-messages') {
    return activeConversation.value
      ? `${partnerLabel(activeConversation.value)} · ${conversationMeta(activeConversation.value)}`
      : '选择左侧会话，继续用户与开发者沟通。'
  }

  const active = findActiveItem()
  return active?.description ?? routeDescription.value ?? overviewItem.description
})

const currentEyebrow = computed(() => (isDeveloperArea() ? '开发者功能' : '统一工作台'))
const routeTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''))
const routeDescription = computed(() => (typeof route.meta.description === 'string' ? route.meta.description : ''))
const isWorkbenchOverview = computed(() =>
  route.name === overviewItem.name || route.matched.some((record) => record.name === overviewItem.name),
)
const isMessageDetailPage = computed(() => {
  const requirementId = route.query.requirement_id
  return route.name === 'workbench-messages' && typeof requirementId === 'string' && requirementId.trim().length > 0
})
const showWorkbenchHeader = computed(() => !isWorkbenchOverview.value && !isMessageDetailPage.value)

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

function findActiveItem() {
  if (isOverviewActive()) {
    return overviewItem
  }

  if (route.name === 'workbench-messages') {
    return null
  }

  return menuGroups.flatMap((group) => group.items).find((item) => isMenuItemActive(item)) ?? null
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
  <main class="user-workbench">
    <aside class="user-workbench__aside" aria-label="统一工作台菜单">
      <el-scrollbar class="app-scrollbar user-workbench__aside-scrollbar" max-height="calc(100vh - 120px)">
        <div class="user-workbench__aside-inner">
          <div class="user-workbench__brand">
            <span>73Info.cn</span>
            <strong>个人工作台</strong>
          </div>

          <nav class="user-workbench__menu">
            <RouterLink class="user-workbench__menu-link user-workbench__menu-link--root"
              :class="{ active: isOverviewActive() }" :to="menuItemTo(overviewItem)">
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

              <div v-show="isMessageMenuOpen()" class="user-workbench__submenu user-workbench__submenu--messages">
                <RouterLink v-for="item in sortedConversations" :key="item.conversation_id"
                  class="user-workbench__submenu-link user-workbench__conversation-link"
                  :class="{ active: isConversationActive(item) }" :to="conversationTo(item)">
                  <span>{{ item.requirement_title || item.requirement_id }}</span>
                  <small>{{ partnerLabel(item) }} · {{ conversationMeta(item) }}</small>
                </RouterLink>

                <span v-if="!conversationLoading && sortedConversations.length === 0"
                  class="user-workbench__submenu-empty">暂无会话</span>
                <span v-else-if="conversationLoading" class="user-workbench__submenu-empty">同步会话中</span>
              </div>
            </section>

            <section v-for="group in menuGroups" :key="group.key" class="user-workbench__menu-group"
              :class="{ active: isGroupActive(group), open: isGroupOpen(group) }">
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

              <div v-show="isGroupOpen(group)" class="user-workbench__submenu">
                <RouterLink v-for="item in group.items" :key="`${item.name}-${item.hash ?? ''}`"
                  class="user-workbench__submenu-link" :class="{ active: isMenuItemActive(item) }"
                  :to="menuItemTo(item)">
                  <span>{{ item.label }}</span>
                  <small>{{ item.description }}</small>
                </RouterLink>
              </div>
            </section>
          </nav>
        </div>
      </el-scrollbar>
    </aside>

    <section class="user-workbench__main">
      <header v-if="showWorkbenchHeader" class="user-workbench__head">
        <div>
          <p>{{ currentEyebrow }}</p>
          <h1>{{ currentTitle }}</h1>
          <span>{{ currentDescription }}</span>
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
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  gap: 18px;
  margin: 16px auto 0;
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
  gap: 16px;
  padding: 16px;
}

.user-workbench__brand {
  display: grid;
  gap: 4px;
  padding: 4px 4px 8px;
}

.user-workbench__brand span {
  color: #4f8cff;
  font-size: 12px;
  font-weight: 800;
}

.user-workbench__brand strong {
  color: #0f172a;
  font-size: 20px;
  line-height: 1.2;
}

.user-workbench__menu,
.user-workbench__menu-group,
.user-workbench__submenu {
  display: grid;
  gap: 8px;
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
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 10px;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
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
}

.user-workbench__menu-icon {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: rgba(219, 234, 254, 0.82);
  color: #2563eb;
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
  transition: transform 160ms ease;
}

.user-workbench__menu-group.open .user-workbench__menu-arrow {
  transform: rotate(180deg);
}

.user-workbench__submenu {
  margin-left: 40px;
  padding-left: 10px;
  border-left: 1px solid rgba(209, 220, 243, 0.95);
}

.user-workbench__submenu-link {
  display: grid;
  gap: 2px;
  padding: 9px 10px;
  border-radius: 12px;
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

.user-workbench__submenu--messages {
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-color: rgba(56, 189, 248, 0.7) transparent;
  scrollbar-width: thin;
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
  gap: 16px;
}

.user-workbench__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px;
  border-radius: 22px;
}

.user-workbench__head p,
.user-workbench__head h1,
.user-workbench__head span {
  margin: 0;
}

.user-workbench__head p {
  color: #4f8cff;
  font-size: 13px;
  font-weight: 800;
}

.user-workbench__head h1 {
  margin-top: 7px;
  color: #0f172a;
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.12;
}

.user-workbench__head span {
  display: block;
  margin-top: 8px;
  color: #64748b;
  line-height: 1.6;
}

.user-workbench__dev-link {
  flex: 0 0 auto;
  align-self: flex-start;
  padding: 9px 14px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
  text-decoration: none;
  font-size: 13px;
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
  padding: 18px;
}

.user-workbench__content :deep(.dev-stat--compact) {
  min-height: 96px;
}

@media (max-width: 960px) {
  .user-workbench {
    grid-template-columns: 1fr;
  }

  .user-workbench__aside {
    position: static;
    max-height: none;
  }

  .user-workbench__menu {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .user-workbench {
    width: calc(100% - 16px);
  }
}

@media (max-width: 640px) {
  .user-workbench {
    gap: 12px;
    margin-top: 10px;
  }

  .user-workbench__aside,
  .user-workbench__head {
    border-radius: 18px;
  }

  .user-workbench__head {
    flex-direction: column;
    padding: 18px;
  }

  .user-workbench__dev-link {
    align-self: stretch;
    text-align: center;
  }
}
</style>
