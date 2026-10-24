<script setup lang="ts">
import KeyTermsNotice from '@/components/legal/KeyTermsNotice.vue'

/**
 * 平台协议签署前的重要条款提示与二次确认（R043 任务-03）。
 *
 * 平台协议（开发者入驻协议 / 接口使用协议）里平台是当事人，所以要在发起签署前单独
 * 提示重要条款并要求确认。**需求合同不使用本组件**：那是甲乙双方之间的合同，
 * 平台不是当事人，不该在别人的合同签署流程里加平台自己的提示——是否展示由视图判定，
 * 这里只吃 props、只发 emit。
 */
defineProps<{
  /** 平台协议对应的模版 code（留痕与提示取正文都用它）。 */
  code: string
  /** 是否展示：视图按「平台协议 + 可签」判定后传入。 */
  show: boolean
}>()

/** 勾选状态走 `v-model:accepted`，状态本身留在 `useContractSign`（留痕要用）。 */
const accepted = defineModel<boolean>('accepted', { required: true })

const emit = defineEmits<{
  /** 提示组件读到的协议版本号（签署留痕的 `notice_version`）。 */
  loaded: [payload: { version: string; effective_at: string }]
}>()
</script>

<template>
  <div v-if="show" class="contract-notice">
    <KeyTermsNotice :code="code" @loaded="emit('loaded', $event)" />
    <label class="notice-toggle">
      <input
        type="checkbox"
        :checked="accepted"
        data-testid="platform-agreement-notice-check"
        @change="accepted = ($event.target as HTMLInputElement).checked"
      />
      <span>我已阅读并理解上述重要条款提示</span>
    </label>
  </div>
</template>

<style scoped>
/* 色值走 `--73-*` 令牌，与签署面板里的「短信通知签署」同一套勾选样式（不新增裸色值）。 */
.contract-notice {
  margin-bottom: 1rem;
}

.notice-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--73-ink-soft);
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
}

.notice-toggle input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--73-warning);
}
</style>
