import { ref } from 'vue'

import { TMessage } from 'ui_73info'

import { listCommunityPosts, type CommunityPost } from '@/api/community'
import { getResourcePromoMeta } from '@/api/points'
import {
  getPublicRequirementOverview,
  listPublicRequirementSpotlights,
  listRequirements,
  type PublicRequirementSpotlightItem,
  type RequirementPaymentMode,
  type RequirementStatus,
} from '@/api/requirements'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import { formatTimeLabel, statusToLabel } from '@/shared/home/portalDisplay'
import { useAuthStore } from '@/stores/auth'

export type Metric = {
  label: string
  value: string
}

/** 待办需求在首页的那一份视图形状（轮询重拉后覆盖，故不保留后端原始字段名）。 */
export type PendingRequirementView = {
  id: string
  title: string
  status: RequirementStatus
  statusLabel: string
  updatedAtLabel: string
  description?: string | null
  acceptanceCriteria?: string | null
  budget?: number | null
  paymentMode: RequirementPaymentMode
}

/** 公告侧栏只展示标题与成交时间，其余成交字段无读取点，随详情弹窗一并删除。 */
type LatestDealView = {
  title: string
  at: string
}

export type HomePortalLoaderOptions = {
  /** 卸载后不再写响应式状态。`isMounted` 只有视图那一份，这一层只读不持。 */
  isMounted: () => boolean
  /** 标签树懒加载与资源列表回写都在 `usePublicResources`（资源只有那一份状态）。 */
  ensureTagTree: () => void
  applyResourceList: (list: readonly PublicMcResourceItem[] | null) => void
  applyHighLikeThreshold: (threshold: number) => void
}

/**
 * 首页首屏与轮询要拉的四批数据里，本视图自己那三批（待办需求、平台概览、公开资源 / 公告 / 精选需求）。
 * 第四批押金比例在支付域（`useDepositPayment.loadDepositRatio`），它只服务支付卡片。
 *
 * 请求本身、字段映射、失败提示都留在这里：视图只决定「什么时候拉」（`onMounted` 首屏、
 * 登录态变化、5 分钟轮询、发布 / 支付成功后），不碰 `@/api/*` 的细节。
 */
export function useHomePortalLoaders(options: HomePortalLoaderOptions) {
  const auth = useAuthStore()

  const metrics = ref<Metric[]>([
    { label: '累计完成', value: '0 单' },
    { label: '综合评价', value: '5.00 分' },
    { label: '累计成交额', value: '¥ 0.00' },
  ])
  const latestDeals = ref<LatestDealView[]>([])
  const publicDeveloperCount = ref(0)
  const pendingRequirements = ref<PendingRequirementView[]>([])
  const publicRequirementSpotlights = ref<PublicRequirementSpotlightItem[]>([])
  const announcementPosts = ref<CommunityPost[]>([])

  async function loadPendingRequirements(silent = false) {
    if (!auth.isAuthed) {
      pendingRequirements.value = []
      return
    }

    try {
      const rows = await listRequirements(auth.token)
      if (!options.isMounted()) {
        return
      }
      pendingRequirements.value = rows
        .filter((item) => item.status !== 'completed')
        .slice(0, 8)
        .map((item) => ({
          id: item.requirement_id,
          title: item.title,
          status: item.status,
          statusLabel: statusToLabel(item.status, item.payment_mode),
          updatedAtLabel: formatTimeLabel(item.updated_at),
          description: item.description,
          acceptanceCriteria: item.acceptance_criteria,
          budget: item.budget,
          paymentMode: item.payment_mode,
        }))
    } catch (err) {
      if (options.isMounted() && !silent) {
        TMessage.error(err instanceof Error ? err.message : '加载需求失败')
      }
    }
  }

  async function loadRequirementOverview() {
    try {
      const payload = await getPublicRequirementOverview()
      if (!options.isMounted()) {
        return
      }
      publicDeveloperCount.value = Number(payload.developer_count ?? 0)
      metrics.value = [
        {
          label: '已完成需求数',
          value: `${payload.total_orders ?? 0} 单`,
        },
        {
          label: '好评率',
          value: `${payload.positive_rate?.toFixed(1) ?? '0.0'}%`,
        },
        {
          label: '已支付订单累计金额',
          value: `¥ ${(payload.total_turnover_cny ?? 0).toFixed(2)}`,
        },
      ]

      latestDeals.value = (payload.recent_deals ?? []).map((item) => ({
        title: item.title,
        at: formatTimeLabel(item.paid_at),
      }))
    } catch {
      // Keep current values if overview API fails.
    }
  }

  async function loadPublicPortalData(silent = false) {
    const resourceToken = auth.isAuthed && auth.token.trim() ? auth.token : null
    const [resourcesResult, requirementsResult, announcementsResult, promoMetaResult] =
      await Promise.allSettled([
        listAllPublicMcResources(resourceToken),
        // 首页只用最新一条需求做公告，取 1 条即可。
        listPublicRequirementSpotlights(1, 1),
        listCommunityPosts({ tag: '公告', limit: 5, offset: 0 }),
        getResourcePromoMeta(resourceToken ?? undefined),
      ])
    options.ensureTagTree()

    if (!options.isMounted()) {
      return
    }

    if (promoMetaResult.status === 'fulfilled') {
      options.applyHighLikeThreshold(promoMetaResult.value.high_like_threshold)
    }

    // 去到重 / 排序 / 清空都在 `usePublicResources` 里，视图只负责「哪一批请求成功了」。
    options.applyResourceList(resourcesResult.status === 'fulfilled' ? resourcesResult.value : null)

    if (requirementsResult.status === 'fulfilled') {
      publicRequirementSpotlights.value = requirementsResult.value.items
    } else {
      publicRequirementSpotlights.value = []
    }

    if (announcementsResult.status === 'fulfilled') {
      announcementPosts.value = announcementsResult.value.filter(
        (post) => post.status === 'published',
      )
    } else {
      announcementPosts.value = []
    }

    const failedResults = [resourcesResult, requirementsResult].filter(
      (result) => result.status === 'rejected',
    )
    if (failedResults.length > 0 && failedResults.length < 2 && !silent) {
      TMessage.warning('部分首页公开数据加载失败，已显示可用数据')
    } else if (failedResults.length === 2 && !silent) {
      TMessage.warning('加载首页公开数据失败')
    }
    // 榜单成员的徽章不在这里取：`usePortalRanks` 按入榜用户名指纹自己触发，资源没变就不重复请求。
  }

  return {
    metrics,
    latestDeals,
    publicDeveloperCount,
    pendingRequirements,
    publicRequirementSpotlights,
    announcementPosts,
    loadPendingRequirements,
    loadRequirementOverview,
    loadPublicPortalData,
  }
}
