import { parseBackendDateTime } from '@/shared/datetime'
import type {
  RequirementItem,
  RequirementPendingResourceVersionDeleteRequest,
  RequirementStatus,
} from '@/api/requirements'
import type { PublicMcResourceVersionItem } from '@/api/resources'
import type { ContractSigningStatus } from '@/shared/contracts'
import type { InvoiceAvailabilityFacts } from '@/shared/invoiceAvailability'
import { requirementLockRemainingDays } from '@/shared/requirementArchive'
import { requirementStatusLabel } from '@/shared/requirementStatus'

/**
 * 「我的需求」行内所有「能不能点 / 显示成什么」的纯判定，从视图下沉出来以便单测
 * （这个视图一条挂载测试都没有，纯函数层是唯一的回归网）。
 *
 * 本文件**不许** `useMyRequirementsData()`：合同签署状态、资源版本、可开票汇总一律由调用方
 * 按条传进来（见 `RequirementRowFacts`）。在这里再查一次就是第二份口径，这个模块也就测不了了。
 * 「放哪个位置」的分组在 `requirementRowActions.ts`，判定仍只此一份。
 */
export type RequirementRowFacts = {
  /** 合同签署状态；查不到（未请求到 / 该条无合同）时是 `null`。 */
  contract: ContractSigningStatus | null
  /** 绑定资源的版本列表；**没查到过**是 `undefined`（据此回退需求单上的版本计数）。 */
  versions?: PublicMcResourceVersionItem[]
  /** 可开票汇总；还没请求到或那次请求失败时留空，`invoiceEntryState` 当作可点。 */
  invoiceSummary?: InvoiceAvailabilityFacts | null
}

// 只声明用得到的字段，调用方（含单测）不必造一份完整需求单。
type PaymentModeOf = Pick<RequirementItem, 'payment_mode'>
type BoundResourceOf = Pick<RequirementItem, 'bound_resource_id'>
type Facts = RequirementRowFacts
type Mode = RequirementItem['payment_mode']
type PendingVersionRequest = RequirementPendingResourceVersionDeleteRequest

export function isSelfManagedRequirement(item: PaymentModeOf) {
  return item.payment_mode === 'self_managed'
}
export function isAdapayRequirement(item: PaymentModeOf) {
  return item.payment_mode === 'platform_guarantee'
}
export function hasBoundResource(item: BoundResourceOf) {
  return item.bound_resource_id != null
}

/** 双方都签完才算「合同已签署」。无担保模式没有合同，`contract` 恒为 `null` → false。 */
export function isRequirementContractSigned(facts: Facts) {
  return Boolean(facts.contract?.party_a_signed && facts.contract?.party_b_signed)
}
/** 停在「等双方把合同签完」：只有待接单 / 已缴定金两档可能「有合同但没签完」，之后是既成事实。 */
export function isWaitingContractSign(item: RequirementItem, facts: Facts) {
  const status = facts.contract
  const awaiting = item.status === 'pending_deposit' || item.status === 'deposit_paid'
  return (
    !isSelfManagedRequirement(item) &&
    awaiting &&
    Boolean(status?.has_contract) &&
    Boolean(!status?.party_a_signed || !status?.party_b_signed)
  )
}

/** 状态文案走全站统一口径；`deposit_paid` 一码两义，拿到支付模式就传进去。 */
export function formatRequirementStatus(status: RequirementStatus, mode?: Mode) {
  return requirementStatusLabel(status, mode)
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

export function formatBudget(value?: number | null) {
  return value == null ? '待议价' : `¥${value.toFixed(2)}`
}

const IN_PROGRESS_STATUSES: RequirementItem['status'][] = [
  'deposit_paid',
  'in_development',
  'pending_final',
  'pending_settlement',
]

/** 状态徽标的语义档：与统一层 .wb-badge 的四档（成功 / 警示 / 危险 / 主色）一一对应。 */
export function statusBadgeClass(item: RequirementItem, facts: Facts) {
  if (isWaitingContractSign(item, facts)) return 'wb-badge--warning'
  if (item.status === 'completed') return 'wb-badge--success'
  if (item.status === 'rejected' || item.status === 'cancelled') return 'wb-badge--danger'
  return IN_PROGRESS_STATUSES.includes(item.status) ? 'wb-badge--accent' : 'wb-badge--warning'
}

/** 担保模式的「待付定金」一档其实叠了三件事（等接单 / 等签约 / 等付款），按当前事实拆开说。 */
export function formatRequirementDisplayStatus(item: RequirementItem, facts: Facts) {
  if (!isSelfManagedRequirement(item) && item.status === 'pending_deposit') {
    if (!hasBoundResource(item)) return '待开发者接单'
    return isRequirementContractSigned(facts) ? '待付定金' : '待签合同'
  }
  if (isWaitingContractSign(item, facts)) return '待签合同'
  return formatRequirementStatus(item.status, item.payment_mode)
}

/** 能不能付钱（定金 / 尾款）：无担保模式没有资金流，担保模式必须先双方签约。 */
export function canPay(item: RequirementItem, facts: Facts) {
  if (isSelfManagedRequirement(item) || !isRequirementContractSigned(facts)) return false
  return item.status === 'pending_deposit' || item.status === 'pending_final'
}

/**
 * 合同状态提示（需求行那一行小字）。「可支付定金」只在还停在待付定金时成立：双方签完后合同已是
 * 既成事实，开发中 / 待付尾款 / 已完成再挂「合同已签署」只是噪音，不返回。
 */
export function contractStatusHint(item: RequirementItem, facts: Facts) {
  const status = facts.contract
  if (isSelfManagedRequirement(item) || !status?.has_contract) return ''
  const awaitingDeposit = item.status === 'pending_deposit'
  if (status.party_a_signed && status.party_b_signed) {
    return awaitingDeposit ? '合同已签署，可支付定金' : ''
  }
  if (status.party_a_signed) {
    return awaitingDeposit ? '等待开发者签署合同，双方签完后可支付定金' : '等待开发者签署合同'
  }
  if (status.party_b_signed) {
    return awaitingDeposit ? '待您签署合同，签完后可支付定金' : '待您签署合同'
  }
  // R012：合同页多了「自定义合同附件」。不提示这句，双方会直接签平台模板，事后要改就得作废重签。
  return '双方均可进入合同页签署；如需补充条款，可先上传或拟定自定义附件，经平台审核放行后再签'
}

/** 交付版本数：查到过列表就按列表长度（空列表就是 0 版），没查到过才回退需求单上的计数。 */
export function publishedVersionCount(item: RequirementItem, facts: Facts) {
  return facts.versions ? facts.versions.length : (item.bound_resource_version_count ?? 0)
}

/** 交付版本摘要：只报版本数与最新版本号，卡片上再挂一串时间只是噪音。 */
export function latestDeliveryVersionLabel(item: RequirementItem, facts: Facts) {
  const latest = facts.versions?.[0]
  return latest ? `（最新 ${latest.version}）` : ''
}

export function canRequestFinalPayment(item: RequirementItem, facts: Facts) {
  // 无担保模式完成无需合同已签；仅担保模式需要双方已签合同
  const contractSigned = isSelfManagedRequirement(item) || isRequirementContractSigned(facts)
  const delivered =
    hasBoundResource(item) && Boolean(item.delivered_at) && publishedVersionCount(item, facts) > 0
  return delivered && item.status === 'in_development' && contractSigned
}

export function requirementFinalActionLabel(item: RequirementItem) {
  return isSelfManagedRequirement(item) ? '确认完成' : '支付尾款'
}

/** 与后端一致：被驳回 / 过审后撤回（已取消）的需求都能改完重新提交审核。 */
export function canResubmit(status: RequirementStatus) {
  return status === 'rejected' || status === 'cancelled'
}

/** 取消：担保模式停在「已缴定金」时全额退还托管定金并解绑，其余档位仍是「未接单 + 可取消」。 */
export function canCancel(item: RequirementItem) {
  if (item.status === 'deposit_paid') return true
  const cancellable =
    item.status === 'pending_review' ||
    item.status === 'rejected' ||
    item.status === 'pending_deposit'
  return !hasBoundResource(item) && cancellable
}

/** 取消确认文案：取消一律保留为「已取消」终态（P9 之后不再物理删除），可以改完重新提交审核。 */
export function cancelConfirmHint(item: RequirementItem) {
  if (item.status === 'deposit_paid' && !isSelfManagedRequirement(item)) {
    return '取消后该需求单保留为「已取消」，托管定金将全额原路退还；开发者已占用的资源会随之释放。'
  }
  return '取消后该需求单保留为「已取消」，可以重新编辑后再提交审核。'
}

/** 待分账提示：尾款缴清到渠道分账之间有等待期。结单后的保证金说明已去掉。 */
export function settlementHint(item: RequirementItem) {
  return item.status === 'pending_settlement'
    ? '尾款已缴，渠道分账中（通常 7 天），完成后结单并开放解除合作。'
    : ''
}

const BREACH_STATUSES: RequirementItem['status'][] = [
  'pending_deposit',
  'deposit_paid',
  'in_development',
  'pending_final',
  'pending_settlement',
]

/**
 * 能不能申报「解除合作」：待分账（分账排队中）也算，违约由后端取消排队中的分账。
 * 待接单里含「已签约未缴定金」，未签合同时后端按「无生效合同」拒收，入口不给（BUG-038）。
 */
export function canReportBreach(item: RequirementItem, facts: Facts) {
  return (
    !isSelfManagedRequirement(item) &&
    BREACH_STATUSES.includes(item.status) &&
    (item.status !== 'pending_deposit' || isRequirementContractSigned(facts))
  )
}

/**
 * 担保模式的验收入口：双方已签 + 已交付至少一版，已付定金、开发中与待付尾款都能提交。
 * 验收可重复提交：不过会留档，待付尾款那一档退回开发中并挡住宿尾款（后端 rolling_back）。
 */
export function canOpenAcceptance(item: RequirementItem, facts: Facts) {
  if (isSelfManagedRequirement(item) || !isRequirementContractSigned(facts)) return false
  if (!hasBoundResource(item) || !item.delivered_at) return false
  const reviewing = ['deposit_paid', 'in_development', 'pending_final'].includes(item.status)
  return reviewing && publishedVersionCount(item, facts) > 0
}

/** 解除合作入口：只有担保模式的需求有解除合作（结单后仍需冻结接单保证金、尾款能原路退回）。 */
export function canOpenAfterSales(item: RequirementItem) {
  return item.status === 'completed' && !isSelfManagedRequirement(item)
}
export function canComment(status: RequirementStatus) {
  return status === 'completed'
}

export function formatCommentSummary(rating: number, text?: string | null) {
  const score = `${rating.toFixed(1)} 分`
  const body = text?.trim() ?? ''
  // 纯数字文案多半是脏数据（评分/信用分误写入），不当作评语展示
  if (!body || /^\d+(\.\d+)?$/.test(body) || body.length < 2) return score
  return `${score} · ${body}`
}

export function currentResourceVisibility(item: RequirementItem) {
  return item.resource_visibility ?? null
}

export function formatResourceVisibility(item: RequirementItem) {
  const visibility = currentResourceVisibility(item)
  if (visibility === 'public') return '公开'
  return visibility === 'review' ? '审核中' : '私有'
}

/** 只有当前是私有才提交公开审核，其余（已公开、审核中）都切回私有。 */
export function nextResourceVisibility(item: RequirementItem): 'public' | 'private' {
  return currentResourceVisibility(item) === 'private' ? 'public' : 'private'
}

export function canToggleRequirementResourceVisibility(item: RequirementItem) {
  return hasBoundResource(item) && item.status === 'completed'
}
export function toggleResourceVisibilityLabel(item: RequirementItem) {
  if (currentResourceVisibility(item) === 'review') return '审核中'
  return nextResourceVisibility(item) === 'public' ? '公开' : '私有'
}
export function requirementSubscriptionLabel(item: RequirementItem) {
  return item.subscribe_status_change ? '取消订阅' : '订阅'
}

/** R014：锁定剩余天数文案（未锁定返回空串）。 */
export function lockRemainingText(item: RequirementItem) {
  const days = requirementLockRemainingDays(item)
  return days == null ? '' : `约剩 ${days} 天`
}

export function pendingResourceVersionDeleteRequests(item: RequirementItem) {
  return item.pending_resource_version_delete_requests ?? []
}
export function hasPendingResourceVersionDeleteReview(item: RequirementItem) {
  return hasBoundResource(item) && pendingResourceVersionDeleteRequests(item).length > 0
}

/** 拒绝过版本删除时的回显：待审核状态改由「待审核」胶囊 + 右侧按钮表达，这里只留拒绝理由。 */
export function versionDeleteRejectNote(item: RequirementItem) {
  const note = item.resource_version_delete_review_note
  return note ? `你上次拒绝删除版本：${note}` : ''
}

export function pendingResourceVersionTitle(item?: PendingVersionRequest | null) {
  return `版本号 ${item?.version?.trim() || '未命名版本'}`
}
export function formatPendingVersionRequestedAt(item: PendingVersionRequest) {
  return item.requested_at?.trim() || '时间未知'
}
/** 拒绝原因草稿：视图按版本 id 存一份 record，卡片只读当前版本那一条。 */
export function pendingVersionRejectNote(
  notes: Record<number, string>,
  request: PendingVersionRequest,
) {
  return notes[request.version_id] ?? ''
}

// 判定与错误口径本来就在 shared/requirementResourceClaim.ts，这里只转发给行组件，不新增第二份口径。
export {
  canClaimRequirementResource as canClaimResource,
  isRequirementResourceClaimed as isResourceClaimed,
} from '@/shared/requirementResourceClaim'
