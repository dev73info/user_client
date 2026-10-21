/**
 * 解除合作案件的界面判定与文案（纯函数：不发请求、不碰 pinia）。
 *
 * 为什么单拉一层：`MyRequirementsView` 没有挂载测试，这一域的行为回归全靠
 * `src/__tests__/requirementBreach.spec.ts`。同时凡是「是不是我」的判定一律收 `username` 参数，
 * 由调用方注入当前登录人——组件与 composable 都不自己去 store 里再取一遍。
 */
import type {
  AdapayBreachCase,
  AdapayBreachDecisionValue,
  AdapayBreachVerdictParty,
  AdapayBreachVerdictSource,
} from '@/api/adapay'

/** 责任方文案。 */
export function breachLiablePartyLabel(party: AdapayBreachVerdictParty) {
  if (party === 'customer') return '客户（需求方）违约'
  if (party === 'mutual') return '双方协商一致（无责退出）'
  return '开发者违约'
}

/** 表态文案：`null` 表示该方尚未表态。 */
export function breachDecisionText(decision?: AdapayBreachDecisionValue | null) {
  if (!decision) {
    return '未表态'
  }
  return decision === 'accepted' ? '已接受 AI 判定' : '不接受 AI 判定'
}

/**
 * 判定来源文案：`mutual` 是双方在案件内自行协商一致结案（没经过客服），
 * 不能和 `support` 一起显示成「客服人工判定」。
 */
export function breachVerdictSourceText(source?: AdapayBreachVerdictSource | null) {
  if (source === 'ai') {
    return '双方接受 AI 判定'
  }
  if (source === 'mutual') {
    return '双方协商一致'
  }
  return '客服人工判定'
}

/** 双方表态状态只在 AI 判定后才有意义。 */
export function showBreachDecisions(item: AdapayBreachCase) {
  return (
    item.status === 'ai_judged' || item.customerDecision != null || item.developerDecision != null
  )
}

/** 本页是需求方（客户）视角：`customerDecision` 是我方表态，`developerDecision` 是对方表态。 */
export function canDecideBreachCase(item: AdapayBreachCase | null) {
  return item?.status === 'ai_judged' && item.customerDecision == null
}

/** 只有协商中（`submitted`）才允许申请平台介入：AI 判定由这个动作触发，出结论后不再重复申请。 */
export function canRequestPlatformReview(item: AdapayBreachCase | null) {
  return item?.status === 'submitted'
}

/** 协商阶段：案件在 `submitted` 且双方都还没就「解除合作」表态。 */
export function isTerminationNegotiating(item: AdapayBreachCase | null) {
  return item?.status === 'submitted' && !item.mutualAgreedAt && !item.mutualRejectedAt
}

/** 能不能对「解除合作」表态：当事人里不是发起人的那一位。 */
export function canRespondTermination(item: AdapayBreachCase | null, username: string) {
  return isTerminationNegotiating(item) && item?.reportedBy !== username
}

/** 只有申请人本人能在 AI 判定与客服介入之前撤回自己的申请（后端同样按状态与申请人校验）。 */
export function canWithdrawBreachCase(item: AdapayBreachCase | null, username: string) {
  return (
    item != null &&
    ['submitted', 'ai_reviewing'].includes(item.status) &&
    item.reportedBy === username
  )
}

/** 上一轮撤回人是不是本人：只有本人撤回才叫「重新申报」，对方撤回时本人是首次申报。 */
export function breachWithdrawnByMe(item: AdapayBreachCase | null, username: string) {
  return item?.status === 'withdrawn' && item.reportedBy === username
}

/**
 * 撤回后再次申报沿用同一条案件（后端复用该行、案件编号不变），只有驳回 / 结案才会新建案件。
 * 标题与提交按钮都按这个口径措辞，避免出现「标题写新一轮、提示写沿用同一条」的自相矛盾。
 */
export function breachDialogTitle(
  item: AdapayBreachCase | null,
  newRound: boolean,
  withdrawnByMe: boolean,
) {
  if (!newRound && item) {
    return '解除合作进展'
  }
  if (item?.status === 'withdrawn') {
    return withdrawnByMe ? '重新发起解除合作' : '解除合作'
  }
  return newRound ? '发起新的解除合作' : '解除合作'
}

/** 提交按钮文案：与 `breachDialogTitle` 同一口径（沿用同一条 vs 新建一条）。 */
export function breachSubmitLabel(
  item: AdapayBreachCase | null,
  newRound: boolean,
  withdrawnByMe: boolean,
) {
  if (item?.status === 'withdrawn') {
    return withdrawnByMe ? '重新发起' : '提交解除合作申请'
  }
  return newRound ? '发起新一轮解除合作' : '提交解除合作申请'
}

/**
 * 申请表单上方的「上一轮」说明：讲清楚结论不能翻案，以及本次提交是新建案件还是沿用同一条。
 *
 * 撤回沿用同一条案件（编号不变），驳回 / 结案才新建；结案更狠一层——合同作废、需求退回大厅，
 * 所以不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。这三句口径不能合并简化。
 */
export function breachRoundHint(item: AdapayBreachCase | null, withdrawnByMe: boolean) {
  if (!item) {
    return ''
  }
  if (item.status === 'withdrawn') {
    return withdrawnByMe
      ? '上一轮由你撤回，本次提交沿用同一条案件（案件编号不变），申请人与理由以本次提交为准，双方继续跟踪这一条。'
      : '上一轮由对方申请后撤回，本次提交沿用同一条案件（案件编号不变），按你本次提交的事实与依据重新判定。'
  }
  // 结案（`succeeded`）会按「结案即自动解除」作废合同、把需求退回大厅：同一需求上已经没有
  // 可裁决的合同，所以不是「再提一条新案件」而是「重新接单并签约」（BUG-038）。
  if (item.status === 'succeeded') {
    return '上一轮案件已结案，需求已退回大厅、原合同已作废；需重新接单并签约后才能再次发起解除合作。'
  }
  return '上一轮案件已驳回，结论不能翻案；本次提交会新建一条案件，只针对驳回之后新发生的事实。'
}
