<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Refresh, RefreshLeft, Search, UploadFilled } from '@element-plus/icons-vue'

import {
  listMyInvoices,
  downloadInvoiceDocument,
  uploadInvoiceDocument,
  type InvoiceRecord,
} from '@/api/invoices'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const invoices = ref<InvoiceRecord[]>([])
const selectedFileByInvoice = reactive<Record<number, File | undefined>>({})
const uploadingInvoiceId = ref<number | null>(null)
const keyword = ref('')
const statusFilter = ref<'all' | InvoiceRecord['status']>('all')

/** 状态筛选做成胶囊组：档位少、要能一眼看出当前选中项，与我的签署、我的收藏同一套做法。 */
const STATUS_FILTERS: Array<{ key: 'all' | InvoiceRecord['status']; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'requested', label: '待处理' },
  { key: 'under_review', label: '审核中' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '需补充材料' },
]

const stats = computed(() => ({
  total: invoices.value.length,
  pending: invoices.value.filter((item) => item.status === 'requested' || item.status === 'under_review').length,
  approved: invoices.value.filter((item) => item.status === 'approved').length,
}))

function statusCount(status: 'all' | InvoiceRecord['status']) {
  return status === 'all' ? invoices.value.length : invoices.value.filter((item) => item.status === status).length
}

const filteredInvoices = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return invoices.value.filter((invoice) => {
    const matchesStatus = statusFilter.value === 'all' || invoice.status === statusFilter.value
    const matchesSearch = !search || [invoice.invoiceNo, invoice.requirementId, invoice.invoiceTitle]
      .some((field) => field?.toLocaleLowerCase().includes(search))
    return matchesStatus && matchesSearch
  })
})

const hasActiveFilters = computed(() => keyword.value.trim() !== '' || statusFilter.value !== 'all')

/* 一次取回全部发票、筛选在前端做，所以是客户端分页（与其余菜单页同一套页码口径）。 */
const {
  page,
  pageSize,
  total: filteredTotal,
  paged: pagedInvoices,
  resetPage,
} = useClientPagination(filteredInvoices)

/* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
watch([keyword, statusFilter], resetPage)

function resetFilters() {
  keyword.value = ''
  statusFilter.value = 'all'
}

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

/** 状态徽标沿用统一层的「浅底 + 深字」，不要再各写一套饱和色。 */
function statusBadgeClass(status: InvoiceRecord['status']) {
  return {
    requested: 'wb-badge--warning',
    under_review: 'wb-badge--accent',
    approved: 'wb-badge--success',
    rejected: 'wb-badge--danger',
  }[status]
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

/* 文件选择用「一个隐藏 input + 行上的 ghost 按钮」：native input 的默认外观与统一层的控件不同档，
   每行各挂一个又要点名 ref。记下这一行是哪张发票，选完文件按 id 回填即可。 */
const hiddenFileInput = ref<HTMLInputElement | null>(null)
const pickingInvoiceId = ref<number | null>(null)

function pickInvoiceFile(invoiceId: number) {
  pickingInvoiceId.value = invoiceId
  hiddenFileInput.value?.click()
}

function selectInvoiceFile(event: Event) {
  const input = event.target as HTMLInputElement
  const invoiceId = pickingInvoiceId.value
  const file = input.files?.[0]
  if (file && invoiceId !== null) {
    selectedFileByInvoice[invoiceId] = file
  }
  // 清空 value，否则同一张发票连选两次同一个文件不会触发 change
  input.value = ''
}

async function uploadDocument(invoice: InvoiceRecord) {
  const file = selectedFileByInvoice[invoice.id]
  if (!file) {
    pickInvoiceFile(invoice.id)
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

function uploadButtonLabel(invoice: InvoiceRecord) {
  if (uploadingInvoiceId.value === invoice.id) return '上传中…'
  return selectedFileByInvoice[invoice.id] ? '上传发票' : '选择文件'
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
  <main class="page-shell custom-page-shell profile-page invoice-center-page" :aria-busy="loading">
    <!-- 顶部读数条：读数在左，页面级刷新固定在右上角 __action 槽 -->
    <div class="wb-strip" aria-label="发票概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">全部记录</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.total }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">处理中</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.pending }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已通过</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.approved }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <el-button class="wb-toolbar__icon-btn" :loading="loading" aria-label="刷新发票记录" @click="loadData">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的发票记录</h3>
          <p class="wb-card-head__desc">
            获取发票的入口在需求的操作栏，这里统一查看进度、上传与下载发票文件。
          </p>
        </div>
      </div>

      <div v-if="invoices.length || hasActiveFilters" class="wb-toolbar">
        <div class="wb-chip-group" role="group" aria-label="按状态筛选">
          <button v-for="option in STATUS_FILTERS" :key="option.key" type="button" class="wb-chip wb-chip--button"
            :class="{ 'is-active': statusFilter === option.key }" :aria-pressed="statusFilter === option.key"
            @click="statusFilter = option.key">
            {{ option.label }}<span class="wb-chip__count">{{ statusCount(option.key) }}</span>
          </button>
        </div>
        <el-input v-model="keyword" class="wb-toolbar__search" clearable
          placeholder="搜索发票号、需求编号或发票标题" aria-label="搜索发票">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <div class="wb-toolbar__actions">
          <span v-if="hasActiveFilters" class="wb-toolbar__hint">
            筛选出 {{ filteredTotal }} / {{ invoices.length }} 条
          </span>
          <el-button v-if="hasActiveFilters" class="wb-toolbar__ghost" @click="resetFilters">
            <el-icon><RefreshLeft /></el-icon><span>重置</span>
          </el-button>
        </div>
      </div>

      <p v-if="loading && !invoices.length" class="wb-empty" role="status">正在加载发票记录…</p>
      <div v-else-if="!filteredInvoices.length" class="wb-empty">
        <span class="wb-empty__title">{{ invoices.length ? '没有符合条件的发票' : '还没有发票记录' }}</span>
        <template v-if="invoices.length">
          换个状态或关键字再试一次。
          <div class="wb-empty__actions">
            <el-button class="wb-toolbar__ghost" @click="resetFilters">
              <el-icon><RefreshLeft /></el-icon><span>清除筛选</span>
            </el-button>
          </div>
        </template>
        <template v-else>获取发票的入口在对应需求的操作栏里，提交后会在这里出现。</template>
      </div>
      <template v-else>
        <input ref="hiddenFileInput" class="invoice-center__file" type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp" aria-hidden="true" tabindex="-1"
          @change="selectInvoiceFile" />
        <ul class="wb-list" aria-label="我的发票记录">
          <li v-for="invoice in pagedInvoices" :key="invoice.id" class="wb-item">
            <div class="wb-item__main">
              <span class="wb-item__title">{{ invoice.invoiceNo }}</span>
              <span class="wb-item__meta">
                {{ roleLabel(invoice.invoiceRole) }} · 需求 {{ invoice.requirementId }} · {{ invoice.invoiceTitle }}
              </span>
              <span class="wb-item__meta">
                金额 ¥{{ invoice.amountCny }} ·
                {{ invoice.invoiceRole === 'developer' ? developerTypeLabel(invoice.developerType) : '客户服务费' }}
              </span>
              <span v-if="invoice.reviewNote" class="wb-item__meta">审核说明：{{ invoice.reviewNote }}</span>
            </div>
            <div class="wb-item__side">
              <span class="wb-badge" :class="statusBadgeClass(invoice.status)">{{ statusLabel(invoice.status) }}</span>
              <el-button v-if="invoice.documentUrl" class="wb-toolbar__ghost" @click="openDocument(invoice)">
                <span>查看文件</span>
              </el-button>
              <el-button v-if="invoice.invoiceRole === 'developer' && invoice.status !== 'approved'"
                class="wb-toolbar__ghost" :loading="uploadingInvoiceId === invoice.id"
                :disabled="uploadingInvoiceId !== null && uploadingInvoiceId !== invoice.id"
                @click="selectedFileByInvoice[invoice.id] ? uploadDocument(invoice) : pickInvoiceFile(invoice.id)">
                <el-icon><UploadFilled /></el-icon><span>{{ uploadButtonLabel(invoice) }}</span>
              </el-button>
            </div>
          </li>
        </ul>
        <div class="wb-pager">
          <div class="wb-pager__count">
            <span>共 {{ filteredTotal }} 条记录</span>
            <el-select v-model="pageSize" class="wb-pager__size" aria-label="每页记录数">
              <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
            </el-select>
          </div>
          <el-pagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
            :pager-count="5" layout="prev, pager, next" background aria-label="发票记录分页" />
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
/* 版式全部走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-list / .wb-pager / .wb-empty /
   .wb-badge），本页不再自带色板与圆角：原来这里的青色 #247f7d、青色状态底、1180px 容器宽度
   都是这一页独有的，换成统一层后与其余菜单页一致。 */
.invoice-center__file {
  display: none;
}
</style>
