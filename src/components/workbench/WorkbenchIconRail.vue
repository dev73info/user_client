<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bell,
  ChatDotRound,
  Connection,
  Document,
  Files,
  Grid,
  OfficeBuilding,
  Promotion,
  TIcon,
  UserFilled,
  Wallet,
} from 'ui_73info'

import { useRailTooltip } from '@/composables/useRailTooltip'
import { useWorkbenchRailGroups } from '@/composables/useWorkbenchRailGroups'
import { isWorkbenchChatPage } from '@/shared/workbenchChatRoute'

import WorkbenchIconRailSettings from './WorkbenchIconRailSettings.vue'

/**
 * 图标栏一条：`to` 有值就是普通跳转；`groupKey` 有值表示它是「一个分组的入口」，
 * 点进组内第一条，右侧同时铺开组内列表（见 `WorkbenchRailGroupPanel`）。
 */
type RailItem = {
  key: string
  label: string
  icon: Component
  to: { name: string; query?: Record<string, string> }
  activeNames?: string[]
  /** 分组入口：只用来说明「这一条代表哪一组」，跳转目标仍是组内第一条。 */
  groupKey?: string
  /** 分组入口的高亮由 `activeGroup` 决定，不走 `activeNames`。 */
  active?: boolean
}

const props = defineProps<{
  isDevWorkbenchMode: boolean
  unreadCount: number
  teamInvitationCount: number
  /** 「我的合同」要实名通过才进分组，与侧边栏同一口径。 */
  realnameApproved: boolean
}>()

const emit = defineEmits<{
  'switch-mode': []
}>()

const route = useRoute()
const router = useRouter()

const { groups, activeGroup } = useWorkbenchRailGroups({
  realnameApproved: computed(() => props.realnameApproved),
})

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

/**
 * 用户模式的图标栏：消息 / 两个分组 / 系统通知。
 *
 * 分组只占一个图标，组内页面在图标右侧的列表里换（版式与消息中心同一套「中栏列表 +
 * 右栏内容」）。这样 11 个账户类入口不再堆在一列滚动条里，也不和齿轮弹层重复。
 */
const userItems = computed<RailItem[]>(() => [
  {
    key: 'messages',
    label: '消息',
    icon: ChatDotRound,
    to: { name: 'workbench' },
    activeNames: ['workbench', 'workbench-messages'],
  },
  ...groups.value.map<RailItem>((group) => ({
    key: group.key,
    label: group.label,
    icon: group.icon,
    to: { name: group.items[0]!.name },
    groupKey: group.key,
    active: activeGroup.value?.key === group.key,
  })),
  {
    key: 'notifications',
    label: '系统通知',
    icon: Bell,
    to: { name: 'workbench-notifications' },
    activeNames: ['workbench-notifications'],
  },
])

const items = computed(() => (props.isDevWorkbenchMode ? devItems : userItems.value))
const switchLabel = computed(() =>
  props.isDevWorkbenchMode ? '回到用户工作台' : '进入开发者工作台',
)

function isActive(item: RailItem) {
  if (item.key === 'messages') {
    return isChatActive.value
  }
  if (item.groupKey) {
    return item.active === true
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

const {
  label: tooltipLabel,
  style: tooltipStyle,
  visible: tooltipVisible,
  show: showTooltip,
  hide: hideTooltip,
} = useRailTooltip()
</script>

<template>
  <aside class="workbench-icon-rail" aria-label="工作台快捷导航">
    <nav class="workbench-icon-rail__items">
      <button
        v-for="item in items"
        :key="item.key"
        class="workbench-icon-rail__item"
        :class="{
          'is-active': isActive(item),
          'workbench-icon-rail__item--group': Boolean(item.groupKey),
        }"
        type="button"
        :aria-label="item.label"
        :aria-current="isActive(item) ? 'page' : undefined"
        @click="open(item)"
        @mouseenter="showTooltip(item.label, $event)"
        @focus="showTooltip(item.label, $event)"
        @mouseleave="hideTooltip"
        @blur="hideTooltip"
      >
        <TIcon :size="23">
          <component :is="item.icon" />
        </TIcon>
        <span v-if="badgeFor(item.key) > 0" class="workbench-icon-rail__badge">
          {{ badgeFor(item.key) > 99 ? '99+' : badgeFor(item.key) }}
        </span>
      </button>
    </nav>

    <Teleport to="body">
      <span
        v-if="tooltipVisible"
        class="workbench-icon-rail__tooltip workbench-icon-rail__tooltip--floating"
        :style="tooltipStyle"
        role="tooltip"
      >
        {{ tooltipLabel }}
      </span>
    </Teleport>

    <WorkbenchIconRailSettings :switch-label="switchLabel" @switch-mode="emit('switch-mode')" />
  </aside>
</template>

<style scoped src="./workbench-icon-rail.css"></style>
