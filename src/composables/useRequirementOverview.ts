import { computed, ref } from 'vue'

import { fetchContractSigningStatus, type ContractSigningStatus } from '@/api/contracts'
import { listRequirements, type RequirementItem, type RequirementStatus } from '@/api/requirements'
import { parseBackendDateTime } from '@/shared/datetime'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/** 「可操作需求」最多摆几条（读数条那格的数也要与它一致，别一处截断一处不截断）。 */
const ACTIONABLE_LIMIT = 4

/** 日期串 → 毫秒。空值与非法值都算 0（排到最后），排序里不抛错。 */
export function requirementTimeValue(value?: string | null) {
  if (!value) {
    return 0
  }
  return parseBackendDateTime(value)?.getTime() ?? 0
}

export function formatRequirementTime(value: string) {
  const date = parseBackendDateTime(value)
  if (!date) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isSelfManagedRequirement(item: RequirementItem) {
  return item.payment_mode === 'self_managed'
}

export function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}

export function publishedVersionCount(item: RequirementItem) {
  return item.bound_resource_version_count ?? 0
}

export function isRequirementContractSigned(
  contractSigningStatusMap: Record<string, ContractSigningStatus | null>,
  item: RequirementItem,
) {
  const status = contractSigningStatusMap[item.requirement_id]
  return Boolean(status?.has_contract && status.party_a_signed && status.party_b_signed)
}

export function canPay(
  contractSigningStatusMap: Record<string, ContractSigningStatus | null>,
  status: RequirementStatus,
  item?: RequirementItem,
) {
  if (item && isSelfManagedRequirement(item)) {
    return false
  }
  if (item && !isRequirementContractSigned(contractSigningStatusMap, item)) {
    return false
  }

  return status === 'pending_deposit' || status === 'pending_final'
}

/** 开发中且已交付至少一个版本，需求方就能请求支付尾款。 */
export function canRequestFinalPayment(item: RequirementItem) {
  return (
    hasBoundResource(item) &&
    Boolean(item.delivered_at) &&
    item.status === 'in_development' &&
    publishedVersionCount(item) > 0
  )
}

export function canResubmit(status: RequirementStatus) {
  // 与后端一致：被驳回的需求改完可以再提；过审后撤回（已取消）的需求同样保留着，也能改完重新提交审核。
  return status === 'rejected' || status === 'cancelled'
}

/** 绑定资源上有「删除版本」申请还挂着，就要人处理。 */
export function hasPendingResourceVersionDeleteReview(item: RequirementItem) {
  return hasBoundResource(item) && (item.pending_resource_version_delete_requests?.length ?? 0) > 0
}

export function canComment(status: RequirementStatus) {
  return status === 'completed'
}

/** 一条需求现在能不能点：能付、能提尾款、能重新提交、有版本删除待审、能评价，占一样就算。 */
function isActionable(
  contractSigningStatusMap: Record<string, ContractSigningStatus | null>,
  item: RequirementItem,
) {
  return (
    hasPendingResourceVersionDeleteReview(item) ||
    canRequestFinalPayment(item) ||
    canPay(contractSigningStatusMap, item.status, item) ||
    canResubmit(item.status) ||
    canComment(item.status)
  )
}

/**
 * 总览页的需求状态域：需求列表、按条的合同签署状态、统计与三种切法。
 *
 * 这**一份** `myRequirements` 同时喂两处（顶部读数条、会话卡的派生），
 * 所以列表只能在这里取一次：会话域拿它算「哪些需求有会话可聊」，读数条再取自己的切片。
 * 会话域在 `useRequirementConversations`，它接的正是这里的 `myRequirements`。
 */
export function useRequirementOverview() {
  const auth = useAuthStore()

  const myRequirements = ref<RequirementItem[]>([])
  const contractSigningStatusMap = ref<Record<string, ContractSigningStatus | null>>({})
  const requirementLoading = ref(false)

  const requirementStats = computed(() => ({
    total: myRequirements.value.length,
    pending: myRequirements.value.filter(
      (item) => item.status === 'pending_review' || item.status === 'pending_deposit',
    ).length,
    active: myRequirements.value.filter(
      (item) =>
        item.status === 'deposit_paid' ||
        item.status === 'in_development' ||
        item.status === 'pending_final' ||
        item.status === 'pending_settlement',
    ).length,
    payment: myRequirements.value.filter((item) =>
      canPay(contractSigningStatusMap.value, item.status, item),
    ).length,
    completed: myRequirements.value.filter((item) => item.status === 'completed').length,
  }))

  const sortedRequirements = computed(() =>
    [...myRequirements.value].sort(
      (left, right) =>
        requirementTimeValue(right.created_time) - requirementTimeValue(left.created_time),
    ),
  )

  /** 读数条「待处理」那格：现在就能点一下的需求，最多 4 条。 */
  const actionableRequirements = computed(() =>
    sortedRequirements.value
      .filter((item) => isActionable(contractSigningStatusMap.value, item))
      .slice(0, ACTIONABLE_LIMIT),
  )

  async function loadMyRequirements() {
    auth.hydrate()
    if (!auth.isAuthed) {
      myRequirements.value = []
      return
    }

    requirementLoading.value = true
    try {
      const rows = await listRequirements(auth.token)
      // 不截断：这一页的「待办」「可操作需求」与统计都由这份列表算出来，
      // 此前 `slice(0, 20)` 会让需求多的账号漏掉第 21 条起的全部待办。
      // 展示侧仍有各自的 slice（最近需求 5 条等），取数与展示不再混为一谈。
      // ponytail: 下方合同签署状态按条发起，请求数随需求数线性增长；
      // 上限的真正解法是服务端分页 + 批量状态接口。
      myRequirements.value = rows
      const guaranteedRows = rows.filter((item) => !isSelfManagedRequirement(item))
      const entries = await Promise.allSettled(
        guaranteedRows.map((item) =>
          fetchContractSigningStatus(auth.token, item.requirement_id).then((status) => ({
            requirementId: item.requirement_id,
            status,
          })),
        ),
      )
      const statusMap: Record<string, ContractSigningStatus | null> = {}
      for (const entry of entries) {
        if (entry.status === 'fulfilled') {
          statusMap[entry.value.requirementId] = entry.value.status
        }
      }
      contractSigningStatusMap.value = statusMap
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载需求单失败')
    } finally {
      requirementLoading.value = false
    }
  }

  return {
    myRequirements,
    contractSigningStatusMap,
    requirementLoading,
    requirementStats,
    sortedRequirements,
    actionableRequirements,
    loadMyRequirements,
  }
}
