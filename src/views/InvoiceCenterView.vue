<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

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

onMounted(() => {
  auth.hydrate()
  void loadData()
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

async function submitPlatformInvoice() {
  const payment = selectedPlatformPayment.value
  if (!payment || !platformForm.invoiceTitle.trim()) {
    showToast('请选择支付节点并填写发票抬头', 'warning')
    return
  }
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
    showToast('平台发票申请已提交', 'success')
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
    showToast('开发者发票申请已创建，请上传发票文件', 'success')
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
    <header class="invoice-center__head">
      <div>
        <span class="invoice-center__eyebrow">INVOICE / COMPLIANCE</span>
        <h1>发票中心</h1>
        <p>平台服务费由平台开具，开发者按自身主体开具服务收入发票并上传留痕。</p>
      </div>
      <button class="invoice-center__refresh" type="button" :disabled="loading" @click="loadData">
        {{ loading ? '加载中...' : '刷新' }}
      </button>
    </header>

    <section class="invoice-center__forms">
      <article class="invoice-panel">
        <div class="invoice-panel__head">
          <div>
            <span class="invoice-panel__kicker">CUSTOMER / PLATFORM</span>
            <h2>申请平台服务费发票</h2>
          </div>
          <strong>平台开具</strong>
        </div>
        <p class="invoice-panel__hint">开票金额以平台服务费结算记录为准，不包含开发者收入。</p>
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
        <button class="invoice-panel__submit" type="button" :disabled="submitting !== null" @click="submitPlatformInvoice">
          {{ submitting === 'platform' ? '提交中...' : '提交平台开票申请' }}
        </button>
      </article>

      <article class="invoice-panel">
        <div class="invoice-panel__head">
          <div>
            <span class="invoice-panel__kicker">DEVELOPER / SELF ISSUED</span>
            <h2>申请开发者发票</h2>
          </div>
          <strong>开发者开具</strong>
        </div>
        <p class="invoice-panel__hint">开发者按实名主体开具，企业和个体工商户需填写税号。</p>
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
        <button class="invoice-panel__submit" type="button" :disabled="submitting !== null" @click="submitDeveloperInvoice">
          {{ submitting === 'developer' ? '提交中...' : '创建开发者开票记录' }}
        </button>
      </article>
    </section>

    <section class="invoice-list-panel">
      <div class="invoice-list-panel__head">
        <div>
          <span class="invoice-panel__kicker">TRACEABLE LEDGER</span>
          <h2>我的发票记录</h2>
        </div>
        <span>{{ invoices.length }} 条</span>
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
  padding: 32px 20px 56px;
  color: #172033;
}

.invoice-center__head,
.invoice-panel__head,
.invoice-list-panel__head,
.invoice-row,
.invoice-row__side {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.invoice-center__eyebrow,
.invoice-panel__kicker {
  color: #247f7d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.invoice-center h1,
.invoice-panel h2,
.invoice-list-panel h2 {
  margin: 6px 0 0;
}

.invoice-center__head p,
.invoice-panel__hint {
  color: #667085;
  font-size: 14px;
  line-height: 1.7;
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

.invoice-center__forms {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 26px;
}

.invoice-panel,
.invoice-list-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 22px;
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
  margin-top: 22px;
}

.invoice-list-panel__head > span {
  color: #667085;
  font-size: 13px;
}

.invoice-empty {
  padding: 42px 0 20px;
  text-align: center;
  color: #667085;
}

.invoice-list {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.invoice-row {
  padding: 14px 0;
  border-top: 1px solid #eef0f3;
}

.invoice-row__main {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.invoice-row__main span,
.invoice-row__main small,
.invoice-row__note {
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
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

@media (max-width: 760px) {
  .invoice-center__head,
  .invoice-row {
    display: grid;
  }

  .invoice-center__forms {
    grid-template-columns: 1fr;
  }

  .invoice-row__side {
    justify-content: flex-start;
    max-width: none;
  }
}
</style>
