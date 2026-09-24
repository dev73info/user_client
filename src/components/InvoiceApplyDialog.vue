<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'

import {
  applyInvoices,
  getInvoiceSummary,
  type AppliedInvoices,
  type InvoiceableSummary,
  type InvoiceRecord,
} from '@/api/invoices'
import { useToast } from '@/composables/useToast'

/** 开票主体：平台服务费票由平台开给需求方，开发者收入票由乙方开给需求方。 */
type InvoiceSide = 'platform' | 'developer'

type InvoiceForm = {
  invoiceTitle: string
  taxNumber: string
  recipientEmail: string
}

const props = defineProps<{
  visible: boolean
  token: string
  requirementId: string
  /** 当前用户在本需求中的身份：需求方一次开出两张票，乙方只拿自己那张开发者收入票。 */
  role: 'customer' | 'developer'
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submitted: []
}>()

const { showToast } = useToast()

// 申请合并成一次动作、抬头只剩一份，草稿也跟着只剩一份。
const DRAFT_KEY = 'invoice_apply_draft_v1'

/** 两侧共用的抬头 / 税号 / 邮箱分别对应哪种票、由谁开具。 */
const COPY: Record<'customer' | 'developer', {
  kicker: string
  title: string
  issuer: string
  hint: string
  amountNote: string
  submitText: string
}> = {
  customer: {
    kicker: 'CUSTOMER / INVOICE',
    title: '获取发票',
    issuer: '平台票 + 开发者票',
    hint: '一次申请把本需求能开的票都开出来：平台服务费票由平台开具，开发者收入票由乙方开具，两张票共用这份抬头。',
    amountNote: '本次申请可开出的合计（平台服务费票 + 开发者收入票）',
    submitText: '提交开票申请',
  },
  developer: {
    kicker: 'DEVELOPER / INVOICE',
    title: '获取开发者发票',
    issuer: '开发者发票',
    hint: '开发者收入发票由乙方开具给需求方：抬头与税号按需求方实名主体带出，需求方为企业或个体工商户时税号必填；发票文件上传后需求方可在发票中心下载。',
    amountNote: '开发者收入（定金 + 尾款合并开票）',
    submitText: '提交开发者发票申请',
  },
}

const submitting = ref(false)
const summaryLoading = ref(false)
const summary = ref<InvoiceableSummary | null>(null)
const form = reactive<InvoiceForm>({ invoiceTitle: '', taxNumber: '', recipientEmail: '' })

const copy = computed(() => COPY[props.role])

/**
 * 可开票金额：本次申请能开出的合计票面。
 *
 * 需求方是「平台服务费票 + 开发者收入票」，乙方只有自己那一侧；已经开过（含审核中、已通过）的
 * 一侧不计入，被红冲的一侧会重新计入——所以两票都提交完之后这里会变成 0，也就提交不了第二次。
 */
const amountFen = computed(() => summary.value?.invoiceableTotalFen ?? 0)
const amountCny = computed(() => summary.value?.invoiceableTotalCny ?? '0.00')

/** 已经存在的发票记录：已提交过的一侧只展示进度，不重复申请。 */
const existingInvoices = computed<{ side: InvoiceSide; invoice: InvoiceRecord }[]>(() => {
  const records: { side: InvoiceSide; invoice: InvoiceRecord }[] = []
  if (summary.value?.platformInvoice) {
    records.push({ side: 'platform', invoice: summary.value.platformInvoice })
  }
  if (summary.value?.developerInvoice) {
    records.push({ side: 'developer', invoice: summary.value.developerInvoice })
  }
  return records
})

/** 需要红冲的记录：票面与已实际发生的净额不一致（售后退款 / 赔付已成立）。 */
const staleInvoices = computed(() => existingInvoices.value.filter((item) => item.invoice.reversalRequired))

/**
 * 本次申请会开出哪几张票。判定与后端一致（见 `apply_invoices`）：某一侧已经开过、或没有可开
 * 金额，就不在这次申请里；平台服务费票只有需求方能申请。
 */
const openSides = computed<InvoiceSide[]>(() => {
  const sides: InvoiceSide[] = []
  if (
    props.role === 'customer'
    && !summary.value?.platformInvoice
    && (summary.value?.platformFeeFen ?? 0) > 0
  ) {
    sides.push('platform')
  }
  if (!summary.value?.developerInvoice && (summary.value?.developerInvoiceFen ?? 0) > 0) {
    sides.push('developer')
  }
  return sides
})

function invoiceSideLabel(side: InvoiceSide) {
  return side === 'platform' ? '平台服务费发票' : '开发者服务收入发票'
}

function invoiceStatusLabel(status: InvoiceRecord['status']) {
  return {
    requested: '待处理',
    under_review: '审核中',
    approved: '已通过',
    rejected: '需补充材料',
    reversed: '已红冲',
  }[status]
}

/**
 * 开票信息预填：抬头 / 税号 / 接收邮箱**统一按买方（需求方）的实名主体**来。
 *
 * 两张票都是开给同一个需求方的，所以乙方打开弹窗时带出的也是需求方的资料，而不是乙方自己的
 * 公司名——「发票开给谁」不因为谁来申请而改变。这份主体由后端随汇总一起给出（见
 * `InvoiceBuyerSubject`），前端不再单独去查实名与账户资料，两个视角只有一处口径。
 */
const buyer = computed(() => summary.value?.buyer ?? null)

/** 买方在本视角下的称呼：需求方看自己，乙方看客户。文案里拼它，好让乙方一眼看出带出的是谁。 */
const buyerPrefix = computed(() => (props.role === 'customer' ? '' : '需求方'))

/** 买方是否企业 / 个体工商户：抬头取公司全称，且这一侧的税号必填。 */
const isOrganizationBuyer = computed(() => buyer.value?.isOrganization ?? false)

/** 企业 / 个体工商户买方申请时必须给税号：开发者票的这一项由后端强制校验，前端先挡一道。 */
const isTaxNumberRequired = computed(() =>
  isOrganizationBuyer.value && openSides.value.includes('developer'),
)

// 企业/个体户用公司全称，个人用实名姓名；实名未通过时后端给空串，这里就留给用户手填。
const prefillTitle = computed(() => buyer.value?.title ?? '')
const prefillTaxNumber = computed(() => buyer.value?.taxNumber ?? '')

/** 预填情况的说明：带出来了就说来源，没带出来是因为实名没过，提示手填。 */
const prefillHint = computed(() => {
  if (buyer.value?.title) {
    return props.role === 'customer'
      ? '抬头与税号已按本人实名主体自动填写，可修改。'
      : '抬头与税号已按需求方（客户）实名主体自动填写，可修改。'
  }
  if (!buyer.value) {
    return ''
  }
  return buyer.value.realnameStatus === 'pending'
    ? `${buyerPrefix.value}实名认证审核中，抬头与税号需手动填写。`
    : `${buyerPrefix.value}未完成实名认证，抬头与税号需手动填写。`
})

/** 预填没成功时才需要用户注意，用警示样式；自动带出只是说明，用弱化样式。 */
const prefillNeedsAttention = computed(() => !buyer.value?.title && !!buyer.value)

/** 只填充空字段，绝不覆盖用户输入或已保存的草稿。必须在 restoreDraft 之后调用。 */
function applyPrefill() {
  if (!form.invoiceTitle.trim() && prefillTitle.value) {
    form.invoiceTitle = prefillTitle.value
  }
  if (!form.taxNumber.trim() && prefillTaxNumber.value) {
    form.taxNumber = prefillTaxNumber.value
  }
  if (!form.recipientEmail.trim() && buyer.value?.email) {
    form.recipientEmail = buyer.value.email
  }
}

/** 抬头与实名主体不一致时给出提醒文案；一致或无从比对时返回空串。 */
function invoiceTitleNotice(title: string) {
  const expected = prefillTitle.value
  const trimmed = title.trim()
  if (expected && trimmed && trimmed !== expected) {
    return `发票抬头与${buyerPrefix.value}实名主体「${expected}」不一致，请确认无误`
  }
  return ''
}

function restoreDraft() {
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) {
    return
  }
  try {
    const draft = JSON.parse(raw) as Partial<InvoiceForm>
    if (!form.invoiceTitle.trim()) {
      form.invoiceTitle = draft.invoiceTitle ?? ''
    }
    if (!form.taxNumber.trim()) {
      form.taxNumber = draft.taxNumber ?? ''
    }
    if (!form.recipientEmail.trim()) {
      form.recipientEmail = draft.recipientEmail ?? ''
    }
  } catch {
    localStorage.removeItem(DRAFT_KEY)
  }
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
  showToast('草稿已保存', 'success')
}

/** 拉取本需求的合并开票汇总：金额由后端按已成功分账的结算单算出，买方主体也随它一起回来。 */
async function ensureSummary() {
  if (summaryLoading.value || !props.token || !props.requirementId) {
    return
  }
  summaryLoading.value = true
  try {
    summary.value = await getInvoiceSummary(props.token, props.requirementId)
    // 拿到买方主体就补齐还空着的字段：只填空字段，用户已经手填或草稿里存过的都不动。
    applyPrefill()
  } catch (error) {
    summary.value = null
    showToast(error instanceof Error ? error.message : '加载可开票金额失败', 'error')
  } finally {
    summaryLoading.value = false
  }
}

function close() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
  emit('update:visible', false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
  }
}

/** 本次申请真正新建了哪几张票：申请前没有、响应里有，才算新建（已开过的原票会被回放）。 */
function createdSides(applied: AppliedInvoices): InvoiceSide[] {
  const sides: InvoiceSide[] = []
  if (applied.platformInvoice && !summary.value?.platformInvoice) {
    sides.push('platform')
  }
  if (applied.developerInvoice && !summary.value?.developerInvoice) {
    sides.push('developer')
  }
  return sides
}

function createdToast(sides: InvoiceSide[]) {
  if (sides.length > 1) {
    return '平台发票与开发者发票申请已提交，到发票中心可查看进度'
  }
  if (sides[0] === 'platform') {
    return '平台发票申请已提交，到发票中心可查看进度'
  }
  if (sides[0] === 'developer') {
    return '开发者发票申请已提交，乙方上传发票文件后可在发票中心下载'
  }
  // 两侧都只是回放（并发下来别人刚申请过）：不谎报新建，只提示进度已经在这里了。
  return '本需求的开票申请已提交，到发票中心可查看进度'
}

async function submit() {
  if (!form.invoiceTitle.trim()) {
    showToast('请填写发票抬头', 'warning')
    return
  }
  if (amountFen.value <= 0) {
    showToast('本需求暂无可开票的已结算金额', 'warning')
    return
  }
  if (isTaxNumberRequired.value && !form.taxNumber.trim()) {
    showToast(`${buyerPrefix.value}实名主体为企业或个体工商户，请填写税号`, 'warning')
    return
  }
  const notice = invoiceTitleNotice(form.invoiceTitle)
  submitting.value = true
  try {
    const applied = await applyInvoices(props.token, {
      requirement_id: props.requirementId,
      invoice_title: form.invoiceTitle.trim(),
      tax_number: form.taxNumber.trim(),
      recipient_email: form.recipientEmail.trim(),
    })
    form.invoiceTitle = ''
    form.taxNumber = ''
    form.recipientEmail = ''
    localStorage.removeItem(DRAFT_KEY)
    emit('update:visible', false)
    emit('submitted')
    showToast(notice || createdToast(createdSides(applied)), notice ? 'warning' : 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交开票申请失败', 'error')
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      // 先恢复草稿再用已缓存的汇总补空字段；汇总回来后会再补一次（见 `ensureSummary`）。
      restoreDraft()
      applyPrefill()
      void ensureSummary()
      document.addEventListener('keydown', handleKeydown)
    } else {
      document.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="invoice-modal-overlay" @click.self="close">
      <article class="invoice-panel invoice-modal" role="dialog" aria-modal="true" :aria-label="copy.title">
        <div class="invoice-panel__head invoice-modal__head">
          <div>
            <span class="invoice-panel__kicker">{{ copy.kicker }}</span>
            <h2>{{ copy.title }}</h2>
          </div>
          <strong>{{ copy.issuer }}</strong>
          <button class="invoice-modal__close" type="button" aria-label="关闭" @click="close">×</button>
        </div>

        <p class="invoice-panel__hint">{{ copy.hint }}</p>
        <p v-if="prefillHint"
          :class="prefillNeedsAttention ? 'invoice-panel__notice' : 'invoice-panel__prefill'">
          {{ prefillHint }}
        </p>

        <div class="invoice-amount" aria-live="polite">
          <span class="invoice-amount__label">可开票金额</span>
          <strong class="invoice-amount__value">
            {{ summaryLoading ? '加载中…' : `¥${amountCny}` }}
          </strong>
          <small class="invoice-amount__note">{{ copy.amountNote }}</small>
          <small v-if="summary" class="invoice-amount__note">
            本需求已成功结算合计 ¥{{ summary.settledAmountCny }}（平台服务费 ¥{{ summary.platformFeeCny }} +
            开发者收入 ¥{{ summary.developerGrossAmountCny }}）
          </small>
          <small v-if="summary && openSides.length > 1" class="invoice-amount__note">
            本次申请一次开出两张：平台服务费票 ¥{{ summary.platformFeeCny }} + 开发者收入票 ¥{{ summary.developerInvoiceCny }}
          </small>
          <small v-if="summary && summary.developerPayoutFen > 0" class="invoice-amount__note">
            其中开发者已退还 / 赔付客户 ¥{{ summary.developerPayoutCny }}，开发者票按净额 ¥{{ summary.developerInvoiceCny }} 开具；平台服务费未退，平台票不受影响。
          </small>
        </div>
        <p v-if="summary && summary.pendingRefundFen > 0" class="invoice-panel__notice">
          本需求有未结案的退款诉求 ¥{{ summary.pendingRefundCny }}（退还还没走完）：
          开发者票已按扣除这笔诉求后的净额 ¥{{ summary.developerInvoiceCny }} 计算——钱还没退出去，
          不能算进已经发生的销售额。诉求判不成立或撤回时，差额再补开；平台服务费不随退款减免。
        </p>
        <p v-for="item in existingInvoices" :key="item.invoice.id" class="invoice-panel__notice">
          {{ invoiceSideLabel(item.side) }}已提交（{{ invoiceStatusLabel(item.invoice.status) }} · 票面 ¥{{ item.invoice.amountCny }}），到发票中心可查看进度与发票文件。
        </p>
        <p v-for="item in staleInvoices" :key="`stale-${item.invoice.id}`" class="invoice-panel__notice">
          原票开具后本需求实际发生的净额变了（售后退款 / 赔付已成立）：{{ invoiceSideLabel(item.side) }}
          需要红冲后重开。财务端已列为「待红冲」，红冲完成后这里就能按最新净额重新申请，无需另行申请改写。
        </p>
        <p v-if="!summaryLoading && summary && amountFen <= 0" class="invoice-panel__hint">
          本需求暂无可开票金额：要么还没有成功分账的结算（未结案的退款诉求会先扣掉这部分），
          要么能开的票都已经提交过了。
        </p>
        <label>
          发票抬头
          <input v-model="form.invoiceTitle" type="text" maxlength="200" placeholder="个人姓名、个体户或企业名称" />
        </label>
        <label>
          税号
          <input v-model="form.taxNumber" type="text" maxlength="64"
            :placeholder="isOrganizationBuyer ? '企业或个体工商户必填' : '个人开票可不填'" />
        </label>
        <label>
          接收邮箱（可选）
          <input v-model="form.recipientEmail" type="email" maxlength="254" placeholder="用于接收开票文件" />
        </label>

        <div class="invoice-modal__actions">
          <button class="invoice-modal__draft" type="button" @click="saveDraft">保存草稿</button>
          <button class="invoice-panel__submit" type="button"
            :disabled="submitting || amountFen <= 0" @click="submit">
            {{ submitting ? '提交中...' : copy.submitText }}
          </button>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<style scoped>
.invoice-panel {
  display: grid;
  gap: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 18px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.invoice-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.invoice-panel__kicker {
  color: #247f7d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.invoice-panel h2 {
  margin: 4px 0 0;
}

.invoice-panel__head strong {
  color: #b26b1c;
  font-size: 13px;
}

.invoice-panel__hint {
  color: #667085;
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

.invoice-panel__notice {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fffaeb;
  color: #9a6700;
  font-size: 12px;
  line-height: 1.6;
}

/* 自动预填的说明：只是交代抬头/税号从哪来，不抢警示色的注意力。 */
.invoice-panel__prefill {
  margin: 0;
  color: #667085;
  font-size: 12px;
  line-height: 1.6;
}

/* 可开票金额：申请合并成一次动作后它是弹窗里唯一的主角，单独一块摆出来，
   下面几行小字分别是「这笔钱要开成哪几张票」与「本需求结算合计的拆解」。 */
.invoice-amount {
  display: grid;
  gap: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
  background: #f8fafc;
}

.invoice-amount__label {
  color: #667085;
  font-size: 12px;
  font-weight: 700;
}

.invoice-amount__value {
  color: #172033;
  font-size: 24px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.invoice-amount__note {
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.5;
}

.invoice-panel__submit {
  border: 0;
  border-radius: 8px;
  padding: 9px 14px;
  background: #247f7d;
  color: #fff;
  cursor: pointer;
}

.invoice-panel__submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.invoice-panel label {
  display: grid;
  gap: 6px;
  color: #344054;
  font-size: 13px;
  font-weight: 700;
}

.invoice-panel input {
  width: 100%;
  min-height: 40px;
  box-sizing: border-box;
  border: 1px solid #d0d5dd;
  border-radius: 7px;
  padding: 8px 10px;
  color: #172033;
  background: #fff;
  font-family: inherit;
  font-size: 14px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.invoice-panel input::placeholder {
  color: #98a2b3;
}

.invoice-panel input:hover {
  border-color: #b7c0cd;
}

.invoice-panel input:focus {
  outline: none;
  border-color: #247f7d;
  box-shadow: 0 0 0 3px rgba(36, 127, 125, 0.14);
}

/* 弹窗遮罩与内容 */
.invoice-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.45);
}

.invoice-modal {
  position: relative;
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
}

.invoice-modal__head {
  padding-right: 28px;
}

.invoice-modal__close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #667085;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.invoice-modal__close:hover {
  background: #f2f4f7;
  color: #172033;
}

.invoice-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}

.invoice-modal__draft {
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  padding: 9px 14px;
  background: #fff;
  color: #344054;
  cursor: pointer;
}

.invoice-modal__draft:hover {
  background: #f2f4f7;
}
</style>
