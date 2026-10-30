<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bell,
  Box,
  ChatDotRound,
  Clock,
  Connection,
  Document,
  Files,
  Grid,
  OfficeBuilding,
  Promotion,
  Star,
  TIcon,
  UserFilled,
  Wallet,
} from 'ui_73info'

import { isWorkbenchChatPage } from '@/shared/workbenchChatRoute'

import WorkbenchIconRailSettings from './WorkbenchIconRailSettings.vue'

type RailItem = {
  key: string
  label: string
  icon: Component
  to: { name: string; query?: Record<string, string> }
  activeNames?: string[]
}

const props = defineProps<{
  isDevWorkbenchMode: boolean
  unreadCount: number
  teamInvitationCount: number
}>()

const emit = defineEmits<{
  'switch-mode': []
}>()

const route = useRoute()
const router = useRouter()

const userItems: RailItem[] = [
  {
    key: 'messages',
    label: '消息',
    icon: ChatDotRound,
    to: { name: 'workbench' },
    activeNames: ['workbench', 'workbench-messages'],
  },
  {
    key: 'resources',
    label: '资源项目',
    icon: Files,
    to: { name: 'workbench-resource-purchases' },
    activeNames: ['workbench-resource-purchases', 'resources', 'resource-detail'],
  },
  {
    key: 'requirements',
    label: '我的需求',
    icon: Grid,
    to: { name: 'workbench-requirements' },
    activeNames: ['workbench-requirements'],
  },
  {
    key: 'tickets',
    label: '工单中心',
    icon: Clock,
    to: { name: 'workbench-tickets' },
    activeNames: ['workbench-tickets'],
  },
  {
    key: 'favorites',
    label: '我的收藏',
    icon: Star,
    to: { name: 'workbench-favorites' },
    activeNames: ['workbench-favorites'],
  },
  {
    key: 'perks',
    label: '我的权益',
    icon: Box,
    to: { name: 'workbench-perks' },
    activeNames: ['workbench-perks'],
  },
  {
    key: 'notifications',
    label: '系统通知',
    icon: Bell,
    to: { name: 'workbench-notifications' },
    activeNames: ['workbench-notifications'],
  },
]

const devItems: RailItem[] = [
  {
    key: 'messages',
    label: '消息',
    icon: ChatDotRound,
    to: { name: 'dev-messages' },
    activeNames: ['dev-messages'],
  },
  {
    key: 'home',
    label: '开发者总览',
    icon: UserFilled,
    to: { name: 'dev-home' },
    activeNames: ['dev-home', 'dev-dashboard'],
  },
  {
    key: 'resources',
    label: '资源项目',
    icon: Files,
    to: { name: 'dev-resource-list' },
    activeNames: [
      'dev-resource-list',
      'dev-resource-versions',
      'dev-resource-homepage-edit',
      'dev-resource-sold-purchases',
    ],
  },
  {
    key: 'requirements',
    label: '我的接单',
    icon: Grid,
    to: { name: 'dev-my-requirements' },
    activeNames: ['dev-my-requirements'],
  },
  {
    key: 'hall',
    label: '需求大厅',
    icon: Promotion,
    to: { name: 'dev-requirement-hall' },
    activeNames: ['dev-requirement-hall'],
  },
  {
    key: 'clients',
    label: '接入客户端',
    icon: Connection,
    to: { name: 'dev-oauth-clients' },
    activeNames: ['dev-oauth-clients'],
  },
  {
    key: 'teams',
    label: '团队服务',
    icon: OfficeBuilding,
    to: { name: 'workbench-teams' },
    activeNames: ['workbench-teams', 'workbench-team-detail', 'workbench-team-resources'],
  },
  {
    key: 'wallet',
    label: '收益钱包',
    icon: Wallet,
    to: { name: 'dev-wallet' },
    activeNames: ['dev-wallet'],
  },
  {
    key: 'invoices',
    label: '我的发票',
    icon: Document,
    to: { name: 'dev-invoices' },
    activeNames: ['dev-invoices'],
  },
  {
    key: 'notifications',
    label: '系统通知',
    icon: Bell,
    to: { name: 'dev-notifications' },
    activeNames: ['dev-notifications'],
  },
]

const query = computed(() => route.query as Record<string, unknown>)
const currentName = computed(() => String(route.name ?? ''))
const isChatActive = computed(() => isWorkbenchChatPage(currentName.value, route.meta, query.value))
const items = computed(() => (props.isDevWorkbenchMode ? devItems : userItems))
const switchLabel = computed(() =>
  props.isDevWorkbenchMode ? '回到用户工作台' : '进入开发者工作台',
)

function isActive(item: RailItem) {
  if (item.key === 'messages') {
    return isChatActive.value
  }
  return item.activeNames?.includes(currentName.value) ?? false
}

function open(item: RailItem) {
  void router.push(item.to)
}

function badgeFor(key: string) {
  if (key === 'messages') {
    return props.unreadCount
  }
  if (key === 'notifications') {
    return props.teamInvitationCount
  }
  return 0
}
</script>

<template>
  <aside class="workbench-icon-rail" aria-label="工作台快捷导航">
    <nav class="workbench-icon-rail__items">
      <button
        v-for="item in items"
        :key="item.key"
        class="workbench-icon-rail__item"
        :class="{ 'is-active': isActive(item) }"
        type="button"
        :aria-label="item.label"
        :aria-current="isActive(item) ? 'page' : undefined"
        :title="item.label"
        @click="open(item)"
      >
        <TIcon :size="23">
          <component :is="item.icon" />
        </TIcon>
        <span v-if="badgeFor(item.key) > 0" class="workbench-icon-rail__badge">
          {{ badgeFor(item.key) > 99 ? '99+' : badgeFor(item.key) }}
        </span>
        <span class="workbench-icon-rail__tooltip">{{ item.label }}</span>
      </button>
    </nav>

    <WorkbenchIconRailSettings :switch-label="switchLabel" @switch-mode="emit('switch-mode')" />
  </aside>
</template>

<style scoped src="./workbench-icon-rail.css"></style>
