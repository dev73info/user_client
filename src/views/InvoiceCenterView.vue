<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import {
  listMyInvoices,
  downloadInvoiceDocument,
  uploadInvoiceDocument,
  type InvoiceRecord,
} from '@/api/invoices'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const invoices = ref<InvoiceRecord[]>([])
const selectedFileByInvoice = reactive<Record<number, File | undefined>>({})
const uploadingInvoiceId = ref<number | null>(null)

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

async function loadData() {
  if (!auth.token) {
    return
  }
  loading.value = true
  try {
    invoices.value = await listMyInvoices(auth.token)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载发票数据失败', 'error')
  } finally {
    loading.value = false
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
      <p class="invoice-center__desc">
        发票台账：开票申请在需求的操作栏发起，这里统一查看进度、上传与下载发票文件。
      </p>
      <button class="invoice-center__refresh" type="button" :disabled="loading" @click="loadData">
        {{ loading ? '加载中...' : '刷新' }}
      </button>
    </div>

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

.invoice-center__refresh {
  flex-shrink: 0;
}

.invoice-center__refresh,
.invoice-row__side button {
  border: 0;
  border-radius: 8px;
  padding: 9px 14px;
  background: #247f7d;
  color: #fff;
  cursor: pointer;
}

.invoice-center__refresh:disabled,
.invoice-row__side button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.invoice-panel__kicker {
  color: #247f7d;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.invoice-list-panel h2 {
  margin: 4px 0 0;
}

/* 记录面板计数 */
.invoice-list-panel__count {
  color: #667085;
  font-size: 13px;
}

.invoice-list-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 18px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.invoice-list-panel__head,
.invoice-row,
.invoice-row__side {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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
  .invoice-center__toolbar,
  .invoice-list-panel__head,
  .invoice-row {
    display: grid;
  }

  .invoice-row__side {
    justify-content: flex-start;
    max-width: none;
  }
}
</style>
