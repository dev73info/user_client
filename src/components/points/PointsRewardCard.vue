<script setup lang="ts">
/**
 * 发起积分打赏（我的积分弹窗里的表单）。
 *
 * 表单字段与提交都沿用 `usePointsTransfer`：这里只负责版式、快捷金额与实时结算账单。
 * 打赏不可逆与人工风控阈值来自后端 `TransferMetaResponse`，不在前端自造规则。
 */
import { computed, ref } from 'vue'
import { Promotion, TButton, TIcon, TInput, TInputNumber } from 'ui_73info'

import { pointsTransferFee, pointsTransferReceived } from '@/shared/pointsDisplay'

const to = defineModel<string>('to', { required: true })
const amount = defineModel<number | null>('amount', { required: true })
const note = defineModel<string>('note', { required: true })

const props = defineProps<{
  balance: number
  feeRate: number | null
  dailyCap: number | null
  manualThreshold: number | null
  saving: boolean
  /** 弹窗形态：纸壳归弹窗，卡片退成纯排版 */
  flat?: boolean
  /** 弹窗标题已经写着「发起积分打赏」，卡头不再重复一遍 */
  hideHead?: boolean
}>()

const emit = defineEmits<{ (e: 'submit'): void; (e: 'cancel'): void }>()

const recipientRef = ref<InstanceType<typeof TInput> | null>(null)
const quickAmounts = [50, 100, 200, 500]

const fee = computed(() => pointsTransferFee(amount.value, props.feeRate ?? 0))
const received = computed(() => pointsTransferReceived(amount.value, props.feeRate ?? 0))

const ruleLines = computed(() => {
  const lines: string[] = ['打赏操作一经发起不可逆转。']
  if (props.dailyCap) {
    lines.push(`单日打赏上限 ${props.dailyCap} PTS。`)
  }
  if (props.manualThreshold) {
    lines.push(`单日累计打赏超过 ${props.manualThreshold} PTS 将自动移交人工风控审核。`)
  }
  return lines
})

function pickAmount(value: number) {
  amount.value = value
}

/** 弹窗打开后把焦点放进接收方输入框。 */
function focusRecipient() {
  recipientRef.value?.focus?.()
}

defineExpose({ focusRecipient })
</script>

<template>
  <section class="points-reward" :class="{ 'points-reward--flat': flat }" aria-label="发起积分打赏">
    <header v-if="!hideHead" class="points-reward__head">
      <div class="points-reward__title">
        <span class="points-reward__icon" aria-hidden="true">
          <TIcon :size="18"><Promotion /></TIcon>
        </span>
        <div>
          <h2>发起积分打赏</h2>
          <p>对为您解答技术疑问、贡献高质量代码的开发者进行积分致谢</p>
        </div>
      </div>
      <span class="points-reward__risk">安全风控防刷机制生效中</span>
    </header>

    <form class="points-reward__form" @submit.prevent="emit('submit')">
      <div class="points-reward__fields">
        <label class="points-reward__field">
          <span class="points-reward__label">受赠用户名 <i>*</i></span>
          <TInput
            ref="recipientRef"
            v-model="to"
            aria-label="接收方用户名"
            placeholder="请输入接收方用户名"
            clearable
          >
            <template #prefix><span class="points-reward__at">@</span></template>
          </TInput>
        </label>

        <label class="points-reward__field">
          <span class="points-reward__label-row">
            <span class="points-reward__label">打赏积分数值 <i>*</i></span>
            <span class="points-reward__balance">可用余额: {{ balance }} PTS</span>
          </span>
          <TInputNumber
            v-model="amount"
            :min="1"
            :precision="0"
            aria-label="打赏金额"
            placeholder="请输入打赏积分"
            class="points-reward__amount"
          />
        </label>

        <div class="points-reward__quick">
          <button
            v-for="value in quickAmounts"
            :key="value"
            type="button"
            class="points-reward__quick-btn"
            :class="{ 'is-active': amount === value }"
            @click="pickAmount(value)"
          >
            {{ value }} PTS
          </button>
        </div>

        <label class="points-reward__field">
          <span class="points-reward__label">打赏附言（可选）</span>
          <textarea
            v-model="note"
            class="points-reward__textarea"
            rows="3"
            maxlength="200"
            aria-label="打赏附言"
            placeholder="例如：感谢在 RenderDragon 管线上的技术解答！"
          ></textarea>
        </label>
      </div>

      <aside class="points-reward__summary">
        <span class="points-reward__summary-title">实时结算核算账单</span>
        <dl class="points-reward__calc">
          <div>
            <dt>预计打赏额度</dt>
            <dd>{{ amount ?? 0 }} PTS</dd>
          </div>
          <div>
            <dt>平台技术手续费（{{ feeRate ?? 0 }}%）</dt>
            <dd class="is-fee">{{ fee }} PTS</dd>
          </div>
          <div class="points-reward__calc-total">
            <dt>对方实际到账</dt>
            <dd>{{ received }} PTS</dd>
          </div>
        </dl>

        <p class="points-reward__rule">
          {{ ruleLines.join('') }}
        </p>

        <div class="points-reward__actions">
          <TButton variant="outline" type="button" @click="emit('cancel')">取消</TButton>
          <TButton
            variant="solid"
            tone="accent"
            type="button"
            :loading="saving"
            @click="emit('submit')"
            >确认打赏</TButton
          >
        </div>
      </aside>
    </form>
  </section>
</template>

<style scoped src="./points-reward-card.css"></style>
