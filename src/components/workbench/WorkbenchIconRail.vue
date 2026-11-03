<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Bell,
  ChatDotRound,
  Connection,
  DataAnalysis,
  Document,
  Files,
  Grid,
  OfficeBuilding,
  Promotion,
  Suitcase,
  TIcon,
  User,
  Wallet,
} from 'ui_73info'

import { useRailTooltip } from '@/composables/useRailTooltip'
import { useWorkbenchRailGroups } from '@/composables/useWorkbenchRailGroups'
import { railGroupItemActive } from '@/shared/workbenchRailGroups'
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
  /** 底部头像的首字母；不传就显示占位符，避免为了一个字去读 store。 */
  username?: string
}>()

const emit = defineEmits<{
  'switch-mode': []
}>()

const route = useRoute()
const router = useRouter()
const avatarInitial = computed(() => (props.username || '?').slice(0, 1).toUpperCase())

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
    icon: DataAnalysis,
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
const switchLabel = computed(() => (props.isDevWorkbenchMode ? '切换到用户' : '切换到开发者'))
/** 切换按钮画「要去的那一侧」：用户态给开发者的工作包，开发态回用户的个人身份。 */
const switchIcon = computed(() => (props.isDevWorkbenchMode ? User : Suitcase))

/**
 * 每个分组上一次停在的页面：在组与组之间来回切换时，回到该组原来那一页，
 * 而不是每次都被送回组内第一条。只在当前页属于某个分组时记录（含 query）。
 */
const lastRouteByGroup = ref<Record<string, string>>({})

/**
 * 消息中心上一次停留的地址（含 `?requirement_id=…`）：切去别的分组/页面再点回「消息」时，
 * 恢复上次点开的会话，而不是回到「没有选中会话」的列表。按模式分开存，用户侧与开发者侧
 * 不互相串地址；地址是否还属于当前模式在 `open()` 里再校验一次。
 */
const lastMessagesRoute: Record<'user' | 'dev', string | null> = { user: null, dev: null }

watch(
  () => route.fullPath,
  () => {
    if (isChatActive.value) {
      lastMessagesRoute[props.isDevWorkbenchMode ? 'dev' : 'user'] = route.fullPath
    }
    const group = activeGroup.value
    if (!group) {
      return
    }
    lastRouteByGroup.value[group.key] = route.fullPath
  },
  { immediate: true },
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
  if (item.key === 'messages') {
    const remembered = lastMessagesRoute[props.isDevWorkbenchMode ? 'dev' : 'user']
    if (remembered) {
      const resolved = router.resolve(remembered)
      const resolvedIsDev = resolved.matched.some((record) => Boolean(record.meta.devArea))
      // 只认「仍然是聊天页、且属于当前模式」的旧地址；模式切换后另一侧的消息地址作废
      if (
        resolved.matched.length > 0 &&
        resolved.meta.workbenchChat === true &&
        resolvedIsDev === props.isDevWorkbenchMode
      ) {
        void router.push(remembered)
        return
      }
    }
  }
  if (item.groupKey) {
    const remembered = lastRouteByGroup.value[item.groupKey]
    if (remembered) {
      const resolved = router.resolve(remembered)
      const group = groups.value.find((candidate) => candidate.key === item.groupKey)
      const belongsToGroup =
        group?.items.some((groupItem) =>
          railGroupItemActive(groupItem, String(resolved.name ?? '')),
        ) ?? false
      if (resolved.matched.length > 0 && belongsToGroup) {
        void router.push(remembered)
        return
      }
    }
  }
  void router.push(item.to)
}

function switchWorkbenchMode() {
  emit('switch-mode')
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
    <RouterLink
      class="workbench-icon-rail__brand"
      :to="{ name: 'workbench' }"
      aria-label="工作台总览"
    >
      73
    </RouterLink>

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
        <TIcon :size="20">
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

    <div class="workbench-icon-rail__foot">
      <button
        class="workbench-icon-rail__item workbench-icon-rail__switch"
        type="button"
        :aria-label="switchLabel"
        @click="switchWorkbenchMode"
        @mouseenter="showTooltip(switchLabel, $event)"
        @focus="showTooltip(switchLabel, $event)"
        @mouseleave="hideTooltip"
        @blur="hideTooltip"
      >
        <TIcon :size="20">
          <component :is="switchIcon" />
        </TIcon>
      </button>

      <WorkbenchIconRailSettings />

      <RouterLink
        class="workbench-icon-rail__avatar"
        :to="{ name: 'workbench', query: { view: 'profile' } }"
        :title="props.username"
        :aria-label="`${props.username || '个人'}账户`"
      >
        {{ avatarInitial }}
      </RouterLink>
    </div>
  </aside>
</template>

<style scoped src="./workbench-icon-rail.css"></style>
