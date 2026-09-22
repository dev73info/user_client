<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Refresh, RefreshLeft, Search, View } from '@element-plus/icons-vue'

import {
  listMcResources,
  listMcResourceVersions,
  type McResourcePayload,
  type McResourceVersionPayload,
} from '@/api/mcResources'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import { getDevWalletOverview, type DevWalletIncomeItem } from '@/api/devWallet'
import { useToast } from '@/composables/useToast'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'

/* 一行 = 一个需求单（没绑定需求的资源按资源汇总成一行）。交付侧来自「我的资源 + 资源版本」，
   回款侧来自钱包接口的尾款到账。两批数据原来是两张表，粒度不同：
   回执是一笔分账一行（托管模式下定金与尾款各一次分账，一个需求通常两笔），
   交付是一个资源版本一行，而需求与资源版本又是一对多——直接按版本拼，
   同一个需求有多个版本时同一笔钱会在多行重复出现。
   合并时统一到需求这一层：交付取最新版本加版本总数，到账取合计金额加笔数。 */
/* 一笔到账：托管模式下定金与尾款各分账一次，一个需求通常两笔，
   所以行上只放合计与笔数，逐笔摊开在「回款详情」弹窗里。 */
type ReleaseReceipt = {
  paymentId: string
  amount: number
  paidAt: string
}

type ReleaseRow = {
  requirementId: string | null
  requirementTitle: string | null
  /* 需求状态有两个来源：需求列表给的是字面量联合，钱包回执给的是 string，
     合并成一张表后只能取宽的那个，标签文案与色调再由 settlementText 统一映射。 */
  requirementStatus: string | null
  settlementText: string
  resourceId: number | null
  resourceTitle: string | null
  platform: McResourcePayload['platform'] | null
  resourceVisibility: McResourcePayload['visibility'] | null
  latestVersion: string | null
  latestVersionAt: string | null
  versionCount: number
  customer: string | null
  receipts: ReleaseReceipt[]
}

const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const releaseRows = ref<ReleaseRow[]>([])

/* 回款详情弹窗：行上只留合计与笔数，点开才把逐笔到账摊开。
   这里存的是行标识而不是行快照：弹窗开着时点顶部刷新，下面仍从最新的数据里重新找同一行，
   不会留下一份过期的金额。 */
const receiptDialogVisible = ref(false)
const activeReceiptId = ref<string | null>(null)

const activeReceiptRow = computed(
  () =>
    releaseRows.value.find(
      (row) => rowKey(row.requirementId, row.resourceId ?? undefined) === activeReceiptId.value,
    ) ?? null,
)

/* 合并成一张表后筛选也只剩一套：关键字同时覆盖交付侧与回款侧的字段，
   资源状态与回款进度各作用在自己那一列，不存在两段条件互相干扰的问题。 */
const filters = reactive({
  keyword: '',
  visibility: '',
  settlement: '',
})

/* 回款进度的筛选项按行上实际出现的取值生成，顺序沿用业务推进顺序。
   写死选项会漏——原来就没有「待分账」，切到那一档筛不出任何东西；
   从数据里取值再加兜底，后端将来新增状态也不会筛不到。 */
const SETTLEMENT_ORDER = ['已回款', '待分账', '待付尾款', '开发中', '仅定金', '未关联'] as const

const settlementOptions = computed(() => {
  const present = new Set(releaseRows.value.map((item) => item.settlementText))
  const ordered = SETTLEMENT_ORDER.filter((value) => present.has(value))
  const extras = [...present].filter(
    (value) => !(SETTLEMENT_ORDER as readonly string[]).includes(value),
  )

  return [...ordered, ...extras].map((value) => ({ value, label: value }))
})

const hasActiveFilters = computed(
  () =>
    Boolean(filters.keyword.trim()) || Boolean(filters.visibility) || Boolean(filters.settlement),
)

/* 搜索覆盖交付物、需求编号、委托方与支付流水号：开发者核对一笔到账时，
   手里多数只有其中任意一个标识，四个都给上才不用先猜是哪个字段。
   委托方与流水号在表格里不占列（列宽给了交付与回款本身），但搜索照样能命中。 */
const filteredRows = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return releaseRows.value.filter((item) => {
    if (filters.visibility && item.resourceVisibility !== filters.visibility) {
      return false
    }

    if (filters.settlement && item.settlementText !== filters.settlement) {
      return false
    }

    if (!keyword) {
      return true
    }

    return [
      item.resourceTitle || '',
      item.latestVersion || '',
      item.requirementId || '',
      item.requirementTitle || '',
      item.customer || '',
      item.receipts.map((receipt) => receipt.paymentId).join(' '),
    ].some((value) => value.toLowerCase().includes(keyword))
  })
})

/* 顶部信息条三格：与资源列表、团队资源同样是「标签 + 读数」，
   读数不补零（原来 padStart(2) 会把 0 显示成「00」，与同排的其它页面不一致）。 */
const totalVersionCount = computed(() =>
  releaseRows.value.reduce((total, item) => total + item.versionCount, 0),
)
const linkedRequirementCount = computed(
  () => releaseRows.value.filter((item) => item.requirementId).length,
)
const latestRelease = computed(() =>
  releaseRows.value.reduce<ReleaseRow | null>((latest, item) => {
    if (!item.latestVersion || !item.latestVersionAt) {
      return latest
    }
    if (!latest?.latestVersionAt) {
      return item
    }
    return timeValue(item.latestVersionAt) > timeValue(latest.latestVersionAt) ? item : latest
  }, null),
)

const releaseStats = computed(() => [
  {
    label: '版本总数',
    value: String(totalVersionCount.value),
  },
  {
    label: '关联需求',
    value: String(linkedRequirementCount.value),
  },
  {
    label: '最近交付',
    value: latestRelease.value?.latestVersion ?? '—',
  },
])

onMounted(async () => {
  auth.hydrate()
  await loadPage()
})

function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }

  return `¥${value.toFixed(2)}`
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* 时间串有 `YYYY-MM-DD HH:mm:ss` 与资源版本接口两种格式，解析不出来时按 0 处理：
   排序退到末尾，而不是把整份列表打乱。 */
function timeValue(value: string | null) {
  if (!value) {
    return 0
  }

  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/* 到账合计与最近一笔：行上显示的就是这两个读数，
   逐笔明细在回款详情弹窗里，两处都由 receipts 这一份数据算出来。 */
function receiptTotal(receipts: ReleaseReceipt[]) {
  return receipts.reduce((total, item) => total + item.amount, 0)
}

function latestReceiptAt(receipts: ReleaseReceipt[]) {
  return receipts.reduce<string | null>((latest, item) => {
    if (!latest) {
      return item.paidAt
    }
    return timeValue(item.paidAt) > timeValue(latest) ? item.paidAt : latest
  }, null)
}

/* 到账时间列：没有到账的行给占位符，有到账的走 formatTime。
   合成一个函数，模板里就不必写「先判空再断言非空」的三元。 */
function receiptTimeText(receipts: ReleaseReceipt[]) {
  const latest = latestReceiptAt(receipts)
  return latest ? formatTime(latest) : '—'
}

/* 排序取「最近一次动静」：有回执的行看尾款到账时间，没有的看最新版本的交付时间。 */
function rowSortTime(row: ReleaseRow) {
  return timeValue(latestReceiptAt(row.receipts)) || timeValue(row.latestVersionAt)
}

function platformText(value: string | null) {
  return value || '未知平台'
}

/* 资源状态的文案只留 visibilityText 一处：筛选项的标签由它生成，
   模板里不再抄一份「已公开 / 审核中 / 私有」的中文。 */
function visibilityText(value: McResourcePayload['visibility']) {
  if (value === 'published') {
    return '已公开'
  }
  if (value === 'review') {
    return '审核中'
  }
  return '私有'
}

const VISIBILITY_OPTIONS = (['published', 'review', 'draft'] as const).map((value) => ({
  value,
  label: visibilityText(value),
}))

/* 回款进度的文案与色调只留这一处：表格里的标签、筛选项与色调都从这里取，
   不在模板里再抄一份判断（原来表格里是一段两层嵌套的三元表达式）。 */
function settlementTagType(status: string | null): 'success' | 'warning' | 'info' {
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'pending_final') {
    return 'warning'
  }
  return 'info'
}

function settlementText(status: string | null) {
  if (status === 'completed') {
    return '已回款'
  }
  if (status === 'pending_settlement') {
    // 尾款已缴但分账还在等待期，钱到账了、结算动作还没落地。
    return '待分账'
  }
  if (status === 'pending_final') {
    return '待付尾款'
  }
  if (status === 'in_development') {
    return '开发中'
  }
  if (status === 'deposit_paid') {
    return '仅定金'
  }
  return '未关联'
}

/* 交付物副行：平台 · 最新版本（多个版本时补上版本总数）；没有版本时说清原因，不留一行空白。 */
function versionLine(row: ReleaseRow) {
  if (!row.latestVersion) {
    return '暂无交付版本'
  }

  const base = `${platformText(row.platform)} · ${row.latestVersion}`
  return row.versionCount > 1 ? `${base} · 共 ${row.versionCount} 个版本` : base
}

/** 行标识：绑定需求的行认需求编号，未绑定需求的行认资源编号，两批数据不会互相覆盖。 */
function rowKey(requirementId: string | null, resourceId?: number) {
  return requirementId ? `requirement:${requirementId}` : `resource:${resourceId}`
}

/** 版本摘要：最新版本按发布时间取，版本总数留在副行，合并后不再一行一个版本。 */
function versionSummary(versions: McResourceVersionPayload[]) {
  const sorted = [...versions].sort(
    (left, right) => timeValue(right.created_at) - timeValue(left.created_at),
  )
  const latest = sorted[0] ?? null

  return {
    latestVersion: latest?.version ?? null,
    latestVersionAt: latest?.created_at ?? null,
    versionCount: versions.length,
  }
}

/** 建行时先把所有列铺成默认值，各来源只覆盖自己知道的字段，避免到处写 null。 */
function makeRow(part: Partial<ReleaseRow> & Pick<ReleaseRow, 'settlementText'>): ReleaseRow {
  return {
    requirementId: null,
    requirementTitle: null,
    requirementStatus: null,
    resourceId: null,
    resourceTitle: null,
    platform: null,
    resourceVisibility: null,
    latestVersion: null,
    latestVersionAt: null,
    versionCount: 0,
    customer: null,
    receipts: [],
    ...part,
  }
}

/** 回执按需求归堆：一个需求的到账是多笔（托管模式下定金与尾款各分账一次），
    归堆后逐笔都留着，行上取合计与笔数，弹窗里逐笔摊开。
    需求标题与状态一并带上，交付记录里查不到的需求也能靠它把行立起来。 */
function groupReceipts(income: DevWalletIncomeItem[]) {
  const grouped = new Map<
    string,
    {
      receipts: ReleaseReceipt[]
      title: string
      customer: string
      status: string
    }
  >()

  for (const item of income) {
    const receipt: ReleaseReceipt = {
      paymentId: item.payment_id,
      amount: item.amount_cny,
      paidAt: item.paid_at,
    }
    const current = grouped.get(item.requirement_id)
    if (!current) {
      grouped.set(item.requirement_id, {
        receipts: [receipt],
        title: item.title,
        customer: item.customer,
        status: item.requirement_status,
      })
      continue
    }

    current.receipts.push(receipt)
  }

  return grouped
}

/* 交付与回款两批数据在这里合成一张表：
   1) 先按需求建行——需求侧带 bound_resource_id，从需求反查资源才不会漏掉已结单的需求；
   2) 没被任何需求绑定的资源按资源汇总成一行，回款列留空；
   3) 最后把到账按需求贴上去，需求已解绑、交付记录里查不到时补一行。 */
function buildRows(
  resourceList: McResourcePayload[],
  versionsByResource: Map<number, McResourceVersionPayload[]>,
  myRequirements: RequirementItem[],
  income: DevWalletIncomeItem[],
): ReleaseRow[] {
  const rows = new Map<string, ReleaseRow>()
  const resourceById = new Map(resourceList.map((item) => [item.id, item]))
  const boundResourceIds = new Set<number>()

  for (const requirement of myRequirements) {
    const resource = requirement.bound_resource_id
      ? resourceById.get(requirement.bound_resource_id)
      : undefined
    if (!resource) {
      continue
    }

    const versions = versionsByResource.get(resource.id) ?? []
    if (versions.length === 0) {
      continue
    }

    boundResourceIds.add(resource.id)
    rows.set(
      rowKey(requirement.requirement_id),
      makeRow({
        requirementId: requirement.requirement_id,
        requirementTitle: requirement.title,
        requirementStatus: requirement.status,
        settlementText: settlementText(requirement.status),
        resourceId: resource.id,
        resourceTitle: resource.title,
        platform: resource.platform,
        resourceVisibility: resource.visibility,
        ...versionSummary(versions),
        customer: requirement.creator,
      }),
    )
  }

  for (const resource of resourceList) {
    const versions = versionsByResource.get(resource.id) ?? []
    if (versions.length === 0 || boundResourceIds.has(resource.id)) {
      continue
    }

    rows.set(
      rowKey(null, resource.id),
      makeRow({
        settlementText: settlementText(null),
        resourceId: resource.id,
        resourceTitle: resource.title,
        platform: resource.platform,
        resourceVisibility: resource.visibility,
        ...versionSummary(versions),
      }),
    )
  }

  for (const [requirementId, group] of groupReceipts(income)) {
    const key = rowKey(requirementId)
    const existing = rows.get(key)
    if (existing) {
      existing.receipts = group.receipts
      continue
    }

    /* 需求已解绑、交付记录里查不到时，到账仍然单独成行（交付物列留空）。 */
    rows.set(
      key,
      makeRow({
        requirementId,
        requirementTitle: group.title,
        requirementStatus: group.status,
        settlementText: settlementText(group.status),
        customer: group.customer,
        receipts: group.receipts,
      }),
    )
  }

  return [...rows.values()].sort((left, right) => rowSortTime(right) - rowSortTime(left))
}

async function loadPage() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  loading.value = true
  try {
    const [resourceList, myRequirements, wallet] = await Promise.all([
      listMcResources(auth.token),
      listMyRequirements(auth.token),
      getDevWalletOverview(auth.token),
    ])

    const versionGroups = await Promise.all(
      resourceList.map(async (resource) => ({
        resourceId: resource.id,
        versions: await listMcResourceVersions(auth.token!, resource.id),
      })),
    )

    releaseRows.value = buildRows(
      resourceList,
      new Map(versionGroups.map((group) => [group.resourceId, group.versions])),
      myRequirements,
      wallet.recent_income ?? [],
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载交付与回款失败'
    showToast(message, 'error')
    releaseRows.value = []
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.visibility = ''
  filters.settlement = ''
}

/* 分页与其余菜单页同构（需求大厅、收益钱包、资源项目、团队资源都带表尾分页器）。
   数据源一次取回全部，所以这里是客户端切片，不走服务端页码。
   筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空表。
   合并成一张表后页码也只剩一份，不再有两段各自翻页的问题。 */
const { page, pageSize, total: filteredTotal, paged, resetPage } = useClientPagination(filteredRows)

watch(filters, resetPage)

/* 操作列只放「查看回款详情」：交付物的版本明细在「资源项目 → 版本管理」里看，
   这一页要回答的是「这笔需求到底到账多少、什么时候到、流水号是什么」。
   行上只有合计与笔数，逐笔摊开在弹窗里，所以这里只负责把选中的行记下来。 */
function openReceiptDialog(row: ReleaseRow) {
  activeReceiptId.value = rowKey(row.requirementId, row.resourceId ?? undefined)
  receiptDialogVisible.value = true
}

/* 弹窗里的逐笔按到账时间正序排：托管模式下定金先分账、尾款后分账，
   顺着时间读下来才是「第 1 笔 / 第 2 笔」应有的顺序（与表格里最近一笔在最上面相反）。 */
const activeReceipts = computed(() =>
  [...(activeReceiptRow.value?.receipts ?? [])].sort(
    (left, right) => timeValue(left.paidAt) - timeValue(right.paidAt),
  ),
)

const activeReceiptTotal = computed(() => receiptTotal(activeReceipts.value))

const receiptDialogTitle = computed(() =>
  activeReceiptRow.value?.requirementId
    ? `回款详情 · ${activeReceiptRow.value.requirementId}`
    : '回款详情',
)
</script>

<template>
  <div class="dev-page dev-release-page">
    <div class="dev-meta-strip">
      <template v-for="(item, index) in releaseStats" :key="item.label">
        <div v-if="index > 0" class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">{{ item.label }}</span>
          <span class="dev-meta-strip__value">{{ item.value }}</span>
        </div>
      </template>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <el-button class="dev-toolbar__icon-btn" aria-label="刷新交付与回款数据" @click="loadPage">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </div>
    </div>

    <el-card shadow="never" class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">交付与回款</h3>
          <p class="dev-section-desc">
            一行一个需求：左侧是交付的资源与版本，右侧是尾款到账金额与时间；未绑定需求的资源版本单独成行。筛选即时生效。
          </p>
        </div>
      </div>

      <div class="dev-toolbar">
        <el-select v-model="filters.visibility" clearable placeholder="资源状态" class="dev-toolbar__field"
          aria-label="按资源状态筛选">
          <el-option v-for="option in VISIBILITY_OPTIONS" :key="option.value" :label="option.label"
            :value="option.value" />
        </el-select>
        <el-select v-model="filters.settlement" clearable placeholder="回款进度" class="dev-toolbar__field"
          aria-label="按回款进度筛选">
          <el-option v-for="option in settlementOptions" :key="option.value" :label="option.label"
            :value="option.value" />
        </el-select>
        <el-input v-model="filters.keyword" clearable placeholder="搜索交付物、需求编号、委托方或流水号"
          class="dev-toolbar__search">
          <template #prefix>
            <el-icon>
              <Search />
            </el-icon>
          </template>
        </el-input>
        <div class="dev-toolbar__actions">
          <span v-if="hasActiveFilters" class="dev-toolbar__hint">
            筛选出 {{ filteredRows.length }} / {{ releaseRows.length }} 条
          </span>
          <el-button class="dev-toolbar__ghost" @click="resetFilters">
            <el-icon>
              <RefreshLeft />
            </el-icon>
            <span>重置</span>
          </el-button>
        </div>
      </div>

      <!-- 交付与回款同表：一行一个需求，右侧到账列留空就是还没回款，不必再去第二张表里找。
           一个需求的到账可能不止一笔（托管模式下定金与尾款各分账一次），所以金额列是合计、下面标笔数，
           逐笔金额、到账时间与支付流水号在「查看回款详情」弹窗里摊开。
           列宽合计必须留在卡片可用宽度以内（桌面端 1440 宽时约 965px）：
           关联需求 200 + 交付物 220 + 回款进度 96 + 到账金额 112 + 到账时间 150 + 操作 168 = 946px。
           操作列 168 是给「查看回款详情」六个字加图标留的（行内按钮现在约 136px），
           不够时行内文字不会换行而是挤出单元格，所以这里不压到刚好放得下。
           原来交付记录七列已经是 1160px，把表格顶到横向滚动、操作列 fixed="right" 压住发布时间；
           合并后若把两边的列叠加到十列必然重现，因此按需求单聚合，
           交付侧只留资源与最新版本，砍掉版本备注与发布时间，回款侧把逐笔明细收进弹窗
           （委托方与流水号仍可被搜索命中，交付物的版本明细在「资源项目 → 版本管理」里看）。 -->
      <el-table class="dev-table" :data="paged" stripe v-loading="loading">
        <template #empty>
          <p class="dev-empty-state">
            {{ loading ? '交付与回款加载中' : hasActiveFilters ? '当前没有匹配的交付与回款记录' : '当前没有交付与回款记录' }}
          </p>
        </template>
        <el-table-column label="关联需求" min-width="200">
          <template #default="scope">
            <div class="dev-table__strong">{{ scope.row.requirementId || '未关联需求' }}</div>
            <div class="dev-table__sub">
              {{ scope.row.requirementTitle || '当前交付未绑定需求场景' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="交付物" min-width="220">
          <template #default="scope">
            <div class="dev-table__strong">{{ scope.row.resourceTitle || '—' }}</div>
            <div class="dev-table__sub">{{ versionLine(scope.row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="回款进度" width="96">
          <template #default="scope">
            <el-tag :type="settlementTagType(scope.row.requirementStatus)" effect="plain">
              {{ scope.row.settlementText }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到账金额" width="112" align="right">
          <template #default="scope">
            <template v-if="scope.row.receipts.length">
              <div class="dev-table__strong dev-release-receipt__amount">
                {{ money(receiptTotal(scope.row.receipts)) }}
              </div>
              <!-- 到账是多笔时说明合计，否则一个 ¥40 对不上开发者在流水里看到的 ¥8 与 ¥32。 -->
              <div v-if="scope.row.receipts.length > 1" class="dev-table__sub">
                共 {{ scope.row.receipts.length }} 笔
              </div>
            </template>
            <span v-else class="dev-table__sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="到账时间" min-width="150">
          <template #default="scope">
            {{ receiptTimeText(scope.row.receipts) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="168" fixed="right">
          <template #default="scope">
            <div class="dev-release-record__actions">
              <el-button v-if="scope.row.receipts.length" class="dev-table__action dev-action--soft" type="primary"
                plain @click="openReceiptDialog(scope.row)">
                <el-icon>
                  <View />
                </el-icon>
                <span>查看回款详情</span>
              </el-button>
              <span v-else class="dev-table__sub">—</span>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="dev-pager">
        <div class="dev-pager__count">
          <span>共 {{ filteredTotal }} 条</span>
          <el-select v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
            <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
          </el-select>
        </div>
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal" :pager-count="5"
          layout="prev, pager, next" background aria-label="交付与回款分页" />
      </div>
    </el-card>

    <!-- 回款详情弹窗：行上只放合计与笔数，逐笔到这里摊开。
         金额、时间、流水号都来自同一份 recent_income 数据（与「收益钱包 → 收入记录」同一个接口），
         不在这里另算，避免两处对不上。 -->
    <el-dialog v-model="receiptDialogVisible" :title="receiptDialogTitle" width="560px" align-center
      class="dev-dialog">
      <div v-if="activeReceiptRow" class="dev-receipt-detail">
        <div class="dev-receipt-detail__head">
          <div class="dev-receipt-detail__title">
            {{ activeReceiptRow.requirementTitle || '当前交付未绑定需求场景' }}
          </div>
          <div class="dev-receipt-detail__meta">
            <span>{{ activeReceiptRow.requirementId || '未关联需求' }}</span>
            <span>委托方 {{ activeReceiptRow.customer || '—' }}</span>
            <el-tag :type="settlementTagType(activeReceiptRow.requirementStatus)" effect="plain">
              {{ activeReceiptRow.settlementText }}
            </el-tag>
          </div>
        </div>

        <div class="dev-receipt-detail__total">
          <span class="dev-receipt-detail__total-label">
            累计到账 · 共 {{ activeReceipts.length }} 笔
          </span>
          <span class="dev-figure dev-figure--sm">{{ money(activeReceiptTotal) }}</span>
        </div>

        <ul class="dev-receipt-detail__list">
          <li v-for="(receipt, index) in activeReceipts" :key="receipt.paymentId" class="dev-receipt-detail__item">
            <div class="dev-receipt-detail__item-head">
              <span class="dev-receipt-detail__item-index">第 {{ index + 1 }} 笔</span>
              <span class="dev-receipt-detail__item-amount">{{ money(receipt.amount) }}</span>
            </div>
            <div class="dev-receipt-detail__facts">
              <div class="dev-receipt-detail__fact">
                <span class="dev-receipt-detail__fact-label">到账时间</span>
                <span class="dev-receipt-detail__fact-value">{{ formatTime(receipt.paidAt) }}</span>
              </div>
              <div class="dev-receipt-detail__fact">
                <span class="dev-receipt-detail__fact-label">支付流水号</span>
                <span class="dev-receipt-detail__fact-value">{{ receipt.paymentId }}</span>
              </div>
            </div>
          </li>
        </ul>

        <p class="dev-receipt-detail__note">
          托管模式下定金与尾款各分账一次，同一需求会有两笔到账，金额按分账净额逐笔列出。
        </p>
      </div>

      <template #footer>
        <el-button class="dev-toolbar__ghost" @click="receiptDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 本页的搜索/筛选/刷新走 dev-base.css 的 .dev-toolbar，表格走统一层的 .dev-table 表格体，
   行内操作按钮走 .dev-table__action / .dev-action--soft。
   原先这里另写了一套 .dev-release-toolbar（38px 高、800 字重、青绿悬停）、.dev-release-table
   与 .dev-release-income-card，与需求大厅、资源列表不是一个体系，已删除；
   这里只保留本页特有的表格单元格样式。 */
.dev-release-page {
  gap: 24px;
}

/* 单元格主/次文字走统一层的 .dev-table__strong / .dev-table__sub，
   行内操作按钮走 .dev-action--soft，本页不再另写字号与按钮规格。 */
.dev-release-record__actions {
  display: flex;
  justify-content: center;
  white-space: nowrap;
}

/* 到账金额列：字号/字重/颜色取统一层的 .dev-table__strong，
   这里只补等宽数字，让右对齐的金额小数点能对齐（与钱包记录页的金额列同一处理）。 */
.dev-release-receipt__amount {
  font-variant-numeric: tabular-nums;
}

/* === 回款详情弹窗 ===
   弹窗由 Element teleport 到 body，配色令牌靠 .dev-dialog（见 dev-base.css），
   排版是本页特有的，写在这里。整块分三层：需求抬头 → 累计到账读数 → 逐笔清单。 */
.dev-receipt-detail {
  display: grid;
  gap: 18px;
}

.dev-receipt-detail__title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

.dev-receipt-detail__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--dev-muted);
}

/* 累计到账：读数取统一层的 .dev-figure--sm（金色大数），
   这里只把它和左侧说明排成一行、压一条分隔线与下面的清单分开。 */
.dev-receipt-detail__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 16px;
  border-bottom: 1px solid var(--dev-line);
}

.dev-receipt-detail__total-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink-soft);
}

.dev-receipt-detail__list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一笔到账一块：白底细描边的内嵌容器，圆角取 --dev-radius-inner（卡片内嵌块那一档） */
.dev-receipt-detail__item {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
}

.dev-receipt-detail__item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.dev-receipt-detail__item-index {
  font-size: 12px;
  font-weight: 700;
  color: var(--dev-muted);
}

/* 单笔金额同样用金色（与累计读数、钱包里的入账金额同一支） */
.dev-receipt-detail__item-amount {
  font-size: 18px;
  font-weight: 800;
  color: var(--dev-gold);
  font-variant-numeric: tabular-nums;
}

/* 流水号是长串，窄屏必须能断行，否则会把弹窗顶宽 */
.dev-receipt-detail__facts {
  display: grid;
  gap: 6px;
}

.dev-receipt-detail__fact {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}

.dev-receipt-detail__fact-label {
  flex: 0 0 76px;
  color: var(--dev-muted);
}

.dev-receipt-detail__fact-value {
  min-width: 0;
  color: var(--dev-ink-soft);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.dev-receipt-detail__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dev-muted);
}
</style>
