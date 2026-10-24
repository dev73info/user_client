<script setup lang="ts">
/**
 * 积分打赏弹窗：接收方 + 金额 + 附言，带到账 / 手续费的即时预览。
 *
 * 打赏表单不再常驻占一屏：入口在「积分记录」卡头右侧，表单收在弹窗里。
 * 组件只负责表单与预览，校验与提交在 `usePointsTransfer` 里（提交成功由那边关弹窗）。
 */
import { computed } from 'vue'
import { TButton, TDialog, TInput, TInputNumber } from 'ui_73info'

import { pointsTransferFee, pointsTransferReceived } from '@/shared/pointsDisplay'

const open = defineModel<boolean>('open', { required: true })
const to = defineModel<string>('to', { required: true })
const amount = defineModel<number | null>('amount', { required: true })
const note = defineModel<string>('note', { required: true })

const props = defineProps<{
  saving: boolean
  /** 手续费率（百分比）：来自 `/points/transfer/meta`，取不到时按 0 展示。 */
  feeRate: number
}>()

const emit = defineEmits<{
  (e: 'submit'): void
  (e: 'closed'): void
}>()

const fee = computed(() => pointsTransferFee(amount.value, props.feeRate))
const received = computed(() => pointsTransferReceived(amount.value, props.feeRate))
</script>

<template>
  <!-- 打赏弹窗会被 TDialog teleport 到 body，落在 .profile-page 之外，
       必须自己挂统一层的 wb-dialog，否则弹窗里的主色退回库的默认档。 -->
  <TDialog
    v-model:open="open"
    title="积分打赏"
    width="520px"
    class="wb-dialog points-transfer-dialog"
    @closed="emit('closed')"
  >
    <div class="transfer-form">
      <TInput v-model="to" placeholder="接收方用户名" clearable aria-label="接收方用户名" />
      <TInputNumber
        v-model="amount"
        :min="1"
        :precision="0"
        placeholder="打赏金额"
        class="transfer-form__amount"
        aria-label="打赏金额"
      />
      <TInput v-model="note" placeholder="附言（可选）" clearable aria-label="打赏附言" />
      <p v-if="amount && amount > 0" class="transfer-preview">
        接收方到账 <strong>{{ received }}</strong> 积分 · 手续费 <strong>{{ fee }}</strong> 积分
      </p>
    </div>

    <template #footer>
      <TButton variant="solid" tone="accent" :loading="saving" @click="emit('submit')"
        >打赏</TButton
      >
    </template>
  </TDialog>
</template>

<style scoped>
/* 表单搬进 520px 宽的弹窗后，两列栅格按弹窗内的可用宽度写：
   第一行接收方占满，第二行金额与附言各半。 */
.transfer-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.transfer-form > .transfer-preview {
  grid-column: 1 / -1;
}

.transfer-preview {
  margin: 0;
  padding: 12px 14px;
  border: 1px dashed var(--wb-accent-line);
  border-radius: var(--wb-radius-item);
  background: var(--wb-accent-soft);
  color: var(--wb-ink-soft);
  font-size: 13px;
}

.transfer-preview strong {
  color: var(--wb-accent);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  /* 弹窗在 640px 以下被 dev-responsive.css 收成 92vw，两列会挤成两个窄条，改单列 */
  .transfer-form {
    grid-template-columns: 1fr;
  }
}
</style>
