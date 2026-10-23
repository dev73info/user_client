<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { sellerRefundResourcePurchase, type ResourcePurchaseOrder } from '@/api/resourcePurchase'
import {
  fenToYuanText,
  formatPurchaseAmountLabel,
  parseYuanPriceInput,
} from '@/shared/resourceSale'

import { TButton, TDialog, TForm, TFormItem, TInput, TInputNumber, TMessage } from 'ui_73info'

/**
 * 卖家「主动退款」弹窗：第一步填金额与原因，第二步在本弹窗内确认
 * （说明退款后买家失去下载权、资金原路退回）。
 *
 * 两步确认不用 `TMessageBox.confirm` 叠在 `TDialog` 上：两层浮层各自装聚焦陷阱，
 * 叠在一起会互相抢焦点、控制台刷 `RangeError: Maximum call stack size exceeded`
 * （ui_73info 的已知问题）。改成本弹窗内的第二步，确认信息与风险提示都在同一层浮层里。
 *
 * 页面通过暴露的 `open(order)` 按行拉起，退款成功后 emit `updated`，由页面把那一行换掉。
 */
const props = defineProps<{
  token: string
}>()

const emit = defineEmits<{
  updated: [order: ResourcePurchaseOrder]
}>()

const refundTarget = ref<ResourcePurchaseOrder | null>(null)
const refundDialogVisible = ref(false)
const submittingRefund = ref(false)
const refundError = ref('')
const refundStep = ref<'form' | 'confirm'>('form')
const refundForm = reactive({
  /** 退款金额（元），缺省为可退全额 */
  amountYuan: 0,
  reason: '',
})

const refundAmountLimitYuan = computed(() =>
  refundTarget.value ? Number((refundTarget.value.refundable_amount_fen / 100).toFixed(2)) : 0,
)

/** 待提交的退款金额（分）；在进入确认步时定下来，确认页与提交用同一个数。 */
const pendingRefundAmountFen = ref(0)

const refundDialogTitle = computed(() =>
  refundStep.value === 'confirm' ? '确认发起退款' : '主动退款',
)

/** 待退金额是否等于剩余可退余额（全额）——决定确认步文案与成功提示。 */
const isFullRefundPending = computed(
  () => pendingRefundAmountFen.value >= (refundTarget.value?.refundable_amount_fen ?? 0),
)

function open(order: ResourcePurchaseOrder) {
  refundTarget.value = order
  refundForm.amountYuan = Number((order.refundable_amount_fen / 100).toFixed(2))
  refundForm.reason = ''
  refundError.value = ''
  refundStep.value = 'form'
  pendingRefundAmountFen.value = 0
  refundDialogVisible.value = true
}

function closeRefundDialog() {
  if (submittingRefund.value) {
    return
  }
  refundDialogVisible.value = false
  refundTarget.value = null
  refundStep.value = 'form'
}

/** 金额校验：> 0、不超过可退余额，最多两位小数。返回 null 表示不通过（已写 refundError）。 */
function resolveRefundAmountFen(): number | null {
  const parsed = parseYuanPriceInput(refundForm.amountYuan)
  if (!parsed.ok) {
    refundError.value = parsed.message
    return null
  }
  if (parsed.fen <= 0) {
    refundError.value = '退款金额必须大于 0'
    return null
  }
  if (parsed.fen > (refundTarget.value?.refundable_amount_fen ?? 0)) {
    refundError.value = `退款金额不能超过可退余额 ¥${fenToYuanText(refundTarget.value?.refundable_amount_fen ?? 0)}`
    return null
  }
  return parsed.fen
}

/** 第一步：校验金额与原因，通过后进入确认步（这一步还不调接口）。 */
function goToRefundConfirm() {
  if (!refundTarget.value) {
    return
  }
  refundError.value = ''

  const reason = refundForm.reason.trim()
  if (!reason) {
    refundError.value = '退款原因必填'
    return
  }
  if (reason.length > 200) {
    refundError.value = '退款原因不能超过 200 字'
    return
  }
  const amountFen = resolveRefundAmountFen()
  if (amountFen == null) {
    return
  }
  pendingRefundAmountFen.value = amountFen
  refundStep.value = 'confirm'
}

/** 第二步：确认后提交渠道。 */
async function submitRefund() {
  const order = refundTarget.value
  if (!order) {
    return
  }
  if (!props.token.trim()) {
    return
  }
  refundError.value = ''

  const reason = refundForm.reason.trim()
  const amountFen = pendingRefundAmountFen.value
  if (!reason || amountFen <= 0) {
    refundStep.value = 'form'
    refundError.value = !reason ? '退款原因必填' : '退款金额必须大于 0'
    return
  }

  const isFullRefund = amountFen >= order.refundable_amount_fen

  submittingRefund.value = true
  try {
    const updated = await sellerRefundResourcePurchase(props.token, order.order_no, {
      reason,
      amount_fen: amountFen,
    })
    emit('updated', updated)
    refundDialogVisible.value = false
    refundTarget.value = null
    refundStep.value = 'form'
    TMessage.success(
      isFullRefund ? '已全额退款，买家下载权已收回' : '已完成部分退款，买家下载权已收回',
    )
  } catch (error) {
    refundError.value = error instanceof Error ? error.message : '发起退款失败'
    refundStep.value = 'form'
    TMessage.error(refundError.value)
  } finally {
    submittingRefund.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <TDialog
    v-model:open="refundDialogVisible"
    :title="refundDialogTitle"
    width="560px"
    class="dev-dialog"
    @close="closeRefundDialog"
  >
    <div v-if="refundTarget" class="sold-purchases__refund">
      <p class="sold-purchases__refund-summary">
        订单 {{ refundTarget.order_no }} · 买家 {{ refundTarget.buyer }} ·
        {{ formatPurchaseAmountLabel(refundTarget) }}
      </p>
      <p class="sold-purchases__refund-warning" role="note">
        退款后买家将失去该资源的下载权，资金按原支付通道原路退回，本操作不可撤销。
      </p>

      <TForm v-if="refundStep === 'form'" label-position="top">
        <TFormItem label="可退余额">
          <div class="sold-purchases__amount">
            ¥{{ fenToYuanText(refundTarget.refundable_amount_fen) }}
          </div>
        </TFormItem>
        <TFormItem label="退款金额（元）" required>
          <TInputNumber
            v-model="refundForm.amountYuan"
            :min="0.01"
            :max="refundAmountLimitYuan"
            :precision="2"
            :step="0.01"
            placeholder="退款金额"
            style="width: 100%"
          />
          <div class="sold-purchases__meta">
            默认全额 ¥{{
              fenToYuanText(refundTarget.refundable_amount_fen)
            }}；改为更小的金额即部分退款，退款后订单仍为已支付但下载权已被收回。
          </div>
        </TFormItem>
        <TFormItem label="退款原因" required>
          <TInput
            v-model="refundForm.reason"
            type="textarea"
            :rows="3"
            :maxlength="200"
            placeholder="必填，例如：资源内容有误 / 买家协商一致 / 误标价"
          />
          <div class="sold-purchases__meta">{{ refundForm.reason.length }} / 200 字</div>
        </TFormItem>
      </TForm>

      <div v-else class="sold-purchases__confirm">
        <dl class="sold-purchases__confirm-list">
          <div>
            <dt>退款金额</dt>
            <dd class="sold-purchases__amount">¥{{ fenToYuanText(pendingRefundAmountFen) }}</dd>
          </div>
          <div>
            <dt>退款类型</dt>
            <dd>{{ isFullRefundPending ? '全额退款' : '部分退款' }}</dd>
          </div>
          <div>
            <dt>退款原因</dt>
            <dd>{{ refundForm.reason.trim() }}</dd>
          </div>
        </dl>
        <p class="sold-purchases__meta">
          {{
            isFullRefundPending
              ? '该笔退款后订单将变为「已退款」。'
              : `该笔退款后订单仍为「已支付」，剩余可退 ¥${fenToYuanText(
                  refundTarget.refundable_amount_fen - pendingRefundAmountFen,
                )}，买家下载权即刻收回。`
          }}
        </p>
      </div>
    </div>

    <template #footer>
      <p v-if="refundError" class="sold-purchases__refund-error" role="alert">{{ refundError }}</p>
      <template v-if="refundStep === 'form'">
        <TButton :disabled="submittingRefund" @click="closeRefundDialog">取消</TButton>
        <TButton variant="solid" tone="accent" @click="goToRefundConfirm">确认退款</TButton>
      </template>
      <template v-else>
        <TButton :disabled="submittingRefund" @click="refundStep = 'form'">再想想</TButton>
        <TButton variant="solid" tone="accent" :loading="submittingRefund" @click="submitRefund">
          确认退款
        </TButton>
      </template>
    </template>
  </TDialog>
</template>

<style scoped src="./sold-purchases-refund-dialog.css"></style>
<style scoped src="./sold-purchases-shared.css"></style>
