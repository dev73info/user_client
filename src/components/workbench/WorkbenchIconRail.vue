<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bell,
  Box,
  ChatDotRound,
  Clock,
  Files,
  Grid,
  Promotion,
  Star,
  Switch,
  TIcon,
  User,
} from 'ui_73info'

import { isWorkbenchChatPage, isWorkbenchProfileQuery } from '@/shared/workbenchChatRoute'

type RailItem = {
  key: string
  label: string
  icon: Component
  to: { name: string; query?: Record<string, string> }
  activeNames?: string[]
}

const props = defineProps<{
  unreadCount: number
  teamInvitationCount: number
}>()

const emit = defineEmits<{
  'switch-mode': []
}>()

const route = useRoute()
const router = useRouter()

const items: RailItem[] = [
  {
    key: 'messages',
    label: '消息',
    icon: ChatDotRound,
    to: { name: 'workbench' },
    activeNames: ['workbench', 'workbench-messages'],
  },
  {
    key: 'profile',
    label: '我的',
    icon: User,
    to: { name: 'workbench', query: { view: 'profile' } },
    activeNames: ['workbench'],
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
    key: 'hall',
    label: '需求大厅',
    icon: Promotion,
    to: { name: 'requirement-hall' },
    activeNames: ['requirement-hall'],
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

const query = computed(() => route.query as Record<string, unknown>)
const currentName = computed(() => String(route.name ?? ''))
const isChatActive = computed(() => isWorkbenchChatPage(currentName.value, route.meta, query.value))
const isProfileActive = computed(() => isWorkbenchProfileQuery(currentName.value, query.value))

function isActive(item: RailItem) {
  if (item.key === 'messages') {
    return isChatActive.value
  }
  if (item.key === 'profile') {
    return isProfileActive.value
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
    <button
      class="workbench-icon-rail__brand"
      type="button"
      aria-label="进入消息工作台"
      title="消息工作台"
      @click="router.push({ name: 'workbench' })"
    >
      73
    </button>

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

    <button
      class="workbench-icon-rail__item workbench-icon-rail__switch"
      type="button"
      aria-label="进入开发者工作台"
      title="进入开发者工作台"
      @click="emit('switch-mode')"
    >
      <TIcon :size="22">
        <Switch />
      </TIcon>
      <span class="workbench-icon-rail__tooltip">开发者工作台</span>
    </button>
  </aside>
</template>

<style scoped src="./workbench-icon-rail.css"></style>
