<script setup lang="ts">
import { Bell, SwitchButton } from 'ui_73info'

import { useWorkbenchMenuRoute } from '@/composables/useWorkbenchMenuRoute'
import type { WorkbenchMenuItem as WorkbenchMenuItemModel } from '@/shared/workbenchMenu'
import { menuItemTo } from '@/shared/workbenchRoutes'

import WorkbenchMenuItem from './WorkbenchMenuItem.vue'

/**
 * 侧边栏底部那一档：系统通知、退出登录。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。这两条都不进上面的分组，两种工作台共用，
 * 系统通知各有一条自己的路由（开发者端带 devArea）。
 */
defineProps<{
  notificationsMenuItem: WorkbenchMenuItemModel
}>()

const emit = defineEmits<{
  (event: 'navigate'): void
  (event: 'logout'): void
}>()

const { isItemActive } = useWorkbenchMenuRoute()
</script>

<template>
  <section class="user-workbench__menu-group user-workbench__menu-group--standalone">
    <WorkbenchMenuItem
      :label="notificationsMenuItem.label"
      :icon="Bell"
      :to="menuItemTo(notificationsMenuItem)"
      :active="isItemActive(notificationsMenuItem)"
      @navigate="emit('navigate')"
    />
    <WorkbenchMenuItem
      variant="logout"
      label="退出登录"
      :icon="SwitchButton"
      @navigate="emit('logout')"
    />
  </section>
</template>

<style scoped>
.user-workbench__menu-group--standalone {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--uw-line);
}
</style>
