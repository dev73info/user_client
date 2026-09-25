<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Refresh, RefreshLeft, Search, UploadFilled } from '@element-plus/icons-vue'

import InvoiceApplyDialog from '@/components/InvoiceApplyDialog.vue'
import {
  listMyInvoices,
  downloadInvoiceDocument,
  uploadInvoiceDocument,
  type InvoiceRecord,
} from '@/api/invoices'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { canUploadInvoiceDocument, invoiceDisplayStatus, invoiceInWorkbench, invoiceReviewNote, invoiceWaitingHint } from '@/shared/invoiceAction'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const { showToast } = useToast()
const route = useRoute()

/**
 * 这一页站在哪一侧看票：跟着工作台走，不跟着「我在某张票里是谁」走。
 *
 * 发票中心两端各有一个入口——「客户工作台 → 账户服务 → 发票中心」（`/workbench/invoices`）与
 * 「开发者工作台 → 财务中心 → 发票中心」（`/workbench/developer/invoices`，路由带 devArea）。
 * 列表接口一次把两端共用的票都返回，这里按当前工作台分：客户工作台只看我作为买方的票（查看、
 * 下载），开发者工作台只看我作为乙方的收入票（查看、上传）。判定与文案都见 `@/shared/invoiceAction`。
 */
const perspective = computed<'customer' | 'developer'>(
  () => (route.matched.some((record) => Boolean(record.meta.devArea)) ? 'developer' : 'customer'),
)

/* 卡头说明也按视角写：客户工作台说的是我收到的票，不提「上传」，那是乙方那一侧的动作。 */
const cardDescription = computed(() => (
  perspective.value === 'developer'
    ? '你在各需求里以乙方身份开给客户的收入票：上传发票文件后即视为已开具，客户可下载。'
    : '你申请开出的票都列在这里：平台服务费票，以及乙方开给你的收入票，开好后可在此查看与下载。'
))

const loading = ref(false)
/** 接口返回的原始列表：两端共用的票都在里面，按工作台分过之后才是这一页要显示的。 */
const allInvoices = ref<InvoiceRecord[]>([])

/**
 * 这一页要显示的票：跟着当前工作台走，另一侧的票整行都不出现（判定见 `@/shared/invoiceAction`）。
 * 读数条、筛选、分页都以它为基数，所以过滤后「全部记录」就是这一侧的票数。
 */
const invoices = computed(() => allInvoices.value.filter(
  (invoice) => invoiceInWorkbench(invoice, auth.username, perspective.value),
))
const selectedFileByInvoice = reactive<Record<number, File | undefined>>({})
const uploadingInvoiceId = ref<number | null>(null)
const downloadingInvoiceId = ref<number | null>(null)
const keyword = ref('')
const statusFilter = ref<'all' | InvoiceRecord['status']>('all')

/**
 * 状态筛选做成胶囊组：档位少、要能一眼看出当前选中项，与我的签署、我的收藏同一套做法。
 *
 * 筛选与读数都按**显示状态**分档（`invoiceDisplayStatus`），不是照读接口给的状态列。
 * 「审核中 / 需补充材料」只属于平台服务费票的审核流：开发者收入票由乙方上传即视为已开具，
 * 平台不审这张票，旧版本留在库里的 `under_review` 不该在这页变成一个平台并不执行的流程
 * （见 `backend_73info/src/modules/invoice/service.rs`）。
 */
const STATUS_FILTERS: Array<{ key: 'all' | InvoiceRecord['status']; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'requested', label: '待处理' },
  { key: 'under_review', label: '审核中' },
  { key: 'approved', label: '已开具' },
  { key: 'rejected', label: '需补充材料' },
  { key: 'reversed', label: '已红冲' },
]

const stats = computed(() => ({
  total: invoices.value.length,
  pending: invoices.value.filter((item) => {
    const status = invoiceDisplayStatus(item)
    return status === 'requested' || status === 'under_review'
  }).length,
  approved: invoices.value.filter((item) => invoiceDisplayStatus(item) === 'approved').length,
  reversed: invoices.value.filter((item) => invoiceDisplayStatus(item) === 'reversed' || item.documentKind === 'red').length,
}))

function statusCount(status: 'all' | InvoiceRecord['status']) {
  return status === 'all'
    ? invoices.value.length
    : invoices.value.filter((item) => invoiceDisplayStatus(item) === status).length
}

const filteredInvoices = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()
  return invoices.value.filter((invoice) => {
    const matchesStatus = statusFilter.value === 'all' || invoiceDisplayStatus(invoice) === statusFilter.value
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
    approved: '已开具',
    rejected: '需补充材料',
    reversed: '已红冲',
  }[status]
}

/** 状态徽标沿用统一层的「浅底 + 深字」，不要再各写一套饱和色。 */
function statusBadgeClass(status: InvoiceRecord['status']) {
  return {
    requested: 'wb-badge--warning',
    under_review: 'wb-badge--accent',
    approved: 'wb-badge--success',
    rejected: 'wb-badge--danger',
    // 已红冲是终态、不再需要动作，用 .wb-badge 的默认灰底（不加修饰类）。
    reversed: '',
  }[status]
}

/** 红字发票按负数列示：它是一条冲销凭证，和原蓝票加总才是净开票额。 */
function displayAmount(invoice: InvoiceRecord) {
  return `${invoice.documentKind === 'red' ? '-' : ''}¥${invoice.amountCny}`
}

/** 该需求、该开票主体能否重新申请：原票被红冲后同需求同主体可以再开一张新蓝票。 */
function canReapply(invoice: InvoiceRecord) {
  return invoice.documentKind === 'blue' && invoiceDisplayStatus(invoice) === 'reversed'
}

/** 行上的「审核说明」；开发者收入票没有审核这一步，它上面任何说明都不显示（见共享层）。 */
function reviewNote(invoice: InvoiceRecord) {
  return invoiceReviewNote(invoice)
}

/** 上传入口只属于「开发者工作台」里我作为乙方的那张票（两道条件见共享层）。 */
function canUploadDocument(invoice: InvoiceRecord) {
  return canUploadInvoiceDocument(invoice, auth.username, perspective.value)
}

/** 这张票现在等谁（等自己才给按钮）：把责任方摊在行上，免得「待处理」被当成在等当前用户。 */
function waitingHint(invoice: InvoiceRecord) {
  return invoiceWaitingHint(invoice, auth.username, perspective.value)
}

/* 重新申请复用需求页那支开票弹窗：原票已被红冲，后端判重已放开，这里直接把用户送回去开新票，
   不另做一套只弹提示的空按钮。弹窗按需求合并申请，自己算出这次还能开哪几张票，不必告诉它
   用户点的是哪一行。 */
const applyVisible = ref(false)
const applyRequirementId = ref('')
const applyRole = ref<'customer' | 'developer'>('customer')

function openReapply(invoice: InvoiceRecord) {
  applyRequirementId.value = invoice.requirementId
  // 弹窗按「我在这笔需求里是哪一方」发起，而不是按当前工作台：后端 `apply_invoices` 也是按操作者
  // 是买方还是乙方来判，弹窗的文案与可开金额必须跟真正会开出的票对得上。
  applyRole.value = invoice.customerUsername === auth.username ? 'customer' : 'developer'
  applyVisible.value = true
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
    allInvoices.value = await listMyInvoices(auth.token)
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
    allInvoices.value = allInvoices.value.map((item) => (item.id === updated.id ? updated : item))
    delete selectedFileByInvoice[invoice.id]
    showToast('发票文件已上传，客户可下载了', 'success')
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
    showToast(error instanceof Error ? error.message : '查看发票文件失败', 'error')
  }
}

/* 下载与查看走同一个接口取文件，区别只在拿到 blob 之后怎么用：查看是开一个新页签给浏览器预览，
   下载是落成一个文件。两个动作在两种工作台下都给（都是只读操作），与上传入口的判定无关。 */
const DOCUMENT_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** 落盘文件名：票号 + 抬头，便于财务与需求方按台账对号；抬头里的路径字符换掉。 */
function documentFileName(invoice: InvoiceRecord, mimeType: string) {
  const extension = DOCUMENT_EXTENSIONS[mimeType] ?? 'bin'
  const title = invoice.invoiceTitle.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60)
  return `${invoice.invoiceNo}-${title || '发票'}.${extension}`
}

async function saveDocument(invoice: InvoiceRecord) {
  if (!invoice.documentUrl) {
    return
  }
  downloadingInvoiceId.value = invoice.id
  try {
    const blob = await downloadInvoiceDocument(auth.token, invoice.id)
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = documentFileName(invoice, blob.type)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '下载发票文件失败', 'error')
  } finally {
    downloadingInvoiceId.value = null
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
        <span class="wb-strip__label">已开具</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.approved }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已红冲</span>
        <span class="wb-strip__value">{{ loading ? '—' : stats.reversed }}</span>
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
          <p class="wb-card-head__desc">{{ cardDescription }}</p>
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
              <span class="wb-item__title">
                {{ invoice.invoiceNo }}
                <span v-if="invoice.invoiceKind === 'special'"
                  class="invoice-center__kind invoice-center__kind--special">专用发票</span>
                <span v-if="invoice.documentKind === 'red'" class="invoice-center__kind">红字发票</span>
              </span>
              <span class="wb-item__meta">
                {{ roleLabel(invoice.invoiceRole) }} · 需求 {{ invoice.requirementId }} · {{ invoice.invoiceTitle }}
              </span>
              <span class="wb-item__meta">
                金额 {{ displayAmount(invoice) }} ·
                {{ invoice.invoiceRole === 'developer' ? developerTypeLabel(invoice.developerType) : '客户服务费' }}
              </span>
              <!-- 等待中的票要说清在等谁：状态词只说明走到哪一步，责任方才是用户真正想知道的。
                   开发者收入票在需求方这里就是「等乙方开」，平台票在谁那里都是「等平台财务开」。 -->
              <span v-if="waitingHint(invoice)" class="wb-item__meta">{{ waitingHint(invoice) }}</span>
              <!-- 专票的购买方四项资料：开发者要照这四项在电子税务局开票，直接摊在列表里省得再要一遍。 -->
              <span v-if="invoice.invoiceKind === 'special'" class="wb-item__meta">
                专票购买方资料：{{ invoice.buyerAddress }} · {{ invoice.buyerPhone }} ·
                {{ invoice.buyerBankName }} · {{ invoice.buyerBankAccount }}
              </span>
              <span v-if="invoice.documentKind === 'red' && invoice.reversalOfId" class="wb-item__meta">
                冲销原票 #{{ invoice.reversalOfId }}{{ invoice.reversalReason ? ` · ${invoice.reversalReason}` : '' }}
              </span>
              <span v-else-if="invoice.status === 'reversed'" class="wb-item__meta">
                红冲原因：{{ invoice.reversalReason || '未记录' }} · 当前应开 ¥{{ (invoice.currentInvoiceableFen / 100).toFixed(2) }}
              </span>
              <!-- 只有**多开**（建议冲减额为正）才轮得到红冲：票面比实际发生的净额大，财务先红冲再让
                   用户重开。建议冲减额为负是「票开少了、需补开」，与红冲是两回事——它的口径本来
                   就只扣已真正退出去的钱，开票当时在途的退款诉求不算数（见 `reversalSuggestionFen`
                   的注释），拿它去说「财务端会先红冲原票」既吓人又不成立。 -->
              <span v-else-if="invoice.reversalRequired && invoice.reversalSuggestionFen > 0" class="wb-item__meta">
                本需求可开票净额已变为 ¥{{ (invoice.currentInvoiceableFen / 100).toFixed(2) }}，财务端会先红冲原票
              </span>
              <span v-if="reviewNote(invoice)" class="wb-item__meta">审核说明：{{ reviewNote(invoice) }}</span>
            </div>
            <div class="wb-item__side">
              <span class="wb-badge" :class="statusBadgeClass(invoiceDisplayStatus(invoice))">{{ statusLabel(invoiceDisplayStatus(invoice)) }}</span>
              <el-button v-if="invoice.documentUrl" class="wb-toolbar__ghost" @click="openDocument(invoice)">
                <span>查看发票</span>
              </el-button>
              <el-button v-if="invoice.documentUrl" class="wb-toolbar__ghost"
                :loading="downloadingInvoiceId === invoice.id" @click="saveDocument(invoice)">
                <span>下载发票</span>
              </el-button>
              <el-button v-if="canReapply(invoice)" class="wb-toolbar__ghost" @click="openReapply(invoice)">
                <span>重新申请</span>
              </el-button>
              <el-button v-if="canUploadDocument(invoice)" class="wb-toolbar__ghost"
                :loading="uploadingInvoiceId === invoice.id"
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

    <!-- 原票被红冲后从这里重新申请：复用需求页那支开票弹窗，它按需求算出这次能重开哪几张票。 -->
    <InvoiceApplyDialog v-model:visible="applyVisible" :token="auth.token"
      :requirement-id="applyRequirementId" :role="applyRole" @submitted="loadData" />
  </main>
</template>

<style scoped>
/* 版式全部走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-list / .wb-pager / .wb-empty /
   .wb-badge），本页不再自带色板与圆角：原来这里的青色 #247f7d、青色状态底、1180px 容器宽度
   都是这一页独有的，换成统一层后与其余菜单页一致。 */
.invoice-center__file {
  display: none;
}

/* 票种与票性的标注：一枚小签，跟发票号同行，不抢状态徽标的位置。
   红字发票用浅红底；专用发票用主色底，客户一眼能认出自己申请的是哪一种。 */
.invoice-center__kind {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.12);
  color: var(--profile-danger-text, #b42318);
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

.invoice-center__kind--special {
  background: var(--profile-accent-soft, rgba(79, 140, 255, 0.12));
  color: var(--profile-accent, #4f8cff);
}
</style>
