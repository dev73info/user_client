<script setup lang="ts">
import { computed } from 'vue'

import { useWorkbenchMenuRoute } from '@/composables/useWorkbenchMenuRoute'
import { GROUPS_WITHOUT_SECTION_LABEL, type WorkbenchMenuGroup } from '@/shared/workbenchMenu'
import { menuItemTo } from '@/shared/workbenchRoutes'

import WorkbenchMenuItem from './WorkbenchMenuItem.vue'
import WorkbenchSubmenu from './WorkbenchSubmenu.vue'
import WorkbenchSubmenuLink from './WorkbenchSubmenuLink.vue'

/**
 * 侧边栏的一个菜单分组：只剩一个页面的分组（「我的需求」）直接渲染成一级条目，
 * 其余渲染成可折叠的分组头 + 子项。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来，`@media` 与折叠动画跟着这个组件一起搬，
 * 分组头与一级条目的版式在 `WorkbenchMenuItem` 里共用一份。
 */
const props = defineProps<{
  group: WorkbenchMenuGroup
  open: boolean
  active: boolean
  /** 「我的团队」上的待处理邀请数：只有那条子项挂角标。 */
  teamInvitationCount: number
}>()

const emit = defineEmits<{
  (event: 'toggle'): void
  (event: 'navigate'): void
}>()

const { isItemActive } = useWorkbenchMenuRoute()

const showSectionLabel = computed(() => !GROUPS_WITHOUT_SECTION_LABEL.includes(props.group.key))
</script>

<template>
  <!-- 只剩一个页面的分组：整组收成一条一级条目，省掉一层没意义的展开 -->
  <section v-if="group.items.length === 1" class="user-workbench__menu-group">
    <WorkbenchMenuItem
      v-for="item in group.items"
      :key="item.name"
      :label="group.label"
      :icon="group.icon"
      :to="menuItemTo(item)"
      :active="isItemActive(item)"
      @navigate="emit('navigate')"
    />
  </section>

  <section v-else class="user-workbench__menu-group" :class="{ active, open }">
    <!-- 账户服务与团队服务不另起小标题：两者都靠分组头自己识别，再加一行会把组名写成两遍 -->
    <p v-if="showSectionLabel" class="user-workbench__menu-section">
      {{ group.label }}
    </p>
    <WorkbenchMenuItem
      variant="head"
      :label="group.label"
      :icon="group.icon"
      :open="open"
      :active="active"
      @toggle="emit('toggle')"
    />

    <WorkbenchSubmenu :open="open">
      <WorkbenchSubmenuLink
        v-for="item in group.items"
        :key="`${item.name}-${item.hash ?? ''}`"
        :to="menuItemTo(item)"
        :label="item.label"
        :active="isItemActive(item)"
        :badge="
          item.name === 'workbench-teams' && teamInvitationCount > 0
            ? String(teamInvitationCount)
            : ''
        "
        @navigate="emit('navigate')"
      />
    </WorkbenchSubmenu>
  </section>
</template>

<style scoped>
.user-workbench__menu-group {
  display: grid;
  gap: 6px;
}

.user-workbench__menu-section {
  margin: 10px 4px 2px;
  color: var(--73-ink-placeholder);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}
</style>
