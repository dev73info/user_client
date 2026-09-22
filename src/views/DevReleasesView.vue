<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
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
  /* 到账按需求汇总：金额是多笔之和，时间是其中最近一笔，笔数留在金额下方，
     单笔金额与支付流水号在「收益钱包 → 收入记录」里逐笔列着，这里不重复展示。 */
  paidAmount: number | null
  paidAt: string | null
  receiptCount: number
  paymentIds: string[]
}

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const releaseRows = ref<ReleaseRow[]>([])

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
      item.paymentIds.join(' '),
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

/* 排序取「最近一次动静」：有回执的行看尾款到账时间，没有的看最新版本的交付时间。 */
function rowSortTime(row: ReleaseRow) {
  return timeValue(row.paidAt) || timeValue(row.latestVersionAt)
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
    paidAmount: null,
    paidAt: null,
    receiptCount: 0,
    paymentIds: [],
    ...part,
  }
}

/** 回执按需求汇总：一个需求的到账是多笔（托管模式下定金与尾款各分账一次），
    合成一行时金额相加、时间取最近一笔、笔数单独留着在表里说明；
    需求标题与状态一并带上，交付记录里查不到的需求也能靠它把行立起来。 */
function summarizeReceipts(income: DevWalletIncomeItem[]) {
  const summary = new Map<
    string,
    {
      amount: number
      paidAt: string
      paymentIds: string[]
      title: string
      customer: string
      status: string
    }
  >()

  for (const item of income) {
    const current = summary.get(item.requirement_id)
    if (!current) {
      summary.set(item.requirement_id, {
        amount: item.amount_cny,
        paidAt: item.paid_at,
        paymentIds: [item.payment_id],
        title: item.title,
        customer: item.customer,
        status: item.requirement_status,
      })
      continue
    }

    current.amount += item.amount_cny
    current.paymentIds.push(item.payment_id)
    if (timeValue(item.paid_at) > timeValue(current.paidAt)) {
      current.paidAt = item.paid_at
    }
  }

  return summary
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

  for (const [requirementId, receipt] of summarizeReceipts(income)) {
    const key = rowKey(requirementId)
    const existing = rows.get(key)
    if (existing) {
      existing.paidAmount = receipt.amount
      existing.paidAt = receipt.paidAt
      existing.receiptCount = receipt.paymentIds.length
      existing.paymentIds = receipt.paymentIds
      continue
    }

    /* 需求已解绑、交付记录里查不到时，到账仍然单独成行（交付物列留空）。 */
    rows.set(
      key,
      makeRow({
        requirementId,
        requirementTitle: receipt.title,
        requirementStatus: receipt.status,
        settlementText: settlementText(receipt.status),
        customer: receipt.customer,
        paidAmount: receipt.amount,
        paidAt: receipt.paidAt,
        receiptCount: receipt.paymentIds.length,
        paymentIds: receipt.paymentIds,
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

function openVersionsPage(row: ReleaseRow) {
  if (!row.resourceId) {
    return
  }

  router.push({ name: 'dev-resource-versions', params: { resourceId: row.resourceId } })
}
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
           一个需求的到账是多笔（托管模式下定金与尾款各分账一次），所以金额列是合计、下面标笔数，
           逐笔金额与支付流水号在「收益钱包 → 收入记录」里列着。
           列宽合计必须留在卡片可用宽度以内（桌面端 1440 宽时约 965px）：
           关联需求 200 + 交付物 220 + 回款进度 104 + 到账金额 120 + 到账时间 150 + 操作 112 = 906px。
           原来交付记录七列已经是 1160px，把表格顶到横向滚动、操作列 fixed="right" 压住发布时间；
           合并后若把两边的列叠加到十列必然重现，因此按需求单聚合，
           交付侧只留资源与最新版本，砍掉版本备注与发布时间，回款侧把逐笔明细收进金额列的笔数里
           （委托方与流水号仍可被搜索命中，「查看版本」点进去也能看到每个版本的发布时间与备注）。 -->
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
        <el-table-column label="回款进度" width="104">
          <template #default="scope">
            <el-tag :type="settlementTagType(scope.row.requirementStatus)" effect="plain">
              {{ scope.row.settlementText }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到账金额" width="120" align="right">
          <template #default="scope">
            <template v-if="scope.row.paidAmount != null">
              <div class="dev-table__strong dev-release-receipt__amount">
                {{ money(scope.row.paidAmount) }}
              </div>
              <!-- 到账是多笔时说明合计，否则一个 ¥40 对不上开发者在流水里看到的 ¥8 与 ¥32。 -->
              <div v-if="scope.row.receiptCount > 1" class="dev-table__sub">
                共 {{ scope.row.receiptCount }} 笔
              </div>
            </template>
            <span v-else class="dev-table__sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="到账时间" min-width="150">
          <template #default="scope">
            {{ scope.row.paidAt ? formatTime(scope.row.paidAt) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="112" fixed="right">
          <template #default="scope">
            <div class="dev-release-record__actions">
              <el-button v-if="scope.row.resourceId" class="dev-table__action dev-action--soft" type="primary" plain
                @click="openVersionsPage(scope.row)">
                <el-icon>
                  <View />
                </el-icon>
                <span>查看版本</span>
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
</style>
