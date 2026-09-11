<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import {
  listInvoicePaymentOptions,
  listMyInvoices,
  downloadInvoiceDocument,
  requestDeveloperInvoice,
  requestPlatformInvoice,
  uploadInvoiceDocument,
  type InvoicePaymentOption,
  type InvoiceRecord,
} from '@/api/invoices'
import { getMyRealnameVerification, type UserRealnameVerification } from '@/api/realname'
import { getProfile } from '@/api/settings'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const submitting = ref<'platform' | 'developer' | null>(null)
const invoices = ref<InvoiceRecord[]>([])
const paymentOptions = ref<InvoicePaymentOption[]>([])
const selectedPlatformPaymentId = ref('')
const selectedDeveloperPaymentId = ref('')
const selectedFileByInvoice = reactive<Record<number, File | undefined>>({})
const uploadingInvoiceId = ref<number | null>(null)

const platformForm = reactive({ invoiceTitle: '', taxNumber: '', recipientEmail: '' })
const developerForm = reactive({ invoiceTitle: '', taxNumber: '', recipientEmail: '' })

// 弹窗可见性
const platformModalVisible = ref(false)
const developerModalVisible = ref(false)

// 临时草稿（localStorage 持久化，跨刷新/关闭保留）
const PLATFORM_DRAFT_KEY = 'invoice_platform_draft_v1'
const DEVELOPER_DRAFT_KEY = 'invoice_developer_draft_v1'

const platformOptions = computed(() =>
  paymentOptions.value.filter((item) => item.payer === auth.username),
)
const developerOptions = computed(() =>
  paymentOptions.value.filter((item) => item.developer === auth.username),
)
const selectedPlatformPayment = computed(() =>
  platformOptions.value.find((item) => item.paymentId === selectedPlatformPaymentId.value),
)
const selectedDeveloperPayment = computed(() =>
  developerOptions.value.find((item) => item.paymentId === selectedDeveloperPaymentId.value),
)

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
 * 必须在 loadXxxDraft 之后调用，否则会冲掉上次手动填写的内容。
 */
function applyInvoicePrefill(form: {
  invoiceTitle: string
  taxNumber: string
  recipientEmail: string
}) {
  if (!form.invoiceTitle.trim() && prefillTitle.value) {
    form.invoiceTitle = prefillTitle.value
  }
  if (!form.taxNumber.trim() && prefillTaxNumber.value) {
    form.taxNumber = prefillTaxNumber.value
  }
  if (!form.recipientEmail.trim() && accountEmail.value) {
    form.recipientEmail = accountEmail.value
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
  const token = auth.token
  if (prefillLoaded.value || !token) {
    return
  }
  if (prefillRequest) {
    return prefillRequest
  }
  prefillRequest = (async () => {
    // 预填属于增强能力，任一接口失败都静默降级，不阻塞开票申请。
    const [realnameResult, profileResult] = await Promise.allSettled([
      getMyRealnameVerification(token),
      getProfile(token),
    ])
    if (realnameResult.status === 'fulfilled') {
      realname.value = realnameResult.value
    }
    if (profileResult.status === 'fulfilled') {
      accountEmail.value = profileResult.value.email?.trim() ?? ''
    }
    prefillLoaded.value = true
    // 弹窗可能已经打开，数据到位后再补一次。
    if (platformModalVisible.value) {
      applyInvoicePrefill(platformForm)
    }
    if (developerModalVisible.value) {
      applyInvoicePrefill(developerForm)
    }
  })().finally(() => {
    prefillRequest = null
  })
  return prefillRequest
}

onMounted(() => {
  auth.hydrate()
  void loadData()
  void ensureInvoicePrefill()
})

watch(
  [platformModalVisible, developerModalVisible],
  ([platformOpen, developerOpen]) => {
    if (platformOpen || developerOpen) {
      document.addEventListener('keydown', handleModalKeydown)
    } else {
      document.removeEventListener('keydown', handleModalKeydown)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleModalKeydown)
})

function statusLabel(status: InvoiceRecord['status']) {
  return {
    requested: '待处理',
    under_review: '审核中',
    approved: '已通过',
    rejected: '需补充材料',
  }[status]
}

function statusClass(status: InvoiceRecord['status']) {
  return `invoice-status--${status}`
}

function countByStatus(status: InvoiceRecord['status']) {
  return invoices.value.filter((item) => item.status === status).length
}

function roleLabel(role: InvoiceRecord['invoiceRole']) {
  return role === 'platform' ? '平台服务费发票' : '开发者服务收入发票'
}

function developerTypeLabel(value: string) {
  return {
    personal: '个人',
    sole_proprietor: '个体工商户',
    enterprise: '企业',
  }[value] ?? '待识别'
}

function optionLabel(item: InvoicePaymentOption, role: 'platform' | 'developer') {
  const amount = role === 'platform' ? item.platformFeeCny : item.developerGrossAmountCny
  const milestone = item.milestone === 'deposit' ? '定金' : '尾款'
  return `${item.requirementId} · ${milestone} · 可开票 ¥${amount}`
}

async function loadData() {
  if (!auth.token) {
    return
  }
  loading.value = true
  try {
    const [invoiceRows, options] = await Promise.all([
      listMyInvoices(auth.token),
      listInvoicePaymentOptions(auth.token),
    ])
    invoices.value = invoiceRows
    paymentOptions.value = options
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载发票数据失败', 'error')
  } finally {
    loading.value = false
  }
}

function resetPlatformForm() {
  selectedPlatformPaymentId.value = ''
  platformForm.invoiceTitle = ''
  platformForm.taxNumber = ''
  platformForm.recipientEmail = ''
}

function resetDeveloperForm() {
  selectedDeveloperPaymentId.value = ''
  developerForm.invoiceTitle = ''
  developerForm.taxNumber = ''
  developerForm.recipientEmail = ''
}

function persistPlatformDraft() {
  const draft = {
    selectedPaymentId: selectedPlatformPaymentId.value,
    invoiceTitle: platformForm.invoiceTitle,
    taxNumber: platformForm.taxNumber,
    recipientEmail: platformForm.recipientEmail,
  }
  localStorage.setItem(PLATFORM_DRAFT_KEY, JSON.stringify(draft))
}

function savePlatformDraft() {
  persistPlatformDraft()
  showToast('草稿已保存', 'success')
}

function loadPlatformDraft() {
  try {
    const raw = localStorage.getItem(PLATFORM_DRAFT_KEY)
    if (!raw) {
      return
    }
    const draft = JSON.parse(raw) as Partial<typeof platformForm> & { selectedPaymentId?: string }
    selectedPlatformPaymentId.value = draft.selectedPaymentId ?? ''
    platformForm.invoiceTitle = draft.invoiceTitle ?? ''
    platformForm.taxNumber = draft.taxNumber ?? ''
    platformForm.recipientEmail = draft.recipientEmail ?? ''
  } catch {
    localStorage.removeItem(PLATFORM_DRAFT_KEY)
  }
}

function clearPlatformDraft() {
  localStorage.removeItem(PLATFORM_DRAFT_KEY)
}

function persistDeveloperDraft() {
  const draft = {
    selectedPaymentId: selectedDeveloperPaymentId.value,
    invoiceTitle: developerForm.invoiceTitle,
    taxNumber: developerForm.taxNumber,
    recipientEmail: developerForm.recipientEmail,
  }
  localStorage.setItem(DEVELOPER_DRAFT_KEY, JSON.stringify(draft))
}

function saveDeveloperDraft() {
  persistDeveloperDraft()
  showToast('草稿已保存', 'success')
}

function loadDeveloperDraft() {
  try {
    const raw = localStorage.getItem(DEVELOPER_DRAFT_KEY)
    if (!raw) {
      return
    }
    const draft = JSON.parse(raw) as Partial<typeof developerForm> & { selectedPaymentId?: string }
    selectedDeveloperPaymentId.value = draft.selectedPaymentId ?? ''
    developerForm.invoiceTitle = draft.invoiceTitle ?? ''
    developerForm.taxNumber = draft.taxNumber ?? ''
    developerForm.recipientEmail = draft.recipientEmail ?? ''
  } catch {
    localStorage.removeItem(DEVELOPER_DRAFT_KEY)
  }
}

function clearDeveloperDraft() {
  localStorage.removeItem(DEVELOPER_DRAFT_KEY)
}

function openPlatformModal() {
  loadPlatformDraft()
  applyInvoicePrefill(platformForm)
  void ensureInvoicePrefill()
  platformModalVisible.value = true
}

function closePlatformModal() {
  persistPlatformDraft()
  platformModalVisible.value = false
}

function openDeveloperModal() {
  loadDeveloperDraft()
  applyInvoicePrefill(developerForm)
  void ensureInvoicePrefill()
  developerModalVisible.value = true
}

function closeDeveloperModal() {
  persistDeveloperDraft()
  developerModalVisible.value = false
}

function handleModalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') {
    return
  }
  if (platformModalVisible.value) {
    closePlatformModal()
  }
  if (developerModalVisible.value) {
    closeDeveloperModal()
  }
}

async function submitPlatformInvoice() {
  const payment = selectedPlatformPayment.value
  if (!payment || !platformForm.invoiceTitle.trim()) {
    showToast('请选择支付节点并填写发票抬头', 'warning')
    return
  }
  const titleNotice = invoiceTitleNotice(platformForm.invoiceTitle)
  submitting.value = 'platform'
  try {
    const invoice = await requestPlatformInvoice(auth.token, {
      payment_id: payment.paymentId,
      invoice_title: platformForm.invoiceTitle.trim(),
      tax_number: platformForm.taxNumber.trim(),
      recipient_email: platformForm.recipientEmail.trim(),
    })
    invoices.value = [invoice, ...invoices.value.filter((item) => item.id !== invoice.id)]
    resetPlatformForm()
    clearPlatformDraft()
    platformModalVisible.value = false
    showToast(titleNotice || '平台发票申请已提交', titleNotice ? 'warning' : 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '申请平台发票失败', 'error')
  } finally {
    submitting.value = null
  }
}

async function submitDeveloperInvoice() {
  const payment = selectedDeveloperPayment.value
  if (!payment || !developerForm.invoiceTitle.trim()) {
    showToast('请选择支付节点并填写发票抬头', 'warning')
    return
  }
  const titleNotice = invoiceTitleNotice(developerForm.invoiceTitle)
  submitting.value = 'developer'
  try {
    const invoice = await requestDeveloperInvoice(auth.token, {
      payment_id: payment.paymentId,
      invoice_title: developerForm.invoiceTitle.trim(),
      tax_number: developerForm.taxNumber.trim(),
      recipient_email: developerForm.recipientEmail.trim(),
    })
    invoices.value = [invoice, ...invoices.value.filter((item) => item.id !== invoice.id)]
    resetDeveloperForm()
    clearDeveloperDraft()
    developerModalVisible.value = false
    showToast(titleNotice || '开发者发票申请已创建，请上传发票文件', titleNotice ? 'warning' : 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '申请开发者发票失败', 'error')
  } finally {
    submitting.value = null
  }
}

function selectInvoiceFile(invoiceId: number, event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    selectedFileByInvoice[invoiceId] = file
  }
}

async function uploadDocument(invoice: InvoiceRecord) {
  const file = selectedFileByInvoice[invoice.id]
  if (!file) {
    showToast('请选择发票文件', 'warning')
    return
  }
  uploadingInvoiceId.value = invoice.id
  try {
    const updated = await uploadInvoiceDocument(auth.token, invoice.id, file)
    invoices.value = invoices.value.map((item) => (item.id === updated.id ? updated : item))
    delete selectedFileByInvoice[invoice.id]
    showToast('发票文件已上传，等待平台审核', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '上传发票文件失败', 'error')
  } finally {
    uploadingInvoiceId.value = null
  }
}

async function openDocument(invoice: InvoiceRecord) {
  if (!invoice.documentUrl) {
    return
  }
  const popup = window.open('', '_blank')
  try {
    const blob = await downloadInvoiceDocument(auth.token, invoice.id)
    const objectUrl = URL.createObjectURL(blob)
    if (popup) {
      popup.location.href = objectUrl
    } else {
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (error) {
    popup?.close()
    showToast(error instanceof Error ? error.message : '下载发票文件失败', 'error')
  }
}
</script>

<template>
  <main class="invoice-center">
    <div class="invoice-center__toolbar">
      <p class="invoice-center__desc">平台服务费由平台开具，开发者按自身主体开具服务收入发票并上传留痕。</p>
      <button class="invoice-center__refresh" type="button" :disabled="loading" @click="loadData">
        {{ loading ? '加载中...' : '刷新' }}
      </button>
    </div>

    <section class="invoice-stats">
      <article class="invoice-stat">
        <span class="invoice-stat__label">全部发票</span>
        <strong class="invoice-stat__value">{{ invoices.length }}</strong>
        <span class="invoice-stat__hint">累计申请</span>
      </article>
      <article class="invoice-stat invoice-stat--requested">
        <span class="invoice-stat__label">待处理</span>
        <strong class="invoice-stat__value">{{ countByStatus('requested') }}</strong>
        <span class="invoice-stat__hint">等待平台处理</span>
      </article>
      <article class="invoice-stat invoice-stat--under_review">
        <span class="invoice-stat__label">审核中</span>
        <strong class="invoice-stat__value">{{ countByStatus('under_review') }}</strong>
        <span class="invoice-stat__hint">补充材料 / 核实</span>
      </article>
      <article class="invoice-stat invoice-stat--approved">
        <span class="invoice-stat__label">已通过</span>
        <strong class="invoice-stat__value">{{ countByStatus('approved') }}</strong>
        <span class="invoice-stat__hint">已开具 / 通过</span>
      </article>
      <article class="invoice-stat invoice-stat--rejected">
        <span class="invoice-stat__label">需补充材料</span>
        <strong class="invoice-stat__value">{{ countByStatus('rejected') }}</strong>
        <span class="invoice-stat__hint">按备注补交</span>
      </article>
    </section>

    <section class="invoice-entry-grid">
      <article class="invoice-entry-card" role="button" tabindex="0" @click="openPlatformModal"
        @keydown.enter.prevent="openPlatformModal">
        <div class="invoice-entry-card__head">
          <span class="invoice-panel__kicker">CUSTOMER / PLATFORM</span>
          <strong>平台开具</strong>
        </div>
        <h2 class="invoice-entry-card__title">申请平台服务费发票</h2>
        <p class="invoice-entry-card__desc">开票金额以平台服务费结算记录为准，不包含开发者收入。</p>
        <button class="invoice-panel__submit" type="button">去申请</button>
      </article>
      <article class="invoice-entry-card invoice-entry-card--developer" role="button" tabindex="0"
        @click="openDeveloperModal" @keydown.enter.prevent="openDeveloperModal">
        <div class="invoice-entry-card__head">
          <span class="invoice-panel__kicker">DEVELOPER / SELF ISSUED</span>
          <strong>开发者开具</strong>
        </div>
        <h2 class="invoice-entry-card__title">申请开发者发票</h2>
        <p class="invoice-entry-card__desc">开发者按实名主体开具，企业和个体工商户需填写税号。</p>
        <button class="invoice-panel__submit" type="button">去申请</button>
      </article>
    </section>

    <Teleport to="body">
      <div v-if="platformModalVisible" class="invoice-modal-overlay" @click.self="closePlatformModal">
        <article class="invoice-panel invoice-modal" role="dialog" aria-modal="true" aria-label="申请平台服务费发票">
          <div class="invoice-panel__head invoice-modal__head">
            <div>
              <span class="invoice-panel__kicker">CUSTOMER / PLATFORM</span>
              <h2>申请平台服务费发票</h2>
            </div>
            <strong>平台开具</strong>
            <button class="invoice-modal__close" type="button" aria-label="关闭" @click="closePlatformModal">×</button>
          </div>
          <p class="invoice-panel__hint">开票金额以平台服务费结算记录为准，不包含开发者收入。</p>
          <p v-if="prefillNotice" class="invoice-panel__notice">{{ prefillNotice }}</p>
          <label>
            已成功结算的支付节点
            <select v-model="selectedPlatformPaymentId">
              <option value="">请选择支付节点</option>
              <option v-for="item in platformOptions" :key="item.paymentId" :value="item.paymentId">
                {{ optionLabel(item, 'platform') }}
              </option>
            </select>
          </label>
          <label>
            发票抬头
            <input v-model="platformForm.invoiceTitle" type="text" maxlength="200" placeholder="个人姓名或单位名称" />
          </label>
          <label>
            税号（可选）
            <input v-model="platformForm.taxNumber" type="text" maxlength="64" placeholder="单位纳税人识别号" />
          </label>
          <label>
            接收邮箱（可选）
            <input v-model="platformForm.recipientEmail" type="email" maxlength="254" placeholder="用于接收开票文件" />
          </label>
          <div class="invoice-modal__actions">
            <button class="invoice-modal__draft" type="button" @click="savePlatformDraft">保存草稿</button>
            <button class="invoice-panel__submit" type="button" :disabled="submitting !== null"
              @click="submitPlatformInvoice">
              {{ submitting === 'platform' ? '提交中...' : '提交平台开票申请' }}
            </button>
          </div>
        </article>
      </div>

      <div v-if="developerModalVisible" class="invoice-modal-overlay" @click.self="closeDeveloperModal">
        <article class="invoice-panel invoice-modal" role="dialog" aria-modal="true" aria-label="申请开发者发票">
          <div class="invoice-panel__head invoice-modal__head">
            <div>
              <span class="invoice-panel__kicker">DEVELOPER / SELF ISSUED</span>
              <h2>申请开发者发票</h2>
            </div>
            <strong>开发者开具</strong>
            <button class="invoice-modal__close" type="button" aria-label="关闭" @click="closeDeveloperModal">×</button>
          </div>
          <p class="invoice-panel__hint">开发者按实名主体开具，企业和个体工商户需填写税号。</p>
          <p v-if="prefillNotice" class="invoice-panel__notice">{{ prefillNotice }}</p>
          <label>
            已成功结算的支付节点
            <select v-model="selectedDeveloperPaymentId">
              <option value="">请选择支付节点</option>
              <option v-for="item in developerOptions" :key="item.paymentId" :value="item.paymentId">
                {{ optionLabel(item, 'developer') }}
              </option>
            </select>
          </label>
          <label>
            发票抬头
            <input v-model="developerForm.invoiceTitle" type="text" maxlength="200" placeholder="个人姓名、个体户或企业名称" />
          </label>
          <label>
            税号
            <input v-model="developerForm.taxNumber" type="text" maxlength="64" placeholder="企业或个体工商户必填" />
          </label>
          <label>
            接收邮箱（可选）
            <input v-model="developerForm.recipientEmail" type="email" maxlength="254" placeholder="用于保留开票联系信息" />
          </label>
          <div class="invoice-modal__actions">
            <button class="invoice-modal__draft" type="button" @click="saveDeveloperDraft">保存草稿</button>
            <button class="invoice-panel__submit" type="button" :disabled="submitting !== null"
              @click="submitDeveloperInvoice">
              {{ submitting === 'developer' ? '提交中...' : '创建开发者开票记录' }}
            </button>
          </div>
        </article>
      </div>
    </Teleport>

    <section class="invoice-list-panel">
      <div class="invoice-list-panel__head">
        <div>
          <span class="invoice-panel__kicker">TRACEABLE LEDGER</span>
          <h2>我的发票记录</h2>
        </div>
        <span class="invoice-list-panel__count">{{ invoices.length }} 条</span>
      </div>
      <div v-if="invoices.length === 0" class="invoice-empty">暂无发票记录</div>
      <div v-else class="invoice-list">
        <article v-for="invoice in invoices" :key="invoice.id" class="invoice-row">
          <div class="invoice-row__main">
            <strong>{{ invoice.invoiceNo }}</strong>
            <span>{{ roleLabel(invoice.invoiceRole) }} · {{ invoice.requirementId }} · {{ invoice.invoiceTitle }}</span>
            <small>金额 ¥{{ invoice.amountCny }} · {{ invoice.invoiceRole === 'developer' ? developerTypeLabel(invoice.developerType) : '客户服务费' }}</small>
          </div>
          <div class="invoice-row__side">
            <span class="invoice-status" :class="statusClass(invoice.status)">{{ statusLabel(invoice.status) }}</span>
            <button v-if="invoice.documentUrl" type="button" @click="openDocument(invoice)">查看文件</button>
            <template v-if="invoice.invoiceRole === 'developer' && invoice.status !== 'approved'">
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" @change="selectInvoiceFile(invoice.id, $event)" />
              <button type="button" :disabled="uploadingInvoiceId === invoice.id" @click="uploadDocument(invoice)">
                {{ uploadingInvoiceId === invoice.id ? '上传中...' : '上传发票' }}
              </button>
            </template>
            <small v-if="invoice.reviewNote" class="invoice-row__note">{{ invoice.reviewNote }}</small>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.invoice-center {
  max-width: 1180px;
  margin: 0 auto;
  padding: 20px 20px 40px;
  color: #172033;
}

.invoice-center__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.invoice-center__desc {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.6;
}

.invoice-panel__head,
.invoice-list-panel__head,
.invoice-row,
.invoice-row__side {
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

.invoice-panel h2,
.invoice-list-panel h2 {
  margin: 4px 0 0;
}

.invoice-panel__hint {
  color: #667085;
  font-size: 13px;
  line-height: 1.6;
  margin-top: 6px;
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

.invoice-center__refresh {
  flex-shrink: 0;
}

.invoice-center__refresh,
.invoice-panel__submit,
.invoice-row__side button {
  border: 0;
  border-radius: 8px;
  padding: 9px 14px;
  background: #247f7d;
  color: #fff;
  cursor: pointer;
}

.invoice-center__refresh:disabled,
.invoice-panel__submit:disabled,
.invoice-row__side button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* 统计概览 */
.invoice-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.invoice-stat {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  border-left: 3px solid #247f7d;
}

.invoice-stat--requested {
  border-left-color: #9a6700;
}

.invoice-stat--under_review {
  border-left-color: #247f7d;
}

.invoice-stat--approved {
  border-left-color: #247a46;
}

.invoice-stat--rejected {
  border-left-color: #b42318;
}

.invoice-stat__label {
  color: #667085;
  font-size: 12px;
  font-weight: 700;
}

.invoice-stat__value {
  color: #172033;
  font-size: 26px;
  line-height: 1;
  font-weight: 800;
}

.invoice-stat__hint {
  color: #98a2b3;
  font-size: 12px;
}

/* 申请入口卡片 */
.invoice-entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}

.invoice-entry-card {
  display: grid;
  gap: 10px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}

.invoice-entry-card:hover {
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
  transform: translateY(-2px);
}

.invoice-entry-card:focus-visible {
  outline: 2px solid #247f7d;
  outline-offset: 2px;
}

.invoice-entry-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.invoice-entry-card__head strong {
  color: #b26b1c;
  font-size: 13px;
}

.invoice-entry-card--developer .invoice-entry-card__head strong {
  color: #247f7d;
}

.invoice-entry-card__title {
  margin: 4px 0 0;
  font-size: 18px;
  color: #172033;
}

.invoice-entry-card__desc {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.6;
}

.invoice-entry-card .invoice-panel__submit {
  justify-self: start;
}

/* 记录面板计数 */
.invoice-list-panel__count {
  color: #667085;
  font-size: 13px;
}

.invoice-panel,
.invoice-list-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 18px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.invoice-panel {
  display: grid;
  gap: 14px;
}

.invoice-panel__head strong {
  color: #b26b1c;
  font-size: 13px;
}

.invoice-panel label {
  display: grid;
  gap: 6px;
  color: #344054;
  font-size: 13px;
  font-weight: 700;
}

.invoice-panel input,
.invoice-panel select {
  width: 100%;
  min-height: 40px;
  box-sizing: border-box;
  border: 1px solid #d0d5dd;
  border-radius: 7px;
  padding: 8px 10px;
  color: #172033;
  background: #fff;
}

.invoice-list-panel {
  margin-top: 0;
}

.invoice-empty {
  padding: 30px 0 16px;
  text-align: center;
  color: #667085;
  font-size: 14px;
}

.invoice-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.invoice-row {
  padding: 12px 0;
  border-top: 1px solid #eef0f3;
  align-items: center;
}

.invoice-row__main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.invoice-row__main strong {
  font-size: 14px;
  color: #172033;
}

.invoice-row__main span,
.invoice-row__main small,
.invoice-row__note {
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}

.invoice-row__main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invoice-row__side {
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  max-width: 420px;
}

.invoice-row__side input[type='file'] {
  max-width: 210px;
  font-size: 12px;
}

.invoice-row__side a {
  color: #247f7d;
  font-size: 13px;
}

.invoice-status {
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 12px;
  font-weight: 800;
}

.invoice-status--requested {
  background: #fff4d6;
  color: #9a6700;
}

.invoice-status--under_review {
  background: #e6f4f4;
  color: #247f7d;
}

.invoice-status--approved {
  background: #e5f7ec;
  color: #247a46;
}

.invoice-status--rejected {
  background: #fdecec;
  color: #b42318;
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

@media (max-width: 900px) {
  .invoice-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .invoice-center__toolbar,
  .invoice-list-panel__head,
  .invoice-row {
    display: grid;
  }

  .invoice-stats {
    grid-template-columns: 1fr;
  }

  .invoice-entry-grid {
    grid-template-columns: 1fr;
  }

  .invoice-row__side {
    justify-content: flex-start;
    max-width: none;
  }
}
</style>
