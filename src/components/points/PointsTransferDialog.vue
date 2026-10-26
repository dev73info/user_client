<script setup lang="ts">
import { computed } from 'vue'
import { TButton, TDialog, TInput, TInputNumber } from 'ui_73info'

import { pointsTransferFee, pointsTransferReceived } from '@/shared/pointsDisplay'

const open = defineModel<boolean>('open', { required: true })
const to = defineModel<string>('to', { required: true })
const amount = defineModel<number | null>('amount', { required: true })
const note = defineModel<string>('note', { required: true })
const props = defineProps<{
  saving: boolean
  feeRate: number | null
}>()
const emit = defineEmits<{ (e: 'submit'): void; (e: 'closed'): void }>()
const fee = computed(() => pointsTransferFee(amount.value, props.feeRate ?? 0))
const received = computed(() => pointsTransferReceived(amount.value, props.feeRate ?? 0))
</script>

<template>
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
      <p v-if="feeRate !== null && amount && amount > 0" class="transfer-preview">
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
  .transfer-form {
    grid-template-columns: 1fr;
  }
}
</style>
