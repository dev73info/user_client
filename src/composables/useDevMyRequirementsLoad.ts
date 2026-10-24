import { onMounted, ref } from 'vue'

import { listMyAfterSalesCases } from '@/api/afterSales'
import { fetchDevContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import { getDevWalletOverview, type DevWalletIncomeItem } from '@/api/devWallet'
import { listMyInvoices, type InvoiceRecord } from '@/api/invoices'
import {
  listMcResources,
  listMcResourceVersions,
  type McResourcePayload,
  type McResourceVersionPayload,
} from '@/api/mcResources'
import { afterSalesBadgeText } from '@/shared/afterSalesStatus'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

type UseDevMyRequirementsLoadOptions = {
  /** 发票随列表一起取回后交给「上传发票」入口（`useInvoiceUpload` 的写侧）。 */
  onInvoicesLoaded?: (invoices: InvoiceRecord[]) => void
  /** 会话摘要与签约状态**并行**取回（`useDevRequirementRowDialogs.loadConversations`）。 */
  loadConversations?: () => Promise<void>
}

/**
 * 「我的接单」的取数与状态：需求单、交付（资源 + 资源版本）、到账（收益钱包回执）、
 * 发票、签约状态与解除合作待办角标。
 *
 * 四份数据由**页面单实例**持有（`rows` / `resources` / `income` / `signingStatusMap` 由这里唯一持有，
 * 页面拿去拼行）；`mergedRows` 仍留在页面——归并要把需求单贴回行上，属于页面的行口径，不下沉。
 *
 * 两处回收进拆分的口径：
 * - `onMounted` 的时序就在这里：先 `await` 列表（含签约状态回填），再 `void` 角标——
 *   顺序倒了角标口径就变，页面不再自己写一遍 `onMounted`；
 * - 角标**不 await**：列表先画出来，待办数回来再补上。
 */
export function useDevMyRequirementsLoad(options: UseDevMyRequirementsLoadOptions = {}) {
  const auth = useAuthStore()

  const loading = ref(false)
  /** 需求单列表：本页**单实例**，拼行与读数都从这里出。 */
  const rows = ref<RequirementItem[]>([])
  /* 交付与到账的数据：与需求单一起拼成本页的行。
     交付侧来自「资源项目」（资源 + 资源版本），到账侧来自「收益钱包」的入账回执——
     与钱包「收入记录」同一个接口，不另算一份，免得两处金额对不上。 */
  const resources = ref<McResourcePayload[]>([])
  const versionsByResource = ref<Map<number, McResourceVersionPayload[]>>(new Map())
  const income = ref<DevWalletIncomeItem[]>([])
  /** 签约状态：本页**单实例**。卡片、进度条与解除合作弹窗读的是同一份，取值走 `contractStatusOf`。 */
  const signingStatusMap = ref<Record<string, ContractSigningStatus | null>>({})

  /**
   * 列表的取数链：四份数据并发 → 资源版本 → 签约状态回填。
   *
   * 资源与钱包是补充数据：任一失败不该把需求单列表一起清空，所以各自兜底成空值，只提示少了哪一块。
   * 签约状态按条查（后端没有批量接口），与 `RequirementItem.status` 一起决定「待签合同」那一档，
   * 因此它在列表回来后**必须**补齐再算画完；无担保模式（self_managed）不查。
   */
  async function loadMyRequirements() {
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    const token = auth.token
    loading.value = true
    try {
      const [myRequirements, resourceResult, walletResult, invoiceResult] = await Promise.all([
        listMyRequirements(token),
        settle(listMcResources(token), [] as McResourcePayload[], '加载资源列表失败'),
        settle(getDevWalletOverview(token), null, '加载钱包失败'),
        settle(listMyInvoices(token), [] as InvoiceRecord[], '加载发票记录失败'),
      ])

      rows.value = myRequirements
      resources.value = resourceResult.value
      income.value = walletResult.value?.recent_income ?? []
      versionsByResource.value = await loadResourceVersions(token, resourceResult.value)
      options.onInvoicesLoaded?.(invoiceResult.value)

      const supplementaryError = resourceResult.error ?? walletResult.error
      if (supplementaryError) {
        TMessage.warning(`${supplementaryError}，交付与到账暂不完整`)
      }
      // 发票是补充数据：失败不打断需求列表，只提示一声（与资源 / 钱包同一口径）。
      if (invoiceResult.error) {
        TMessage.warning(`${invoiceResult.error}，上传发票入口暂不可用`)
      }

      const guaranteedRows = rows.value.filter((item) => item.payment_mode !== 'self_managed')
      const [statusEntries] = await Promise.all([
        Promise.allSettled(
          guaranteedRows.map((item) =>
            fetchDevContractSigningStatus(token, item.requirement_id).then((s) => ({
              id: item.requirement_id,
              s,
            })),
          ),
        ),
        options.loadConversations?.() ?? Promise.resolve(),
      ])
      const map: Record<string, ContractSigningStatus | null> = {}
      for (const entry of statusEntries) {
        if (entry.status === 'fulfilled') {
          map[entry.value.id] = entry.value.s
        }
      }
      signingStatusMap.value = map
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载已关联需求失败')
      rows.value = []
    } finally {
      loading.value = false
    }
  }

  /** 补充数据的兜底：失败时退到默认值、把错误文案带回去提示，不让整页跟着空掉。 */
  async function settle<T>(request: Promise<T>, fallback: T, fallbackMessage: string) {
    try {
      return { value: await request, error: null as string | null }
    } catch (error) {
      return {
        value: fallback,
        error: error instanceof Error ? error.message : fallbackMessage,
      }
    }
  }

  /* 版本按资源逐个取（后端没有批量接口）。取不到的那个资源按「没有版本」处理，
     只有它这一行的交付物留空，其余照常显示。 */
  async function loadResourceVersions(token: string, list: McResourcePayload[]) {
    const entries = await Promise.allSettled(
      list.map(async (resource) => ({
        resourceId: resource.id,
        versions: await listMcResourceVersions(token, resource.id),
      })),
    )

    const map = new Map<number, McResourceVersionPayload[]>()
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        map.set(entry.value.resourceId, entry.value.versions)
      }
    }
    return map
  }

  /**
   * 解除合作待办：按需求统计「在等我动作」的案件数，给行内「解除合作」入口挂角标。
   *
   * 一次 `GET /api/dispute/cases` 就能拿到我参与的全部案件，不用逐条需求发请求
   * （与列表页其它按条发起的查询不同，这里刻意只打一次）。
   */
  const afterSalesPending = ref<Record<string, number>>({})

  function afterSalesPendingCount(requirementId: string) {
    return afterSalesPending.value[requirementId] ?? 0
  }

  /** 角标读数；没有待办时返回空串，模板里据此决定是否渲染角标。 */
  function afterSalesBadgeFor(requirementId: string) {
    const count = afterSalesPendingCount(requirementId)
    return count > 0 ? afterSalesBadgeText(count) : ''
  }

  async function loadAfterSalesPending() {
    if (!auth.token) {
      afterSalesPending.value = {}
      return
    }
    try {
      const list = await listMyAfterSalesCases(auth.token)
      const counts: Record<string, number> = {}
      for (const item of list) {
        if (item.open && item.respondent) {
          counts[item.requirement_id] = (counts[item.requirement_id] ?? 0) + 1
        }
      }
      afterSalesPending.value = counts
    } catch {
      // 拉不到就当没有待办：不弹错、不阻塞列表，角标本身不该成为页面的故障点。
      afterSalesPending.value = {}
    }
  }

  /** 某张需求的签约状态：本页那一份，缺了按「没查过」处理（无担保需求不查）。 */
  function contractStatusOf(item: RequirementItem): ContractSigningStatus | null {
    return signingStatusMap.value[item.requirement_id] ?? null
  }

  /** 发起合同后回写单条签约状态：不整页重取，卡片上的徽标当场换档。 */
  function applySigningStatus(requirementId: string, status: ContractSigningStatus | null) {
    signingStatusMap.value = { ...signingStatusMap.value, [requirementId]: status }
  }

  /* 进页面的时序：身份先水合，列表（含签约状态回填）**await** 完，角标再 `void` 补——
     顺序倒了角标口径就变（页面因此不再自己写 `onMounted`）。 */
  onMounted(async () => {
    auth.hydrate()
    await loadMyRequirements()
    // 角标是锦上添花，不 await：列表先画出来，待办数回来再补上。
    void loadAfterSalesPending()
  })

  return {
    loading,
    rows,
    resources,
    versionsByResource,
    income,
    signingStatusMap,
    loadMyRequirements,
    afterSalesPendingCount,
    afterSalesBadgeFor,
    contractStatusOf,
    applySigningStatus,
  }
}
