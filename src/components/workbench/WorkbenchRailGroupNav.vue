<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { railGroupItemTo, type RailGroup, type RailGroupItem } from '@/shared/workbenchRailGroups'

/**
 * 图标栏某个分组的中栏列表：只列这一组的页面，选中项在右栏的内容区展开。
 *
 * 分组名由图标栏自己的悬浮提示报出，中栏不再重复一行标题；版式与消息中心的中栏一致
 * （下面一列可选条目），这样「消息 / 订单与合同 / 资产与权益」三个入口点下去是同一个骨架。
 */
defineProps<{
  group: RailGroup
  isItemActive: (item: RailGroupItem) => boolean
}>()

const emit = defineEmits<{
  (event: 'navigate'): void
}>()
</script>

<template>
  <section class="workbench-rail-group" :aria-label="group.label">
    <nav class="workbench-rail-group__list">
      <RouterLink
        v-for="item in group.items"
        :key="item.key"
        class="workbench-rail-group__link"
        :class="{ active: isItemActive(item) }"
        :to="railGroupItemTo(item)"
        :aria-current="isItemActive(item) ? 'page' : undefined"
        @click="emit('navigate')"
      >
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </section>
</template>

<style scoped src="./workbench-rail-group.css"></style>
