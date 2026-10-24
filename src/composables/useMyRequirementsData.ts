import { computed, ref } from 'vue'

import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import { getInvoiceSummary } from '@/api/invoices'
import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import { listRequirements, type RequirementItem } from '@/api/requirements'
import { listPublicMcResourceVersions, type PublicMcResourceVersionItem } from '@/api/resources'
import { getDepositRatio } from '@/api/settings'
import { listMyAfterSalesCases } from '@/api/afterSales'
import { afterSalesBadgeText, countAwaitingCasesByRequirement } from '@/shared/afterSalesStatus'
import type { InvoiceSummaryMap } from '@/shared/invoiceAvailability'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

type MyRequirementsDataOptions = {
  /**
   * 列表刷新后的收尾回调：`loadMyRequirements` 走完串行链就调一次。
   *
   * 「版本删除审核」展开卡的失效清理要读视图自己的展开态与进行中守卫，所以留成显式注入的回调，
   * 不随搬家丢掉（这条副作用原来就在 `loadMyRequirements` 末尾）。
   */
  onRequirementsLoaded?: (items: RequirementItem[]) => void
}

/**
 * 「我的需求」列表页的数据源：列表、按条状态（合同签署 / 资源版本 / 可开票汇总 / 会话）、
 * 押金比例与解除合作待办角标。
 *
 * 视图只拿**一个**写入口 `reload()`（列表 + 会话 + 押金比例一套顺序）和一组只读 getter：四张按条 map
 * 不外抛，取值一律走 `signingStatusForRequirement` / `versionsForRequirement` /
 * `invoiceSummaryForRequirement`，避免业务口径两边各持一份。
 */
export function useMyRequirementsData(options: MyRequirementsDataOptions = {}) {
  const auth = useAuthStore()

  const items = ref<RequirementItem[]>([])
  const loading = ref(false)
  const conversationsLoading = ref(false)
  /** 定金占总价的默认比例，拉不到设置就按 20% 算（与后端默认一致）。 */
  const depositRatio = ref(20)

  // 按条 map：只有本文件能写，消费方一律走下面的查询函数。
  const contractSigningStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
  const resourceVersionsMap = ref<Record<string, PublicMcResourceVersionItem[]>>({})
  /** 每条需求的可开票汇总：只决定「更多」里的「获取发票」灰不灰；拿不到时不写值，`invoiceEntryState` 当作可点。 */
  const invoiceSummaryMap = ref<InvoiceSummaryMap>({})
  const requirementConversationMap = ref<Record<string, RequirementConversation>>({})
  const afterSalesPending = ref<Record<string, number>>({})

  /** 只读出口：视图读得到、改不了，写入口只有 `reload()`。 */
  const myRequirements = computed(() => items.value)
  const requirementLoading = computed(() => loading.value)
  const conversationLoading = computed(() => conversationsLoading.value)
  const depositRatioPercent = computed(() => depositRatio.value)

  async function loadDepositRatio() {
    auth.hydrate()
    if (!auth.isAuthed) {
      return
    }

    try {
      const payload = await getDepositRatio(auth.token)

      if (!payload) {
        return
      }

      if (Number.isFinite(payload.deposit_ratio_percent)) {
        depositRatio.value = payload.deposit_ratio_percent
      }
    } catch {
      // 设置接口不可用时保留默认押金比例，不打断列表。
    }
  }

  async function loadResourceVersions(rows: RequirementItem[]) {
    auth.hydrate()
    if (!auth.token) {
      resourceVersionsMap.value = {}
      return
    }

    const boundItems = rows.filter((item) => item.bound_resource_id != null)
    const entries = await Promise.allSettled(
      boundItems.map(async (item) => ({
        requirementId: item.requirement_id,
        versions: await listPublicMcResourceVersions(item.bound_resource_id as number, auth.token),
      })),
    )
    const map: Record<string, PublicMcResourceVersionItem[]> = {}
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        map[entry.value.requirementId] = entry.value.versions
      }
    }
    resourceVersionsMap.value = map
  }

  async function loadContractSigningStatuses(rows: RequirementItem[]) {
    if (!auth.token || rows.length === 0) {
      contractSigningStatusMap.value = {}
      return
    }

    // 无担保模式（self_managed）不需要合同，无需查询合同签署状态
    const guaranteedItems = rows.filter((item) => item.payment_mode !== 'self_managed')

    const entries = await Promise.allSettled(
      guaranteedItems.map((item) =>
        fetchContractSigningStatus(auth.token, item.requirement_id).then((status) => ({
          requirementId: item.requirement_id,
          status,
        })),
      ),
    )
    const map: Record<string, ContractSigningStatus | null> = {}
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        map[entry.value.requirementId] = entry.value.status
      }
    }
    contractSigningStatusMap.value = map
  }

  /**
   * 拉取「获取发票」的可点性依据：只查担保模式，无担保模式压根没有资金流（由 `invoiceEntryState`
   * 直接判死，不必发请求）。
   *
   * ponytail: 与合同签署状态一样是按条请求，菜单灰不灰要等它回来才知道；上限的真正解法同样是
   * 服务端分页 + 批量汇总接口，等 `/invoices/summary` 支持一次问多条再做。
   */
  async function loadInvoiceSummaries(rows: RequirementItem[]) {
    if (!auth.token || rows.length === 0) {
      invoiceSummaryMap.value = {}
      return
    }

    const guaranteedItems = rows.filter((item) => item.payment_mode !== 'self_managed')

    const entries = await Promise.allSettled(
      guaranteedItems.map((item) =>
        getInvoiceSummary(auth.token, item.requirement_id).then((summary) => ({
          requirementId: item.requirement_id,
          summary,
        })),
      ),
    )
    const map: InvoiceSummaryMap = {}
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        map[entry.value.requirementId] = entry.value.summary
      }
    }
    invoiceSummaryMap.value = map
  }

  /**
   * 列表的串行链：列表 → 发票汇总（不 await）→ 合同签署状态 → 资源版本 → 注入的收尾回调。
   *
   * 顺序不能换：合同与版本都是按条请求、结果直接决定行内按钮开不开，必须排在列表之后；
   * 发票汇总只影响菜单灰不灰，所以故意不 await，让列表先画出来。
   */
  async function loadMyRequirements() {
    auth.hydrate()
    if (!auth.isAuthed) {
      items.value = []
      return
    }

    loading.value = true
    try {
      const rows = await listRequirements(auth.token)
      // 不截断：列表页要能点进任何一条需求（此前 `slice(0, 20)` 让第 21 条起从列表消失，
      // 连解除合作弹窗都进不去）。下方的合同签署状态与资源版本查询是按条发起的，
      // ponytail: 请求数随需求数线性增长（N 条 ≈ 2N 个请求），需求很多时页面会变慢；
      // 上限的真正解法是服务端分页 + 批量状态接口，等 `/requirement/mine` 支持分页再做。
      items.value = rows
      // 不 await：菜单灰不灰不影响列表先画出来，汇总回来再补上禁用态。
      void loadInvoiceSummaries(items.value)
      await loadContractSigningStatuses(items.value)
      await loadResourceVersions(items.value)
      // 收尾清理（收起已失效的「版本删除审核」展开卡）交给视图，口径留在那边。
      options.onRequirementsLoaded?.(items.value)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载需求单失败')
    } finally {
      loading.value = false
    }
  }

  async function loadRequirementConversations() {
    if (!auth.token.trim()) {
      requirementConversationMap.value = {}
      return
    }

    conversationsLoading.value = true
    try {
      const conversations = await listRequirementConversations(auth.token)
      requirementConversationMap.value = Object.fromEntries(
        conversations.map((item) => [item.requirement_id, item]),
      )
    } catch (error) {
      requirementConversationMap.value = {}
      TMessage.error(error instanceof Error ? error.message : '加载沟通会话失败')
    } finally {
      conversationsLoading.value = false
    }
  }

  function applyConversationDetail(payload: RequirementConversationDetail) {
    requirementConversationMap.value = {
      ...requirementConversationMap.value,
      [payload.conversation.requirement_id]: payload.conversation,
    }
  }

  /**
   * 解除合作待办角标：一次 `GET /api/dispute/cases` 拿到我参与的全部案件，按需求计数。
   * 拉不到就当没有待办——角标是锦上添花，不该成为页面的故障点。
   */
  async function loadAfterSalesPending() {
    if (!auth.token) {
      afterSalesPending.value = {}
      return
    }
    try {
      const list = await listMyAfterSalesCases(auth.token)
      afterSalesPending.value = countAwaitingCasesByRequirement(list.items)
    } catch {
      // 不弹错、不阻塞列表。
      afterSalesPending.value = {}
    }
  }

  /**
   * 视图唯一的重新加载入口：列表串行链、会话、押金比例三路并发。
   *
   * 不加「加载中就跳过」的守卫——动作完成后的刷新必须真的发请求；刷新按钮「别重复点」的守卫留在视图里。
   */
  async function reload() {
    await Promise.all([loadMyRequirements(), loadRequirementConversations(), loadDepositRatio()])
  }

  // ---- 只读查询：合同 / 版本 / 发票三张按条 map 的唯一出口（会话 map 只写不读，不设 getter）----
  /** 合同签署状态；查不到（未请求到 / 该条无合同）就是 `null`。 */
  function signingStatusForRequirement(item: RequirementItem) {
    return contractSigningStatusMap.value[item.requirement_id] ?? null
  }

  /** 绑定资源的版本列表；**没查到过**返回 `undefined`（调用方据此回退到需求单上的版本计数）。 */
  function versionsForRequirement(item: RequirementItem) {
    return resourceVersionsMap.value[item.requirement_id]
  }

  /** 可开票汇总；还没请求到或那次请求失败时是 `null` / `undefined`。 */
  function invoiceSummaryForRequirement(item: RequirementItem) {
    return invoiceSummaryMap.value[item.requirement_id]
  }

  function afterSalesPendingCount(requirementId: string) {
    return afterSalesPending.value[requirementId] ?? 0
  }

  /** 角标读数；没有待办时返回空串，模板里据此决定是否渲染角标。 */
  function afterSalesBadgeFor(requirementId: string) {
    const count = afterSalesPending.value[requirementId] ?? 0
    return count > 0 ? afterSalesBadgeText(count) : ''
  }

  // 只读 getter + 唯一的写入口；四张按条 map 不外抛，取值一律走上面的查询函数。
  return {
    myRequirements,
    requirementLoading,
    conversationLoading,
    depositRatioPercent,
    reload,
    /** 角标故意不进 `reload()`：它是锦上添花，视图不 await 它 */
    loadAfterSalesPending,
    /** 会话详情弹窗保存后回写单条会话 */
    applyConversationDetail,
    signingStatusForRequirement,
    versionsForRequirement,
    invoiceSummaryForRequirement,
    afterSalesPendingCount,
    afterSalesBadgeFor,
  }
}
