<script setup lang="ts">
/**
 * 发起积分打赏（基准稿：积分中心页内嵌卡片）。
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
}>()

const emit = defineEmits<{ (e: 'submit'): void; (e: 'cancel'): void }>()

const recipientRef = ref<InstanceType<typeof TInput> | null>(null)
const rootRef = ref<HTMLElement | null>(null)
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

/** 页头「发起积分打赏」滚动到这里后把焦点放进接收方输入框。 */
function focusRecipient() {
  recipientRef.value?.focus?.()
}

/** 滚动到卡片并把焦点放进接收方输入框。 */
function scrollToCard() {
  if (typeof rootRef.value?.scrollIntoView === 'function') {
    rootRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  focusRecipient()
}

defineExpose({ focusRecipient, scrollToCard })
</script>

<template>
  <section ref="rootRef" class="points-reward" aria-label="发起积分打赏">
    <header class="points-reward__head">
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

<style scoped>
.points-reward {
  padding: 20px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--73-ink) 5%, transparent);
}

.points-reward__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--73-border-soft);
}

.points-reward__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.points-reward__icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--73-accent-soft);
  color: var(--73-accent);
}

.points-reward__title h2 {
  margin: 0;
  color: var(--73-ink);
  font-size: 16px;
  font-weight: 600;
}

.points-reward__title p {
  margin: 2px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
}

.points-reward__risk {
  padding: 2px 8px;
  border: 1px solid var(--73-border);
  border-radius: 4px;
  background: var(--73-inset);
  color: var(--73-ink-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.points-reward__form {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(260px, 5fr);
  gap: 24px;
  padding-top: 16px;
}

.points-reward__fields {
  display: grid;
  gap: 14px;
  align-content: start;
}

.points-reward__field {
  display: grid;
  gap: 6px;
}

.points-reward__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.points-reward__label {
  color: var(--73-ink-soft);
  font-size: 12px;
  font-weight: 500;
}

.points-reward__label i {
  color: var(--73-danger);
  font-style: normal;
}

.points-reward__balance {
  color: var(--73-ink-muted);
  font-size: 12px;
}

.points-reward__at {
  color: var(--73-ink-placeholder);
  font-family: var(--73-font-family-mono);
}

.points-reward__quick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.points-reward__quick-btn {
  padding: 3px 10px;
  border: 1px solid var(--73-border);
  border-radius: 4px;
  background: var(--73-bg);
  color: var(--73-ink-soft);
  font-family: var(--73-font-family-mono);
  font-size: 11px;
  cursor: pointer;
  transition:
    color var(--73-transition),
    border-color var(--73-transition),
    background-color var(--73-transition);
}

.points-reward__quick-btn:hover {
  border-color: var(--73-border-hover);
  color: var(--73-ink);
}

.points-reward__quick-btn.is-active {
  border-color: var(--73-accent-line);
  background: var(--73-accent-soft);
  color: var(--73-accent);
  font-weight: 600;
}

.points-reward__textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface);
  color: var(--73-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
}

.points-reward__textarea:focus {
  border-color: var(--73-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--73-accent) 15%, transparent);
}

.points-reward__summary {
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--73-bg) 70%, var(--73-surface));
}

.points-reward__summary-title {
  color: var(--73-ink-soft);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.points-reward__calc {
  display: grid;
  gap: 10px;
  margin: 12px 0 0;
}

.points-reward__calc > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--73-ink-soft);
  font-size: 13px;
}

.points-reward__calc dd {
  margin: 0;
  font-family: var(--73-font-family-mono);
  font-weight: 600;
  color: var(--73-ink);
}

.points-reward__calc dd.is-fee {
  color: var(--73-danger);
  font-weight: 500;
}

.points-reward__calc-total {
  padding-top: 10px;
  border-top: 1px solid var(--73-border);
}

.points-reward__calc-total dt {
  color: var(--73-success-text);
}

.points-reward__calc-total dd {
  color: var(--73-success-text);
}

.points-reward__rule {
  margin: 14px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-surface);
  color: var(--73-ink-muted);
  font-size: 11px;
  line-height: 1.6;
}

.points-reward__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--73-border);
}

@media (max-width: 900px) {
  .points-reward__form {
    grid-template-columns: 1fr;
  }
}
</style>
