import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import {
  downloadInvoiceDocument,
  listMyInvoices,
  uploadInvoiceDocument,
  type InvoiceRecord,
} from '@/api/invoices'
import { useClientPagination } from '@/composables/useClientPagination'
import {
  canUploadInvoiceDocument,
  invoiceDisplayStatus,
  invoiceInWorkbench,
  invoiceReviewNote,
  invoiceWaitingHint,
} from '@/shared/invoiceAction'
import { invoiceDocumentFileName } from '@/shared/invoiceDisplay'
import {
  groupInvoicesByRequirement,
  invoiceGroupHasPending,
  invoiceGroupMatchesKeyword,
  invoiceGroupMatchesStatus,
  type InvoiceGroup,
} from '@/shared/invoiceGroups'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/** 一屏里的一张卡：一个需求一组票（判定与理由见 `@/shared/invoiceGroups`）。 */
export type InvoiceCard = InvoiceGroup<InvoiceRecord>

/**
 * 「我的发票」的数据与动作。
 *
 * 从 `views/InvoiceCenterView.vue` 抽出：页面只负责排版，取数、分页、筛选、上传/下载、
 * 重新申请弹窗的状态都在这里。逻辑与文案口径没有变化，逐段注释见各函数。
 */
export function useInvoiceCenter() {
  const auth = useAuthStore()
  const route = useRoute()

  /**
   * 这一页站在哪一侧看票：跟着工作台走，不跟着「我在某张票里是谁」走。
   * 「客户工作台 → 账户服务 → 我的发票」（`/workbench/invoices`）与
   * 「开发者工作台 → 财务中心 → 我的发票」（带 `devArea` 的 meta）共用这一页。
   */
  const perspective = computed<'customer' | 'developer'>(() =>
    route.matched.some((record) => Boolean(record.meta.devArea)) ? 'developer' : 'customer',
  )

  const loading = ref(false)
  /** 接口返回的原始列表：两端共用的票都在里面，按工作台分过之后才是这一页要显示的。 */
  const allInvoices = ref<InvoiceRecord[]>([])

  /** 这一页要显示的票：另一侧的票整行都不出现（判定见 `@/shared/invoiceAction`）。 */
  const invoices = computed(() =>
    allInvoices.value.filter((invoice) =>
      invoiceInWorkbench(invoice, auth.username, perspective.value),
    ),
  )

  const groups = computed<InvoiceCard[]>(() => groupInvoicesByRequirement(invoices.value))
  const selectedFileByInvoice = reactive<Record<number, File | undefined>>({})
  const uploadingInvoiceId = ref<number | null>(null)
  const downloadingInvoiceId = ref<number | null>(null)
  const keyword = ref('')
  const statusFilter = ref<'all' | InvoiceRecord['status']>('all')

  /**
   * 顶部读数：按需求计（一张卡 = 一条记录），卡内任一票处在这一档就算进去。
   * 各档之和可能大于「全部记录」——这是按需求计的必然结果，不是重复计算。
   */
  const stats = computed(() => ({
    total: groups.value.length,
    pending: groups.value.filter(invoiceGroupHasPending).length,
    approved: groups.value.filter((group) => invoiceGroupMatchesStatus(group, 'approved')).length,
    reversed: groups.value.filter((group) => invoiceGroupMatchesStatus(group, 'reversed')).length,
  }))

  /** 筛选也按卡走：卡内任一票命中状态、且需求号 / 抬头 / 任一张票号命中关键词，这张卡就留下。 */
  const filteredGroups = computed(() =>
    groups.value.filter((group) => {
      const matchesStatus =
        statusFilter.value === 'all' || invoiceGroupMatchesStatus(group, statusFilter.value)
      return matchesStatus && invoiceGroupMatchesKeyword(group, keyword.value)
    }),
  )

  const hasActiveFilters = computed(
    () => keyword.value.trim() !== '' || statusFilter.value !== 'all',
  )

  /* 一次取回全部发票、筛选在前端做，所以是客户端分页（与其余菜单页同一套页码口径）。
     页码翻的是**卡**：一张卡 = 一个需求，不会被分页切开。 */
  const {
    page,
    pageSize,
    total: filteredTotal,
    paged: pagedGroups,
    resetPage,
  } = useClientPagination(filteredGroups)

  /* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
  watch([keyword, statusFilter], resetPage)

  function resetFilters() {
    keyword.value = ''
    statusFilter.value = 'all'
  }

  /* ---------- 动作判定：薄封装共享层，页面与卡片只调这些 ---------- */

  /** 原票被红冲后同需求同主体可以再开一张新蓝票。 */
  function canReapply(invoice: InvoiceRecord) {
    return invoice.documentKind === 'blue' && invoiceDisplayStatus(invoice) === 'reversed'
  }

  /** 这张卡里有没有票能重开：卡头据此给「重新申请」。 */
  function canReapplyGroup(group: InvoiceCard) {
    return group.invoices.some(canReapply)
  }

  function reviewNote(invoice: InvoiceRecord) {
    return invoiceReviewNote(invoice)
  }

  /** 上传入口只属于「开发者工作台」里我作为乙方的那张票（见共享层）。 */
  function canUploadDocument(invoice: InvoiceRecord) {
    return canUploadInvoiceDocument(invoice, auth.username, perspective.value)
  }

  /** 这张票现在等谁（等自己才给按钮）：把责任方摊在行上。 */
  function waitingHint(invoice: InvoiceRecord) {
    return invoiceWaitingHint(invoice, auth.username, perspective.value)
  }

  /* ---------- 发票文件：选择 / 上传 / 查看 / 下载 ---------- */

  /* 文件选择用「一个隐藏 input + 行上的 ghost 按钮」：native input 的默认外观与统一层
     不同档，每行各挂一个又要点名 ref。记下这一行是哪张发票，选完文件按 id 回填。 */
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
      const replacing = Boolean(invoice.documentUrl)
      const updated = await uploadInvoiceDocument(auth.token, invoice.id, file)
      allInvoices.value = allInvoices.value.map((item) => (item.id === updated.id ? updated : item))
      delete selectedFileByInvoice[invoice.id]
      TMessage.success(
        replacing ? '发票文件已替换，客户下载到的就是这一份' : '发票文件已上传，客户可下载了',
      )
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传发票文件失败')
    } finally {
      uploadingInvoiceId.value = null
    }
  }

  /** 下载与查看走同一个接口取文件，区别只在拿到 blob 之后怎么用。 */
  async function openDocument(invoice: InvoiceRecord) {
    if (!invoice.documentUrl) return
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
      TMessage.error(error instanceof Error ? error.message : '查看发票文件失败')
    }
  }

  async function saveDocument(invoice: InvoiceRecord) {
    if (!invoice.documentUrl) return
    downloadingInvoiceId.value = invoice.id
    try {
      const blob = await downloadInvoiceDocument(auth.token, invoice.id)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = invoiceDocumentFileName(invoice, blob.type)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '下载发票文件失败')
    } finally {
      downloadingInvoiceId.value = null
    }
  }

  /* ---------- 重新申请：复用需求页那支开票弹窗 ---------- */

  const applyVisible = ref(false)
  const applyRequirementId = ref('')
  const applyRole = ref<'customer' | 'developer'>('customer')

  function openReapply(group: InvoiceCard) {
    applyRequirementId.value = group.requirementId
    // 弹窗按「我在这笔需求里是哪一方」发起：后端也是按操作者是买方还是乙方来判。
    applyRole.value = group.invoices.some((invoice) => invoice.customerUsername === auth.username)
      ? 'customer'
      : 'developer'
    applyVisible.value = true
  }

  async function loadData() {
    if (!auth.token) return
    loading.value = true
    try {
      allInvoices.value = await listMyInvoices(auth.token)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载发票数据失败')
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    auth.hydrate()
    void loadData()
  })

  return {
    // 身份与工作台
    auth,
    perspective,
    // 数据
    loading,
    groups,
    filteredGroups,
    filteredTotal,
    pagedGroups,
    stats,
    keyword,
    statusFilter,
    hasActiveFilters,
    resetFilters,
    // 分页
    page,
    pageSize,
    // 文件与上传
    selectedFileByInvoice,
    uploadingInvoiceId,
    downloadingInvoiceId,
    hiddenFileInput,
    pickInvoiceFile,
    selectInvoiceFile,
    uploadDocument,
    openDocument,
    saveDocument,
    // 判定
    canReapply,
    canReapplyGroup,
    reviewNote,
    canUploadDocument,
    waitingHint,
    // 重新申请
    applyVisible,
    applyRequirementId,
    applyRole,
    openReapply,
    // 刷新
    loadData,
  }
}
