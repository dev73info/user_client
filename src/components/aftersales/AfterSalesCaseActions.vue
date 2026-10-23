<script setup lang="ts">
import type { AfterSalesCase, AfterSalesRespondAction } from '@/api/afterSales'

/**
 * 解除合作「在办案件」的动作区（R047 从 `components/AfterSalesModal.vue` 拆出）。
 *
 * 三组按钮各自独立成行、互不互斥：
 * - 表态（接受 / 不接受转平台裁决）：只有非发起人、案件可表态且本方还没表态时出现；
 * - 发起人收口（确认已落实 / 返工未落实转平台裁决）；
 * - 发起人撤回申请。
 *
 * 能不能点、点下去做什么仍由父级判断（`can*` 三个布尔量传进来），本组件只画并回抛动作。
 */
defineProps<{
  record: AfterSalesCase
  canRespond: boolean
  canComplete: boolean
  canReportUnfulfilled: boolean
  canWithdraw: boolean
  /** 正在表态 / 撤回的案件 id：命中时按钮转「提交中... / 撤回中...」并禁用。 */
  respondingId: number | null
  withdrawingId: number | null
}>()

const emit = defineEmits<{
  (e: 'respond', action: AfterSalesRespondAction): void
  (e: 'withdraw'): void
}>()
</script>

<template>
  <div v-if="canRespond" class="actions">
    <button
      class="ghost danger-plain"
      type="button"
      :disabled="respondingId === record.id"
      @click="emit('respond', 'reject')"
    >
      不接受，转平台裁决
    </button>
    <button
      class="ghost primary"
      type="button"
      :disabled="respondingId === record.id"
      @click="emit('respond', 'accept')"
    >
      {{ respondingId === record.id ? '提交中...' : '接受诉求' }}
    </button>
  </div>
  <div v-else-if="canComplete" class="actions">
    <button
      v-if="canReportUnfulfilled"
      class="ghost danger-plain"
      type="button"
      :disabled="respondingId === record.id"
      @click="emit('respond', 'unfulfilled')"
    >
      {{ respondingId === record.id ? '提交中...' : '未落实，申请平台介入' }}
    </button>
    <button
      class="ghost primary"
      type="button"
      :disabled="respondingId === record.id"
      @click="emit('respond', 'complete')"
    >
      {{ respondingId === record.id ? '提交中...' : '确认已落实' }}
    </button>
  </div>

  <!-- 发起人自己的收口动作：撤回申请。对方视角下这里不渲染任何按钮。 -->
  <div v-if="canWithdraw" class="actions">
    <button
      class="ghost danger-plain"
      type="button"
      :disabled="withdrawingId === record.id"
      @click="emit('withdraw')"
    >
      {{ withdrawingId === record.id ? '撤回中...' : '撤回申请' }}
    </button>
  </div>
</template>
