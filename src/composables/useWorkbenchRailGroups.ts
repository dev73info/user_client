import { computed, type Ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  buildRailGroups,
  railGroupItemActive,
  railGroupOf,
  type RailGroupItem,
} from '@/shared/workbenchRailGroups'

/**
 * 图标栏的分组导航：有哪几组、当前页落在哪一组、组内哪一条是当前页。
 *
 * 与侧边栏那份（`useWorkbenchMenu`）分开：图标栏只认「分组 → 组内页面」两层，
 * 账户那几条仍在齿轮弹层里，两边互不依赖。实名状态由调用方传进来复用
 * （侧边栏已经查过一次，不要为了同一件事再发一次请求）。
 */
export function useWorkbenchRailGroups(options: { realnameApproved: Ref<boolean> }) {
  const route = useRoute()

  const groups = computed(() => buildRailGroups(options.realnameApproved.value))
  const currentName = computed(() => String(route.name ?? ''))
  const activeGroup = computed(() => railGroupOf(groups.value, currentName.value))

  function isItemActive(item: RailGroupItem) {
    return railGroupItemActive(item, currentName.value)
  }

  return { groups, currentName, activeGroup, isItemActive }
}
