<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Bell, ChatDotRound, Suitcase, TIcon, User } from 'ui_73info'

import { useRailGroupFlyout } from '@/composables/useRailGroupFlyout'
import { useRailTooltip } from '@/composables/useRailTooltip'
import { useWorkbenchRailGroups } from '@/composables/useWorkbenchRailGroups'
import { railGroupItemActive, railGroupItemTo } from '@/shared/workbenchRailGroups'
import { isWorkbenchChatPage } from '@/shared/workbenchChatRoute'

import WorkbenchIconRailSettings from './WorkbenchIconRailSettings.vue'
import WorkbenchOverviewIcon from './WorkbenchOverviewIcon.vue'

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
  /** 右侧分组菜单是否展开；收起时 PC 端改为鼠标悬浮图标弹出菜单列表。 */
  groupPanelOpen?: boolean
}>()

const emit = defineEmits<{
  'switch-mode': []
  /** 点了某个分组图标（或悬浮层里的条目）：请外壳把中栏列表重新打开。 */
  'open-group': [groupKey: string]
}>()

const route = useRoute()
const router = useRouter()

const { groups, activeGroup } = useWorkbenchRailGroups({
  realnameApproved: computed(() => props.realnameApproved),
  isDevWorkbenchMode: computed(() => props.isDevWorkbenchMode),
})

const query = computed(() => route.query as Record<string, unknown>)
const currentName = computed(() => String(route.name ?? ''))
const isChatActive = computed(() => isWorkbenchChatPage(currentName.value, route.meta, query.value))

/**
 * 图标栏：消息 / 分组 / 系统通知。用户与开发者走同一套骨架，只是分组与落地路由不同。
 *
 * 分组只占一个图标，组内页面在图标右侧的列表里换（版式与消息中心同一套「中栏列表 +
 * 右栏内容」）。这样账户类入口不再堆在一列滚动条里，也不和齿轮弹层重复。
 */
const items = computed<RailItem[]>(() => {
  const isDev = props.isDevWorkbenchMode
  return [
    {
      key: 'overview',
      label: '工作台总览',
      icon: WorkbenchOverviewIcon,
      to: { name: isDev ? 'dev-home' : 'workbench' },
      activeNames: [isDev ? 'dev-home' : 'workbench'],
    },
    {
      key: 'messages',
      label: '消息',
      icon: ChatDotRound,
      to: { name: isDev ? 'dev-messages' : 'workbench-messages' },
      activeNames: [isDev ? 'dev-messages' : 'workbench-messages'],
    },
    ...groups.value.map<RailItem>((group) => ({
      key: group.key,
      label: group.label,
      icon: group.icon,
      to: { name: group.items[0]!.name },
      groupKey: group.key,
      active: activeGroup.value?.key === group.key && !(isDev && currentName.value === 'dev-home'),
    })),
    {
      key: 'notifications',
      label: '系统通知',
      icon: Bell,
      to: { name: isDev ? 'dev-notifications' : 'workbench-notifications' },
      activeNames: [isDev ? 'dev-notifications' : 'workbench-notifications'],
    },
  ]
})
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
  if (item.key === 'overview') {
    return item.activeNames?.includes(currentName.value) ?? false
  }
  if (item.key === 'messages') {
    return isChatActive.value
  }
  if (item.groupKey) {
    return item.active === true
  }
  return item.activeNames?.includes(currentName.value) ?? false
}

function open(item: RailItem) {
  // 分组图标同时兼「重新打开中栏列表」：面板收起后再点一次图标就回来。
  if (item.groupKey) {
    emit('open-group', item.groupKey)
  }
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

/** 中栏收起后，PC 端悬浮分组图标弹出的菜单列表（逻辑见 composable）。 */
const {
  flyoutGroup,
  flyoutStyle,
  flyoutEl,
  flyoutItemActive,
  hoverGroup,
  leaveGroup,
  cancelClose,
  selectFlyoutItem,
} = useRailGroupFlyout({
  groups,
  currentName,
  panelOpen: computed(() => Boolean(props.groupPanelOpen)),
  hideTooltip,
})

function handleItemEnter(item: RailItem, event: Event) {
  if (item.groupKey && hoverGroup(item.groupKey, event)) {
    return
  }
  showTooltip(item.label, event)
}

function handleItemLeave(item: RailItem) {
  hideTooltip()
  if (item.groupKey) {
    leaveGroup()
  }
}
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
        @mouseenter="handleItemEnter(item, $event)"
        @focus="showTooltip(item.label, $event)"
        @mouseleave="handleItemLeave(item)"
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
        v-if="tooltipVisible && !flyoutGroup"
        class="workbench-icon-rail__tooltip workbench-icon-rail__tooltip--floating"
        :style="tooltipStyle"
        role="tooltip"
      >
        {{ tooltipLabel }}
      </span>
    </Teleport>

    <!-- 中栏收起后，PC 端悬浮分组图标的菜单列表（触屏端由 CSS 隐藏） -->
    <Teleport to="body">
      <div
        v-if="flyoutGroup"
        ref="flyoutEl"
        class="workbench-icon-rail__flyout"
        :style="flyoutStyle"
        role="menu"
        :aria-label="flyoutGroup.label"
        @mouseenter="cancelClose"
        @mouseleave="leaveGroup"
      >
        <p class="workbench-icon-rail__flyout-title">{{ flyoutGroup.label }}</p>
        <nav class="workbench-icon-rail__flyout-list">
          <RouterLink
            v-for="groupItem in flyoutGroup.items"
            :key="groupItem.key"
            class="workbench-icon-rail__flyout-item"
            :class="{ active: flyoutItemActive(groupItem) }"
            :to="railGroupItemTo(groupItem)"
            :aria-current="flyoutItemActive(groupItem) ? 'page' : undefined"
            @click="selectFlyoutItem"
          >
            <span class="workbench-icon-rail__flyout-label">{{ groupItem.label }}</span>
            <small class="workbench-icon-rail__flyout-desc">{{ groupItem.description }}</small>
          </RouterLink>
        </nav>
      </div>
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

      <WorkbenchIconRailSettings :username="props.username" />
    </div>
  </aside>
</template>

<style scoped src="./workbench-icon-rail.css"></style>
