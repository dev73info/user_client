<script setup lang="ts">
/**
 * 工作台侧边导航树（基准稿：资产与权益 · 积分中心）。
 *
 * 图形栏右侧的第二栏：分组标题 + 组内条目 + 底部信用卡。
 * 和旧的分组中栏不同，这里一次展示全部分组（当前组默认展开、其余组可折叠），
 * 选中项是浅蓝底 + 浅蓝描边的胶囊，与基准设计稿一致。
 */
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { getDevCreditSelf, type DevCreditSelf } from '@/api/devCredit'
import { fenToYuanText } from '@/shared/resourceSale/price'
import type { WorkbenchMenuGroup, WorkbenchMenuItem } from '@/shared/workbenchMenu'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  groups: WorkbenchMenuGroup[]
  openGroupKeys: string[]
  notificationsItem: WorkbenchMenuItem
  isItemActive: (item: WorkbenchMenuItem) => boolean
  isGroupActive: (group: WorkbenchMenuGroup) => boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-group', group: WorkbenchMenuGroup): void
  (e: 'navigate'): void
}>()

const auth = useAuthStore()
const credit = ref<DevCreditSelf | null>(null)

onMounted(async () => {
  if (!auth.token) return
  try {
    credit.value = await getDevCreditSelf(auth.token)
  } catch {
    credit.value = null
  }
})

function isOpen(group: WorkbenchMenuGroup) {
  return props.openGroupKeys.includes(group.key)
}
</script>

<template>
  <aside class="workbench-tree" aria-label="工作台导航">
    <header class="workbench-tree__head">
      <span class="workbench-tree__title">工作台</span>
      <span class="workbench-tree__subtitle">73info.cn 用户端</span>
    </header>

    <nav class="workbench-tree__nav">
      <section v-for="group in groups" :key="group.key" class="workbench-tree__group">
        <button
          class="workbench-tree__group-head"
          :class="{ 'is-active': isGroupActive(group) }"
          type="button"
          :aria-expanded="isOpen(group)"
          @click="emit('toggle-group', group)"
        >
          <span>{{ group.label }}</span>
          <svg
            class="workbench-tree__chevron"
            :class="{ 'is-open': isOpen(group) }"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path
              d="M4 6.5l4 4 4-4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <div v-if="isOpen(group)" class="workbench-tree__items">
          <RouterLink
            v-for="item in group.items"
            :key="`${group.key}-${item.name}`"
            class="workbench-tree__item"
            :class="{ 'is-active': isItemActive(item) }"
            :to="{ name: item.name, hash: item.hash }"
            @click="emit('navigate')"
          >
            <span class="workbench-tree__label">{{ item.label }}</span>
          </RouterLink>
        </div>
      </section>

      <RouterLink
        class="workbench-tree__item workbench-tree__item--standalone"
        :class="{ 'is-active': isItemActive(notificationsItem) }"
        :to="{ name: notificationsItem.name }"
        @click="emit('navigate')"
      >
        <span class="workbench-tree__label">{{ notificationsItem.label }}</span>
      </RouterLink>
    </nav>

    <div class="workbench-tree__foot">
      <div v-if="credit" class="workbench-tree__credit">
        <span class="workbench-tree__credit-label">信用额度</span>
        <div class="workbench-tree__credit-score">
          <span>信用分</span>
          <strong>{{ credit.credit_score.toFixed(1) }}</strong>
        </div>
        <p class="workbench-tree__credit-line">
          单笔订单封顶 ¥{{ fenToYuanText(credit.max_order_amount_fen) }}
        </p>
        <p class="workbench-tree__credit-line">
          保证金封顶 ¥{{ fenToYuanText(credit.max_deposit_fen) }}
        </p>
      </div>
    </div>
  </aside>
</template>

<style scoped src="./workbench-tree-sidebar.css"></style>
