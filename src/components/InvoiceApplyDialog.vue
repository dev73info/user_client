<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'

import {
  getInvoiceSummary,
  requestDeveloperInvoice,
  requestPlatformInvoice,
  type InvoiceableSummary,
  type InvoiceRecord,
} from '@/api/invoices'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
import { getProfile } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

/** 开票主体：平台服务费发票由需求方获取，开发者收入发票由乙方开具、需求方也能索取。 */
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
  /** 当前用户在本需求中的身份，决定默认选中哪一侧开票主体。 */
  role: 'customer' | 'developer'
  /**
   * 打开时预选的开票主体。不传时按 `role` 取默认值。
   *
   * 发票中心在「原票被红冲后重新申请」时用它落到被红冲的那一侧：那张票是哪一侧的就该重开哪一侧。
   * 与 `role` 冲突时（平台票只有需求方能申请）调用方负责不传，这里不做兜底判断。
   */
  initialSide?: InvoiceSide
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submitted: []
}>()

const auth = useAuthStore()
const { showToast } = useToast()

// 草稿按开票主体分开存，跨刷新保留（key 与迁移前一致，旧草稿仍能读到）。
const DRAFT_KEYS: Record<InvoiceSide, string> = {
  platform: 'invoice_platform_draft_v1',
  developer: 'invoice_developer_draft_v1',
}

const SIDE_TABS: { value: InvoiceSide; label: string }[] = [
  { value: 'platform', label: '获取发票' },
  { value: 'developer', label: '获取开发者发票' },
]

const SIDE_COPY: Record<
  InvoiceSide,
  {
    kicker: string
    title: string
    issuer: string
    hint: string
    amountLabel: string
    amountNote: string
    titlePlaceholder: string
    taxLabel: string
    taxPlaceholder: string
    emailPlaceholder: string
    submitText: string
  }
> = {
  platform: {
    kicker: 'CUSTOMER / PLATFORM',
    title: '获取发票',
    issuer: '平台发票',
    hint: '开票金额以平台服务费结算记录为准，不包含开发者收入。',
    amountLabel: '可开票金额',
    amountNote: '平台服务费（定金 + 尾款合并开票）',
    titlePlaceholder: '个人姓名或单位名称',
    taxLabel: '税号（可选）',
    taxPlaceholder: '单位纳税人识别号',
    emailPlaceholder: '用于接收开票文件',
    submitText: '提交平台发票申请',
  },
  developer: {
    kicker: 'CUSTOMER / DEVELOPER',
    title: '获取开发者发票',
    issuer: '开发者发票',
    hint: '开发者收入发票由乙方开具；抬头为企业或个体工商户时需填写税号。',
    amountLabel: '可开票金额',
    amountNote: '开发者收入（定金 + 尾款合并开票）',
    titlePlaceholder: '个人姓名、个体户或企业名称',
    taxLabel: '税号',
    taxPlaceholder: '企业或个体工商户必填',
    emailPlaceholder: '用于保留开票联系信息',
    submitText: '提交开发者发票申请',
  },
}

const side = ref<InvoiceSide>('platform')
const submitting = ref(false)
const summaryLoading = ref(false)
const summary = ref<InvoiceableSummary | null>(null)

const forms = reactive<Record<InvoiceSide, InvoiceForm>>({
  platform: { invoiceTitle: '', taxNumber: '', recipientEmail: '' },
  developer: { invoiceTitle: '', taxNumber: '', recipientEmail: '' },
})

const form = computed(() => forms[side.value])
const copy = computed(() => SIDE_COPY[side.value])
const otherBlockedReason = computed(() =>
  side.value === 'platform' ? blockedReason('developer') : blockedReason('platform'),
)

/** 当前这一侧已存在的发票记录：已提交过就只展示进度，不再重复申请。 */
const activeInvoice = computed<InvoiceRecord | null>(() =>
  side.value === 'platform'
    ? summary.value?.platformInvoice ?? null
    : summary.value?.developerInvoice ?? null,
)

/** 当前这一侧的可开票金额：平台票取服务费，开发者票取扣掉售后退款/赔付后的净额。 */
const activeAmountFen = computed(() => {
  if (!summary.value) {
    return 0
  }
  return side.value === 'platform'
    ? summary.value.platformFeeFen
    : summary.value.developerInvoiceFen
})

const activeAmountCny = computed(() =>
  side.value === 'platform'
    ? summary.value?.platformFeeCny ?? '0.00'
    : summary.value?.developerInvoiceCny ?? '0.00',
)

/**
 * 原票开具之后净额又变了（售后退款 / 赔付成立）：票面要红冲后按新净额重开。
 * 红冲由财务端执行——财务端把这张票列为「待红冲」，冲完这里就不再返回原票，
 * 用户随即可以按新净额重新申请，所以这里只做告知，不提供任何改写入口。
 */
const invoiceAmountStale = computed(
  () => Boolean(activeInvoice.value) && activeInvoice.value?.amountFen !== activeAmountFen.value,
)

/** 平台发票只有付款方能获取；开发者一侧双方都能获取：乙方开具、需求方索取。 */
function blockedReason(target: InvoiceSide) {
  if (target === 'platform' && props.role !== 'customer') {
    return '你不是本需求的需求方，平台发票由付款方获取'
  }
  return ''
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

// 开票信息预填：抬头/税号取自实名认证主体，邮箱取自账户资料。
const realname = ref<UserRealnameVerification | null>(null)
const accountEmail = ref('')
const prefillLoaded = ref(false)
let prefillRequest: Promise<void> | null = null

// 仅已通过认证的实名记录可用于开票，审核中或未认证时不做预填。
const approvedRealname = computed(() =>
  realname.value?.status === 'approved' ? realname.value : null,
)

const isOrganizationRealname = computed(() => {
  const authType = approvedRealname.value?.auth_type
  return authType === 'ENTERPRISE' || authType === 'SOLE_PROPRIETOR'
})

// 企业/个体户用公司全称，个人用实名姓名。
const prefillTitle = computed(() => {
  const record = approvedRealname.value
  if (!record) {
    return ''
  }
  return isOrganizationRealname.value
    ? record.company_name?.trim() ?? ''
    : record.real_name?.trim() ?? ''
})

// 税号（统一社会信用代码）仅企业/个体户有值，与后端校验保持一致。
const prefillTaxNumber = computed(() =>
  isOrganizationRealname.value
    ? approvedRealname.value?.unified_social_credit_code?.trim() ?? ''
    : '',
)

const prefillNotice = computed(() => {
  if (!prefillLoaded.value || approvedRealname.value) {
    return ''
  }
  return realname.value?.status === 'pending'
    ? '实名认证审核中，抬头与税号需手动填写。'
    : '未完成实名认证，抬头与税号需手动填写。'
})

/**
 * 只填充空字段，绝不覆盖用户输入或已保存的草稿。
 * 必须在 restoreDraft 之后调用，否则会冲掉上次手动填写的内容。
 */
function applyPrefill() {
  for (const target of ['platform', 'developer'] as InvoiceSide[]) {
    const targetForm = forms[target]
    if (!targetForm.invoiceTitle.trim() && prefillTitle.value) {
      targetForm.invoiceTitle = prefillTitle.value
    }
    if (!targetForm.taxNumber.trim() && prefillTaxNumber.value) {
      targetForm.taxNumber = prefillTaxNumber.value
    }
    if (!targetForm.recipientEmail.trim() && accountEmail.value) {
      targetForm.recipientEmail = accountEmail.value
    }
  }
}

/** 抬头与实名主体不一致时给出提醒文案；一致或无从比对时返回空串。 */
function invoiceTitleNotice(title: string) {
  const expected = prefillTitle.value
  const trimmed = title.trim()
  if (expected && trimmed && trimmed !== expected) {
    return `发票抬头与实名主体「${expected}」不一致，请确认无误`
  }
  return ''
}

async function ensureInvoicePrefill(): Promise<void> {
  if (prefillLoaded.value || !props.token) {
    return
  }
  if (prefillRequest) {
    return prefillRequest
  }
  prefillRequest = (async () => {
    // 预填属于增强能力，任一接口失败都静默降级，不阻塞开票申请。
    const [realnameResult, profileResult] = await Promise.allSettled([
      getMyRealnameVerification(props.token),
      getProfile(props.token),
    ])
    if (realnameResult.status === 'fulfilled') {
      realname.value = realnameResult.value
    }
    if (profileResult.status === 'fulfilled') {
      accountEmail.value = profileResult.value.email?.trim() ?? ''
    }
    prefillLoaded.value = true
    if (props.visible) {
      applyPrefill()
    }
  })().finally(() => {
    prefillRequest = null
  })
  return prefillRequest
}

function restoreDraft(target: InvoiceSide) {
  const raw = localStorage.getItem(DRAFT_KEYS[target])
  if (!raw) {
    return
  }
  try {
    const draft = JSON.parse(raw) as Partial<InvoiceForm>
    const targetForm = forms[target]
    if (!targetForm.invoiceTitle.trim()) {
      targetForm.invoiceTitle = draft.invoiceTitle ?? ''
    }
    if (!targetForm.taxNumber.trim()) {
      targetForm.taxNumber = draft.taxNumber ?? ''
    }
    if (!targetForm.recipientEmail.trim()) {
      targetForm.recipientEmail = draft.recipientEmail ?? ''
    }
  } catch {
    localStorage.removeItem(DRAFT_KEYS[target])
  }
}

function persistDraft(target: InvoiceSide) {
  localStorage.setItem(DRAFT_KEYS[target], JSON.stringify(forms[target]))
}

function saveDraft() {
  persistDraft(side.value)
  showToast('草稿已保存', 'success')
}

/** 拉取本需求的合并开票汇总：金额由后端按已成功分账的结算单算出。 */
async function ensureSummary() {
  if (summaryLoading.value || !props.token || !props.requirementId) {
    return
  }
  summaryLoading.value = true
  try {
    summary.value = await getInvoiceSummary(props.token, props.requirementId)
  } catch (error) {
    summary.value = null
    showToast(error instanceof Error ? error.message : '加载可开票金额失败', 'error')
  } finally {
    summaryLoading.value = false
  }
}

function switchSide(target: InvoiceSide) {
  if (blockedReason(target)) {
    return
  }
  persistDraft(side.value)
  side.value = target
  restoreDraft(target)
  applyPrefill()
}

function close() {
  persistDraft(side.value)
  emit('update:visible', false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
  }
}

async function submit() {
  if (!form.value.invoiceTitle.trim()) {
    showToast('请填写发票抬头', 'warning')
    return
  }
  if (activeInvoice.value) {
    showToast('该发票已提交，请到发票中心查看进度', 'warning')
    return
  }
  if (!summary.value || activeAmountFen.value <= 0) {
    showToast('本需求暂无可开票的已结算金额', 'warning')
    return
  }
  const currentSide = side.value
  const notice = invoiceTitleNotice(form.value.invoiceTitle)
  submitting.value = true
  try {
    const payload = {
      requirement_id: props.requirementId,
      invoice_title: form.value.invoiceTitle.trim(),
      tax_number: form.value.taxNumber.trim(),
      recipient_email: form.value.recipientEmail.trim(),
    }
    if (currentSide === 'platform') {
      await requestPlatformInvoice(props.token, payload)
    } else {
      await requestDeveloperInvoice(props.token, payload)
    }
    forms[currentSide] = { invoiceTitle: '', taxNumber: '', recipientEmail: '' }
    localStorage.removeItem(DRAFT_KEYS[currentSide])
    emit('update:visible', false)
    emit('submitted')
    const done =
      currentSide === 'platform'
        ? '平台发票申请已提交'
        : '开发者发票申请已提交，乙方上传发票文件后可在发票中心下载'
    showToast(notice || done, notice ? 'warning' : 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '获取发票失败', 'error')
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      side.value = props.initialSide ?? (props.role === 'developer' ? 'developer' : 'platform')
      restoreDraft(side.value)
      applyPrefill()
      void ensureSummary()
      void ensureInvoicePrefill()
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

        <div class="invoice-side-switch" role="radiogroup" aria-label="选择获取哪一侧的发票">
          <button v-for="item in SIDE_TABS" :key="item.value" type="button" role="radio"
            class="invoice-side-switch__btn" :class="{ 'is-active': side === item.value }"
            :aria-checked="side === item.value" :disabled="Boolean(blockedReason(item.value))"
            :title="blockedReason(item.value) || undefined" @click="switchSide(item.value)">
            {{ item.label }}
          </button>
        </div>
        <p v-if="otherBlockedReason" class="invoice-panel__notice">{{ otherBlockedReason }}</p>

        <p class="invoice-panel__hint">{{ copy.hint }}</p>
        <p v-if="prefillNotice" class="invoice-panel__notice">{{ prefillNotice }}</p>

        <div class="invoice-amount" aria-live="polite">
          <span class="invoice-amount__label">{{ copy.amountLabel }}</span>
          <strong class="invoice-amount__value">
            {{ summaryLoading ? '加载中…' : `¥${activeAmountCny}` }}
          </strong>
          <small class="invoice-amount__note">{{ copy.amountNote }}</small>
          <small v-if="summary" class="invoice-amount__note">
            本需求已成功结算合计 ¥{{ summary.settledAmountCny }}（平台服务费 ¥{{ summary.platformFeeCny }} +
            开发者收入 ¥{{ summary.developerGrossAmountCny }}）
          </small>
          <small v-if="summary && summary.developerPayoutFen > 0" class="invoice-amount__note">
            其中开发者已退还 / 赔付客户 ¥{{ summary.developerPayoutCny }}，开发者票按净额
            ¥{{ summary.developerInvoiceCny }} 开具；平台服务费未退，平台票不受影响。
          </small>
        </div>
        <p v-if="summary && summary.pendingRefundFen > 0" class="invoice-panel__notice">
          本需求有未结案的退款诉求 ¥{{ summary.pendingRefundCny }}（尾款分账出账后退不动，已转平台人工处理）：
          票面金额按已成功分账的净额计算、未扣除这部分——诉求还没裁决，票面必须等于已经发生的销售额；
          诉求真的成立之后再按新的净额红冲重开。
        </p>
        <p v-if="activeInvoice" class="invoice-panel__notice">
          该发票已提交（{{ invoiceStatusLabel(activeInvoice.status) }} · 票面 ¥{{ activeInvoice.amountCny }}），
          到发票中心可查看进度与发票文件。
        </p>
        <p v-if="activeInvoice && invoiceAmountStale" class="invoice-panel__notice">
          原票开具后本需求的可开票净额已变为 ¥{{ activeAmountCny }}（售后退款 / 赔付已成立）：
          这张票需要红冲后按新净额重开。财务端已列为「待红冲」，红冲完成后这里就能重新申请，无需另行申请改写。
        </p>
        <p v-else-if="!summaryLoading && summary && activeAmountFen <= 0" class="invoice-panel__hint">
          本需求暂无可开票的已结算金额（分账结算成功后才会出现）。
        </p>
        <label>
          发票抬头
          <input v-model="form.invoiceTitle" type="text" maxlength="200" :placeholder="copy.titlePlaceholder" />
        </label>
        <label>
          {{ copy.taxLabel }}
          <input v-model="form.taxNumber" type="text" maxlength="64" :placeholder="copy.taxPlaceholder" />
        </label>
        <label>
          接收邮箱（可选）
          <input v-model="form.recipientEmail" type="email" maxlength="254" :placeholder="copy.emailPlaceholder" />
        </label>

        <div class="invoice-modal__actions">
          <button class="invoice-modal__draft" type="button" @click="saveDraft">保存草稿</button>
          <button class="invoice-panel__submit" type="button"
            :disabled="submitting || Boolean(activeInvoice) || activeAmountFen <= 0" @click="submit">
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

/* 可开票金额：合并开票后它是弹窗里唯一的主角，单独一块摆出来，
   下面两行小字分别是「这笔钱是什么」与「本需求结算合计的拆解」。 */
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

/* 开票主体切换：两端共用同一个弹窗，只能选当前身份能获取的一侧 */
.invoice-side-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
}

.invoice-side-switch__btn {
  min-height: 40px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #475467;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.invoice-side-switch__btn.is-active {
  background: #fff;
  color: #247f7d;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
}

.invoice-side-switch__btn:disabled {
  color: #98a2b3;
  cursor: not-allowed;
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
