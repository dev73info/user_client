<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import {
  listInvoicePaymentOptions,
  requestDeveloperInvoice,
  requestPlatformInvoice,
  type InvoicePaymentOption,
} from '@/api/invoices'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
import { getProfile } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

/** 开票主体：平台服务费发票由需求方申请，开发者发票由乙方申请。 */
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
  { value: 'platform', label: '平台开具' },
  { value: 'developer', label: '开发者开具' },
]

const SIDE_COPY: Record<
  InvoiceSide,
  {
    kicker: string
    title: string
    issuer: string
    hint: string
    titlePlaceholder: string
    taxLabel: string
    taxPlaceholder: string
    emailPlaceholder: string
    submitText: string
  }
> = {
  platform: {
    kicker: 'CUSTOMER / PLATFORM',
    title: '申请平台服务费发票',
    issuer: '平台开具',
    hint: '开票金额以平台服务费结算记录为准，不包含开发者收入。',
    titlePlaceholder: '个人姓名或单位名称',
    taxLabel: '税号（可选）',
    taxPlaceholder: '单位纳税人识别号',
    emailPlaceholder: '用于接收开票文件',
    submitText: '提交平台开票申请',
  },
  developer: {
    kicker: 'DEVELOPER / SELF ISSUED',
    title: '申请开发者发票',
    issuer: '开发者开具',
    hint: '开发者按实名主体开具，企业和个体工商户需填写税号。',
    titlePlaceholder: '个人姓名、个体户或企业名称',
    taxLabel: '税号',
    taxPlaceholder: '企业或个体工商户必填',
    emailPlaceholder: '用于保留开票联系信息',
    submitText: '创建开发者开票记录',
  },
}

const side = ref<InvoiceSide>('platform')
const submitting = ref(false)
const optionsLoading = ref(false)
const paymentOptions = ref<InvoicePaymentOption[]>([])

const forms = reactive<Record<InvoiceSide, InvoiceForm>>({
  platform: { invoiceTitle: '', taxNumber: '', recipientEmail: '' },
  developer: { invoiceTitle: '', taxNumber: '', recipientEmail: '' },
})
const selectedPaymentId = reactive<Record<InvoiceSide, string>>({ platform: '', developer: '' })

const form = computed(() => forms[side.value])
const copy = computed(() => SIDE_COPY[side.value])
const otherBlockedReason = computed(() =>
  side.value === 'platform' ? blockedReason('developer') : blockedReason('platform'),
)

// 支付节点列表是账号级的，弹窗只关心当前需求，按需求 + 本人身份过滤。
const requirementOptions = computed(() =>
  paymentOptions.value.filter((item) => item.requirementId === props.requirementId),
)
const activeOptions = computed(() => optionsFor(side.value))
const activeSelectedPayment = computed(() =>
  activeOptions.value.find((item) => item.paymentId === selectedPaymentId[side.value]),
)

function optionsFor(target: InvoiceSide) {
  return target === 'platform'
    ? requirementOptions.value.filter((item) => item.payer === auth.username)
    : requirementOptions.value.filter((item) => item.developer === auth.username)
}

/** 需求里只有一方能开票：另一方置灰，并说明原因。 */
function blockedReason(target: InvoiceSide) {
  if (target === 'platform' && props.role !== 'customer') {
    return '你不是本需求的需求方，平台服务费发票由付款方申请'
  }
  if (target === 'developer' && props.role !== 'developer') {
    return '你不是本需求的开发者，开发者发票由乙方申请'
  }
  return ''
}

function milestoneLabel(item: InvoicePaymentOption) {
  return item.milestone === 'deposit' ? '定金' : '尾款'
}

function optionAmount(item: InvoicePaymentOption) {
  return side.value === 'platform' ? item.platformFeeCny : item.developerGrossAmountCny
}

/** 触发器只放紧凑摘要，需求编号留给列表行，避免收起态出现超长文本。 */
function optionSummary(item: InvoicePaymentOption) {
  return `${milestoneLabel(item)} · 可开票 ¥${optionAmount(item)}`
}

const paymentTriggerText = computed(() => {
  if (optionsLoading.value) {
    return '加载中...'
  }
  const selected = activeSelectedPayment.value
  return selected ? optionSummary(selected) : '请选择支付节点'
})

function isSelectedPayment(item: InvoicePaymentOption) {
  return item.paymentId === selectedPaymentId[side.value]
}

// 支付节点列表：原生 select 的弹出层由系统绘制、无法统一风格，
// 这里用自绘列表，交互照搬 PublishModal 的模板菜单（点击外部收起）。
const paymentMenuOpen = ref(false)
const paymentFieldRef = ref<HTMLElement | null>(null)

function togglePaymentMenu() {
  if (optionsLoading.value || activeOptions.value.length === 0) {
    return
  }
  paymentMenuOpen.value = !paymentMenuOpen.value
}

function selectPayment(item: InvoicePaymentOption) {
  selectedPaymentId[side.value] = item.paymentId
  paymentMenuOpen.value = false
}

function handlePaymentPointerDown(event: PointerEvent) {
  if (!paymentMenuOpen.value) {
    return
  }
  const target = event.target
  // 点击触发区或列表内部不关闭，由其自身交互处理
  if (target instanceof Node && paymentFieldRef.value?.contains(target)) {
    return
  }
  paymentMenuOpen.value = false
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
    const draft = JSON.parse(raw) as Partial<InvoiceForm> & { selectedPaymentId?: string }
    const targetForm = forms[target]
    // 草稿里的支付节点可能属于别的需求，对不上就只回填抬头信息。
    selectedPaymentId[target] = optionsFor(target).some(
      (item) => item.paymentId === draft.selectedPaymentId,
    )
      ? draft.selectedPaymentId ?? ''
      : ''
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
  localStorage.setItem(
    DRAFT_KEYS[target],
    JSON.stringify({ selectedPaymentId: selectedPaymentId[target], ...forms[target] }),
  )
}

function saveDraft() {
  persistDraft(side.value)
  showToast('草稿已保存', 'success')
}

async function ensureOptions() {
  if (optionsLoading.value || !props.token) {
    return
  }
  optionsLoading.value = true
  try {
    paymentOptions.value = await listInvoicePaymentOptions(props.token)
    // 支付节点到位后才能判断草稿里的节点是否属于本需求。
    restoreDraft(side.value)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载可开票支付节点失败', 'error')
  } finally {
    optionsLoading.value = false
  }
}

function switchSide(target: InvoiceSide) {
  if (blockedReason(target)) {
    return
  }
  paymentMenuOpen.value = false
  persistDraft(side.value)
  side.value = target
  restoreDraft(target)
  applyPrefill()
}

function close() {
  paymentMenuOpen.value = false
  persistDraft(side.value)
  emit('update:visible', false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') {
    return
  }
  // 下拉展开时 Escape 先收起列表，不直接关掉整个弹窗
  if (paymentMenuOpen.value) {
    paymentMenuOpen.value = false
    return
  }
  close()
}

async function submit() {
  const payment = activeSelectedPayment.value
  if (!payment || !form.value.invoiceTitle.trim()) {
    showToast('请选择支付节点并填写发票抬头', 'warning')
    return
  }
  const currentSide = side.value
  const notice = invoiceTitleNotice(form.value.invoiceTitle)
  submitting.value = true
  try {
    const payload = {
      payment_id: payment.paymentId,
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
    selectedPaymentId[currentSide] = ''
    paymentMenuOpen.value = false
    localStorage.removeItem(DRAFT_KEYS[currentSide])
    emit('update:visible', false)
    emit('submitted')
    const done =
      currentSide === 'platform'
        ? '平台发票申请已提交'
        : '开发者发票申请已创建，请到发票中心上传发票文件'
    showToast(notice || done, notice ? 'warning' : 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '申请发票失败', 'error')
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      side.value = props.role === 'developer' ? 'developer' : 'platform'
      paymentMenuOpen.value = false
      restoreDraft(side.value)
      applyPrefill()
      void ensureOptions()
      void ensureInvoicePrefill()
      document.addEventListener('keydown', handleKeydown)
    } else {
      paymentMenuOpen.value = false
      document.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('pointerdown', handlePaymentPointerDown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePaymentPointerDown, true)
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

        <div class="invoice-side-switch" role="radiogroup" aria-label="申请谁开">
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

        <label>
          已成功结算的支付节点
          <span ref="paymentFieldRef" class="invoice-payment">
            <button type="button" class="invoice-payment__trigger"
              :class="{ 'is-open': paymentMenuOpen }" :disabled="optionsLoading || activeOptions.length === 0"
              aria-haspopup="listbox" :aria-expanded="paymentMenuOpen ? 'true' : 'false'" @click="togglePaymentMenu">
              <span class="invoice-payment__value" :class="{ 'is-placeholder': !activeSelectedPayment }">
                {{ paymentTriggerText }}
              </span>
            </button>
            <div v-if="paymentMenuOpen" class="invoice-payment__menu" role="listbox" aria-label="已成功结算的支付节点">
              <button v-for="item in activeOptions" :key="item.paymentId" type="button" role="option"
                class="invoice-payment__option" :class="{ 'is-selected': isSelectedPayment(item) }"
                :aria-selected="isSelectedPayment(item) ? 'true' : 'false'" @click="selectPayment(item)">
                <span class="invoice-payment__milestone">{{ milestoneLabel(item) }}</span>
                <span class="invoice-payment__amount">可开票 ¥{{ optionAmount(item) }}</span>
                <small class="invoice-payment__id">{{ item.requirementId }}</small>
              </button>
            </div>
          </span>
        </label>
        <p v-if="!optionsLoading && activeOptions.length === 0" class="invoice-panel__hint">
          本需求暂无可开票的已结算支付节点（该节点分账结算成功后才会出现在这里）。
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
          <button class="invoice-panel__submit" type="button" :disabled="submitting" @click="submit">
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

/* 开票主体切换：两端共用同一个弹窗，只能选当前身份能申请的一侧 */
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

/* 支付节点下拉：原生 select 的弹出层由系统绘制、样式改不动，
   这里换成自绘列表，行内按「节点 / 金额 / 需求编号」三段排版。 */
.invoice-payment {
  position: relative;
  display: block;
}

.invoice-payment__trigger {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 40px;
  box-sizing: border-box;
  border: 1px solid #d0d5dd;
  border-radius: 7px;
  padding: 8px 34px 8px 10px;
  background: #fff;
  color: #172033;
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.invoice-payment__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-payment__value.is-placeholder {
  color: #98a2b3;
}

/* 自绘 chevron，展开时翻转，替代系统箭头 */
.invoice-payment__trigger::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 12px;
  width: 12px;
  height: 8px;
  margin-top: -4px;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5 6 6.5l5-5' stroke='%23667085' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-size: 12px 8px;
  transition: transform 0.18s ease;
}

.invoice-payment__trigger.is-open::after {
  transform: rotate(180deg);
}

.invoice-payment__trigger:hover:not(:disabled) {
  border-color: #b7c0cd;
}

.invoice-payment__trigger:focus-visible {
  outline: none;
  border-color: #247f7d;
  box-shadow: 0 0 0 3px rgba(36, 127, 125, 0.14);
}

.invoice-payment__trigger:disabled {
  background: #f9fafb;
  color: #98a2b3;
  cursor: not-allowed;
}

.invoice-payment__menu {
  position: absolute;
  z-index: 5;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  display: grid;
  gap: 2px;
  max-height: 216px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 6px;
  background: #fff;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.16);
}

.invoice-payment__option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px 8px;
  border: 0;
  border-radius: 8px;
  padding: 8px 10px;
  background: transparent;
  font-family: inherit;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
}

.invoice-payment__option:hover,
.invoice-payment__option:focus-visible {
  outline: none;
  background: #f4f8f7;
}

.invoice-payment__option.is-selected {
  background: rgba(36, 127, 125, 0.08);
}

.invoice-payment__option.is-selected .invoice-payment__amount {
  color: #247f7d;
}

.invoice-payment__milestone {
  justify-self: start;
  border-radius: 999px;
  padding: 2px 8px;
  background: rgba(36, 127, 125, 0.1);
  color: #247f7d;
  font-size: 11px;
  font-weight: 700;
}

.invoice-payment__amount {
  color: #172033;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 需求编号是次要信息：独占一行、字号更小、超长省略 */
.invoice-payment__id {
  grid-column: 1 / -1;
  color: #98a2b3;
  font-size: 11px;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
