import type { ContractSigningStatus } from '@/shared/contracts'
import type { RequirementItem, RequirementPaymentMode } from '@/api/devRequirements'

import { CONTRACT_STATUS, contractStatusLabel } from '@/shared/contracts'
import { requirementStatusLabel } from '@/shared/requirementStatus'

/**
 * 「我的接单」卡片上的判定与文案：状态档位、签约徽标、发起签署提示，以及「能不能出哪个入口」。
 *
 * 这些口径原先散在页面里、直接读页面那份 `signingStatusMap`。拆出卡片本体后
 * **签约状态改成参数**：页面把一次取回的那份「算好再传」（`:contract-status`），
 * 卡片、进度条与解除合作弹窗因此共用同一份「有没有生效合同」的事实——
 * 在别处再查一遍就是第二套口径，会和卡片其它位置（进度条、签约徽标）打架。
 *
 * 本模块只放纯函数：没有 `ref`、没有请求，卡片与页面的回款弹窗都拿它算文案。
 */

/** 需求状态徽标的色调（回款弹窗的 `TTag` 与卡片的签署徽标各用一套）。 */
export type RequirementStatusTone = 'info' | 'success' | 'warning' | 'danger'
/** 签约状态徽标的色调：已签约 / 签约中 / 失效 / 尚无合同。 */
export type ContractStatusTone = 'signed' | 'progress' | 'danger' | 'muted'

/**
 * 本页的状态文案表。
 *
 * `deposit_paid` 一码两义，不写死：电签担保（`platform_guarantee`）是「定金已进托管、等合同签署
 * 完成」的过渡态，写「已付定金」；无电签约定（`self_managed`）没有合同也没有定金，审核通过即待
 * 开发者接单，写「待开发」。拿不到支付模式时两种含义都写出来——口径见 `shared/requirementStatus.ts`。
 */
export function statusLabel(
  status: RequirementItem['status'],
  paymentMode?: RequirementPaymentMode,
): string {
  switch (status) {
    case 'pending_review':
      return '待审核'
    case 'rejected':
      return '已驳回'
    case 'pending_deposit':
      return '待签合同'
    case 'deposit_paid':
      return requirementStatusLabel(status, paymentMode)
    case 'in_development':
      return '开发中'
    case 'pending_final':
      return '待付尾款'
    case 'pending_settlement':
      return '待分账'
    case 'completed':
      return '已完成'
    default:
      return status
  }
}

/**
 * 「待签合同」：`pending_deposit` / `deposit_paid` 且已有合同但双方还没签完。
 *
 * 它不是 `RequirementItem.status` 的取值，是从一次取回的签约状态推出来的中间态；
 * 状态筛选、卡片文案与回款弹窗的徽标都读这一处，免得同一个需求在三处显示三种状态。
 */
export function isWaitingContractSign(
  item: RequirementItem,
  contractStatus: ContractSigningStatus | null | undefined,
): boolean {
  // 无担保模式（self_managed）不需要合同签署
  if (item.payment_mode === 'self_managed') {
    return false
  }
  return Boolean(
    (item.status === 'pending_deposit' || item.status === 'deposit_paid') &&
    contractStatus?.has_contract &&
    (!contractStatus.party_a_signed || !contractStatus.party_b_signed),
  )
}

export function displayStatusLabel(
  item: RequirementItem,
  contractStatus: ContractSigningStatus | null | undefined,
): string {
  return isWaitingContractSign(item, contractStatus)
    ? '待签合同'
    : statusLabel(item.status, item.payment_mode)
}

export function statusType(status: RequirementItem['status']): RequirementStatusTone {
  switch (status) {
    case 'completed':
    case 'deposit_paid':
    case 'pending_settlement':
      return 'success'
    case 'in_development':
    case 'pending_final':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'info'
  }
}

export function displayStatusType(
  item: RequirementItem,
  contractStatus: ContractSigningStatus | null | undefined,
): RequirementStatusTone {
  return isWaitingContractSign(item, contractStatus) ? 'warning' : statusType(item.status)
}

/** 合同入口：无担保模式不提供签署 / 查看；担保模式要有合同才出按钮。 */
export function canOpenContractSign(
  item: RequirementItem,
  contractStatus: ContractSigningStatus | null | undefined,
): boolean {
  // 无担保模式（self_managed）不提供合同签署/查看入口
  if (item.payment_mode === 'self_managed') {
    return false
  }
  return Boolean(contractStatus?.has_contract)
}

/** 合同按钮文案：我已签过是「查看合同」，否则「签署合同」。 */
export function contractButtonLabel(
  contractStatus: ContractSigningStatus | null | undefined,
): string {
  return contractStatus?.party_b_signed ? '查看合同' : '签署合同'
}

/** 发起签署的提示条：没有可点的地方，全靠这一句说清下一步该谁签。 */
export function contractStartHint(
  item: RequirementItem,
  contractStatus: ContractSigningStatus | null | undefined,
): string {
  if (!isWaitingContractSign(item, contractStatus)) {
    return ''
  }

  if (!contractStatus?.party_b_signed && !contractStatus?.party_a_signed) {
    // R012：合同页多了「自定义合同附件」；不提示这句双方会直接签平台模板，事后要改只能作废重签。
    return '请完成开发者签署，客户也需完成签署后才能支付定金；如需补充条款可先在合同页准备自定义附件'
  }
  if (!contractStatus.party_b_signed) {
    return '等待开发者完成签署'
  }
  return '等待客户签署，双方签署完成后由需求方支付定金'
}

/** 待分账提示：尾款缴清到渠道分账之间有等待期。结单后的保证金说明已去掉（操作区有解除合作入口）。 */
export function settlementHint(item: RequirementItem): string {
  if (item.status === 'pending_settlement') {
    return '需求方已缴纳尾款，正在等待渠道分账（通常 7 天），分账完成后正式结单并结算'
  }
  return ''
}

/** 合同状态标签：优先用后端带回的 status 码；尚无合同按「等待签约」。 */
export function contractStatusBadge(
  contractStatus: ContractSigningStatus | null | undefined,
): string {
  const status = contractStatus?.status
  if (typeof status === 'number') {
    return contractStatusLabel(status)
  }
  return contractStatusLabel(CONTRACT_STATUS.awaiting)
}

export function contractStatusTone(
  contractStatus: ContractSigningStatus | null | undefined,
): ContractStatusTone {
  const status = contractStatus?.status
  if (status === CONTRACT_STATUS.signed) return 'signed'
  if (status === CONTRACT_STATUS.signing || status === CONTRACT_STATUS.awaiting) return 'progress'
  if (
    status === CONTRACT_STATUS.expired ||
    status === CONTRACT_STATUS.rejected ||
    status === CONTRACT_STATUS.voided ||
    status === CONTRACT_STATUS.revoked
  ) {
    return 'danger'
  }
  return 'muted'
}

/** 方案 B：交付物就是绑定资源项目的资源版本，直接走资源项目版本接口。 */
export function canSubmitDeliveryVersion(item: RequirementItem): boolean {
  return item.bound_resource_id != null && ['in_development', 'pending_final'].includes(item.status)
}

export function canReportBreach(
  item: RequirementItem,
  contractStatus: ContractSigningStatus | null | undefined,
): boolean {
  return (
    item.payment_mode !== 'self_managed' &&
    // 待分账（尾款已缴、分账排队中）仍在等待期内，此时解除合作会把排队分账置为 cancelled，
    // 与后端一样留出这条出口。
    // 待接单（`pending_deposit`）含「已签约未缴定金」：甲方拒缴定金同样是违约，可以申报，
    // 那种案件没有支付单、只作责任认定；尚未签合同时后端按无生效合同拒掉——结案回滚把需求
    // 打回待接单、合同同时作废，也正落在这条上（BUG-038）。
    [
      'pending_deposit',
      'deposit_paid',
      'in_development',
      'pending_final',
      'pending_settlement',
    ].includes(item.status) &&
    (item.status !== 'pending_deposit' || Boolean(contractStatus?.has_contract))
  )
}

/** 解除合作入口：结单后的唯一业务入口。开发者是乙方，只查看案件与表态，不能发起。 */
export function canOpenAfterSales(item: RequirementItem): boolean {
  return item.status === 'completed' && item.payment_mode !== 'self_managed'
}

export function canComment(item: RequirementItem): boolean {
  return item.status === 'completed'
}

/** 担保模式下，接单不再自动创建合同，需由需求方或开发者主动发起。 */
export function canCreateRequirementContract(
  item: RequirementItem,
  contractStatus: ContractSigningStatus | null | undefined,
): boolean {
  if (item.payment_mode === 'self_managed') {
    return false
  }
  if (item.status !== 'pending_deposit' && item.status !== 'deposit_paid') {
    return false
  }
  return !contractStatus?.has_contract
}

/** 纯数字评语多半是脏数据（评分/信用分误写入），不当作正文展示。 */
export function commentBodyText(text?: string | null): string {
  const body = text?.trim() ?? ''
  if (!body || /^\d+(\.\d+)?$/.test(body) || body.length < 2) {
    return ''
  }
  return body
}

/** 评分星：≥ 序号是整颗，差 0.5 是半颗，其余空心。 */
export function starFill(rating: number, index: number): 'full' | 'half' | 'empty' {
  if (rating >= index) return 'full'
  if (rating >= index - 0.5) return 'half'
  return 'empty'
}
