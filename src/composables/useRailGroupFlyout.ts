import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'

import { railGroupItemActive, type RailGroup, type RailGroupItem } from '@/shared/workbenchRailGroups'

/**
 * 图标栏分组图标的 PC 悬浮菜单：中栏列表收起后，鼠标停在分组图标上约 120ms，
 * 就在图标右侧弹出该组条目（Teleport 到 body，避免被滚动容器裁切）。
 *
 * 只在精确指针设备上启用（`(hover: hover) and (pointer: fine)`）。jsdom 没有
 * `matchMedia`，按桌面端处理（与 `WorkbenchBarSlot` 同一口径）；触屏端另有 CSS 兜底。
 */
const HOVER_MEDIA = '(hover: hover) and (pointer: fine)'
const FLYOUT_OPEN_DELAY = 120
const FLYOUT_CLOSE_DELAY = 160
/** 与 `workbench-icon-rail.css` 的 `.workbench-icon-rail__flyout` 宽度保持一致，用于视口内夹取。 */
const FLYOUT_WIDTH = 232

export function useRailGroupFlyout(options: {
  groups: Ref<RailGroup[]>
  currentName: Ref<string>
  /** 中栏列表是否展开；展开时悬浮图标只出 tooltip。 */
  panelOpen: Ref<boolean>
  /** 悬浮层出现时把 tooltip 收掉，避免两层叠在一起。 */
  hideTooltip: () => void
  /** 点了悬浮层里的条目：外壳据此重新打开中栏列表。 */
  onOpenGroup: (groupKey: string) => void
}) {
  const route = useRoute()

  const flyoutGroupKey = ref<string | null>(null)
  const flyoutStyle = ref<Record<string, string>>({})
  const flyoutEl = ref<HTMLElement | null>(null)

  const flyoutGroup = computed(
    () => options.groups.value.find((group) => group.key === flyoutGroupKey.value) ?? null,
  )

  let openTimer: ReturnType<typeof setTimeout> | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  function supportsHoverFlyout() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return true
    }
    return window.matchMedia(HOVER_MEDIA).matches
  }

  function clearOpenTimer() {
    if (openTimer !== null) {
      clearTimeout(openTimer)
      openTimer = null
    }
  }

  function clearCloseTimer() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
  }

  function closeFlyout() {
    clearOpenTimer()
    clearCloseTimer()
    flyoutGroupKey.value = null
  }

  /** 先按按钮位置摆好，渲染后再按实际高度把 top 夹回视口内。 */
  async function openFlyout(groupKey: string, target: HTMLElement) {
    if (!options.groups.value.some((group) => group.key === groupKey)) {
      return
    }
    options.hideTooltip()
    const rect = target.getBoundingClientRect()
    const viewportWidth = window.innerWidth || FLYOUT_WIDTH
    const viewportHeight = window.innerHeight || 0
    const left = Math.max(8, Math.min(rect.right + 8, viewportWidth - FLYOUT_WIDTH - 12))
    const top = Math.max(12, Math.min(rect.top, Math.max(12, viewportHeight - 120)))
    flyoutStyle.value = { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` }
    flyoutGroupKey.value = groupKey
    await nextTick()
    const height = flyoutEl.value?.offsetHeight ?? 0
    if (height > 0) {
      const clampedTop = Math.max(12, Math.min(rect.top, viewportHeight - height - 12))
      flyoutStyle.value = { ...flyoutStyle.value, top: `${Math.round(clampedTop)}px` }
    }
  }

  /**
   * 悬浮到分组图标：需要弹悬浮层就返回 true，调用方不必再显示 tooltip。
   * 面板展开、或非精确指针设备时返回 false，交回原有 tooltip 行为。
   */
  function hoverGroup(groupKey: string, event: Event): boolean {
    if (options.panelOpen.value || !supportsHoverFlyout()) {
      return false
    }
    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) {
      return false
    }
    clearOpenTimer()
    clearCloseTimer()
    openTimer = setTimeout(() => {
      openTimer = null
      void openFlyout(groupKey, target)
    }, FLYOUT_OPEN_DELAY)
    return true
  }

  /** 离开分组图标：留 160ms 给鼠标移进悬浮层。 */
  function leaveGroup() {
    clearOpenTimer()
    clearCloseTimer()
    if (!flyoutGroupKey.value) {
      return
    }
    closeTimer = setTimeout(() => {
      closeTimer = null
      flyoutGroupKey.value = null
    }, FLYOUT_CLOSE_DELAY)
  }

  function cancelClose() {
    clearCloseTimer()
  }

  function flyoutItemActive(item: RailGroupItem) {
    return railGroupItemActive(item, options.currentName.value)
  }

  function selectFlyoutItem() {
    const groupKey = flyoutGroupKey.value
    closeFlyout()
    if (groupKey) {
      options.onOpenGroup(groupKey)
    }
  }

  // 面板一展开、路由一变、页面一滚，悬浮层都失去意义，直接收起。
  watch(() => options.panelOpen.value, (open) => open && closeFlyout())
  watch(() => route.fullPath, closeFlyout)

  onMounted(() => {
    window.addEventListener('scroll', closeFlyout, true)
  })

  onBeforeUnmount(() => {
    clearOpenTimer()
    clearCloseTimer()
    window.removeEventListener('scroll', closeFlyout, true)
  })

  return {
    flyoutGroup,
    flyoutStyle,
    flyoutEl,
    flyoutItemActive,
    hoverGroup,
    leaveGroup,
    cancelClose,
    closeFlyout,
    selectFlyoutItem,
  }
}
