<script setup lang="ts">
/**
 * 保证金提现弹窗：把押金按原路退回原支付账户。
 *
 * 表单与提交在 `useDevDepositWithdrawForm`（校验复用 `validateDevWithdrawalRequest`，
 * `source: 'developer_order_deposit'` 只允许 Adapay 原路退回），本组件只负责画表单与开窗句柄。
 *
 * 提交成功后只 `emit('submitted')`：回刷由页面决定（页面走静默后台刷新，表格不再闪遮罩）。
 * 样式复用全局的 `.dev-dialog`（styles/dev-base.css）与 `.dev-wallet-withdraw__*`（styles/dev-wallet.css）。
 */
import { useDevDepositWithdrawForm } from '@/composables/useDevDepositWithdrawForm'
import { money } from '@/shared/devFundDisplay'
import {
  MAX_WITHDRAW_CNY,
  MIN_WITHDRAW_CNY,
  WITHDRAW_NOTE_MAX_LEN,
} from '@/shared/devWalletDisplay'

import { TButton, TDialog, TForm, TFormItem, TInput, TInputNumber } from 'ui_73info'

const props = defineProps<{
  /** 可提现保证金：首行读数，也是金额上限与校验口径 */
  withdrawable: number
}>()

const emit = defineEmits<{
  /** 已提交成功，调用方自行回刷余额与台账 */
  submitted: []
}>()

const { visible, submitting, error, form, open, submit } = useDevDepositWithdrawForm(
  () => props.withdrawable,
)

async function handleSubmit() {
  if (await submit()) {
    emit('submitted')
  }
}

defineExpose({ open })
</script>

<template>
  <TDialog v-model:open="visible" title="保证金提现" width="520px" class="dev-dialog">
    <TForm label-position="top">
      <TFormItem label="可提现保证金">
        <div class="dev-figure dev-figure--sm">{{ money(props.withdrawable) }}</div>
      </TFormItem>
      <TFormItem label="提现金额" required>
        <TInputNumber
          v-model="form.amount_cny"
          :min="MIN_WITHDRAW_CNY"
          :max="MAX_WITHDRAW_CNY"
          :precision="2"
          :step="0.01"
          placeholder="提现金额"
          style="width: 100%"
        />
        <div class="dev-wallet-withdraw__note">
          可提现 {{ money(MIN_WITHDRAW_CNY) }} 至
          {{ money(MAX_WITHDRAW_CNY) }}，最多保留两位小数，不能超过可提现保证金余额。
        </div>
      </TFormItem>
      <TFormItem label="退回方式">
        <div class="dev-wallet-withdraw__note">
          充值 360 天内原路退回；超过 360 天的部分，分账至付款人账户后提现至其收款银行卡。
        </div>
        <p v-if="error" role="alert">{{ error }}</p>
      </TFormItem>
      <TFormItem label="申请备注">
        <TInput
          show-count
          v-model="form.note"
          type="textarea"
          :rows="3"
          :maxlength="WITHDRAW_NOTE_MAX_LEN"
          placeholder="可选"
        />
      </TFormItem>
    </TForm>
    <template #footer>
      <TButton @click="visible = false">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="handleSubmit"
        >提交申请</TButton
      >
    </template>
  </TDialog>
</template>
