<script setup lang="ts">
/**
 * 售后弹窗（结单后的唯一业务入口）。
 *
 * 需求方与开发者共用，两侧看到的是**同一件事的两面**：
 *   - 需求方（甲方）发起诉求：只说**期望**——要一笔钱回来 / 要对方返工 / 两者都要 / 只反馈问题。
 *     钱从哪出（他自己付过的部分原路退，还是从开发者的接单保证金扣划赔付）由平台认定，他不用挑，
 *     也挑不了；
 *   - 开发者（乙方）只有「接受诉求」或「不接受，转平台裁决」两个动作（由调用方用 `canOpenCase`
 *     关掉发起表单）：资金出口只通向需求方，他自己立案没有能落地的诉求。
 * 售后只在**结单之后**开放，而结单的触发点就是尾款分账成功，所以退款面对的是「钱已分账出账」这个
 * 常态：渠道支持按原分账份额退款（退款对象 + `div_members`），退款照常原路退回；退不动（分账在途、
 * 渠道拒）时转人工，不会去动开发者的接单保证金。
 * 入口守卫里还包含售后窗口：窗口状态由服务端在案件列表响应里给出（`windowOpen`），
 * 窗口关闭后不再渲染发起表单，避免用户填完表单一律被后端 409 拒绝；前端不自己拿时间戳
 * 比大小，真正的判定仍在服务层。
 */
import { computed, ref, watch } from 'vue'
import {
  listMyAfterSalesCases,
  openAfterSalesCase,
  respondAfterSalesCase,
  withdrawAfterSalesCase,
  type AfterSalesCase,
  type AfterSalesDecision,
  type AfterSalesRespondAction,
} from '@/api/afterSales'
import { useToast } from '@/composables/useToast'
import { afterSalesExpectationLabel } from '@/shared/afterSalesStatus'
import { formatCnDateTime } from '@/shared/requirementDisplay'

const props = defineProps<{
  visible: boolean
  token: string | null
  currentUsername: string
  requirementId: string
  requirementTitle: string
  /** 当前登录人是否是本需求的需求方（甲方）：只有甲方能发起售后。 */
  canOpenCase: boolean
  /**
   * 需求预算（元）：主张金额的上限。
   *
   * 预算就是这笔单子的价（合同总价由它快照），主张「拿回」的钱不该超过它——后端
   * `open_case` 会以 400 拒收超预算的主张，这里先把上限摆在输入框上，别让用户填完才被拒。
   * 拿不到（老接口/未加载完）时传 null，不限制，仍由后端兜底。
   */
  requirementBudget?: number | null
}>()

const emit = defineEmits<{ close: [] }>()

const { showToast } = useToast()

/** 终态案件不再有可执行动作，只作为历史记录展示。 */
const CLOSED_STATUSES = ['succeeded', 'rejected', 'withdrawn']

/**
 * 有结论的收口状态：只有「结案」与「驳回」是平台或双方给出的结论。
 *
 * 撤回不算结论——它是发起人自己收手，既不产生责任认定也没有资金动作，
 * 把它的诉求字段摆成一张「上次售后」的结论表，只会让人以为平台对此有过说法。
 */
const CONCLUDED_STATUSES = ['succeeded', 'rejected']

/**
 * 诉求 = 两个**期望**，不是四类资金通道：
 *   - 要一笔钱回来（`expectsMoney`）：退还是赔由平台认定，发起人不用挑资金来源；
 *   - 要对方返工 / 补交付（`expectsRework`）：动作项，可以与要钱并存（「先返工，做不到再退钱」）。
 *
 * 两个都关掉 = 只反馈问题（不动钱、不要求返工）。四值的「要求退款 / 要求赔偿 / 返工 / 其它」于
 * 2026-10-05 拆成这两项：原来那个字段同时编码了「期望什么」「钱从谁的池子出」「怎么执行」。
 */
const expectsMoney = ref(true)
const expectsRework = ref(false)
const description = ref('')
const claimAmount = ref<string | number>('')
const submitting = ref(false)
const cases = ref<AfterSalesCase[]>([])
const casesLoading = ref(false)
const respondingId = ref<number | null>(null)
const withdrawingId = ref<number | null>(null)

/** 售后窗口是否还开着（服务端判定）；窗口状态未知时为 null。 */
const windowOpen = ref<boolean | null>(null)
/** 售后窗口关闭时间，用于在窗口已关闭时告知需求方。 */
const windowClosesAt = ref<string | null>(null)

/** 售后窗口已关闭：此时不再渲染发起表单——表单填完必然被后端 409 拒绝。 */
const windowClosed = computed(() => windowOpen.value === false)

/** 窗口已关闭时的说明文案：拿得到关闭时间就说清楚，拿不到（结单时间异常）退化为通用措辞。 */
const windowClosedTip = computed(() =>
  windowClosesAt.value
    ? `售后窗口已于 ${formatCnDateTime(windowClosesAt.value)} 关闭，本需求不再受理新的售后申请。如需反映其它问题，请走工单中心联系平台。`
    : '本需求的售后窗口已关闭，不再受理新的售后申请。如需反映其它问题，请走工单中心联系平台。',
)

/**
 * 当前需求正在办理的售后案件（一个需求只有一条案件，收口前就挂在它上面）。
 */
const currentCase = computed(() =>
  cases.value.find((row) => !CLOSED_STATUSES.includes(row.status)),
)

/**
 * 已经拿到结论的收口案件（结案 / 驳回）：案件只有一条，所以它就是「上次售后」的结果。
 *
 * 售后不记录轮次：再次提交会复用同一条案件，上一次的诉求与结论被这次的覆盖，
 * 平台侧也查不到历史诉求，所以这里只展示「上次售后」这一条结论，不堆历史列表。
 *
 * 撤回不进这块：撤回只是发起人自己收手，没有责任认定也没有资金执行，不是「结论」。
 */
const lastConcludedCase = computed(() =>
  cases.value.find((row) => CONCLUDED_STATUSES.includes(row.status)),
)

/** 上次售后收口的展示时间：优先用后端给的结案时间，兜底用最后更新时间。 */
const lastConcludedAt = computed(() => {
  const row = lastConcludedCase.value
  return row ? row.resolvedAt || row.updatedAt : ''
})

/**
 * 收口案件里「动过钱」的那种（认定过退款或赔付额度）：它是终态，需求方**不能再自助发起**
 * ——后端会以 409「该需求已有裁决结果的售后案件」挡下，所以这里不能再渲染发起表单，
 * 否则等于摆一个必然失败的入口。重新主张要由客服在平台侧重开案件（复用同一行，不记轮次）。
 *
 * 没动过钱的收口案件（只反馈问题、诉求不成立被驳回）不在这里：那类结论没有钱可翻，
 * 需求方可以自己再来一次，后端也放行——`withdrawn` 同理（他自己收的手，本来就不算结论）。
 *
 * 判据必须与后端 `dispute::service::self_service_reopen_allowed` 对齐（都看认定额度，不看渠道
 * 单号）：口径一旦分叉，前端会渲染出一个后端必然 409 的表单。
 */
const concludedWithFunds = computed(() => {
  const row = lastConcludedCase.value
  return Boolean(row && (row.refundAmountFen > 0 || row.compensationAmountFen > 0))
})

/** 已裁决且动过钱时的说明：把「为什么不能自助发起、下一步找谁」说清楚。 */
const caseConcludedTip = computed(() => {
  const row = lastConcludedCase.value
  const funds = row ? executedFunds(row).join(' / ') || pendingFunds(row).join(' / ') : ''
  return (
    `本需求已有裁决结果的售后案件（${row ? statusText(row.status) : '已收口'}` +
    `${funds ? `：${funds}` : ''}），需求方不能再次自助发起。` +
    '如需重新主张，请联系平台客服重开该案件，或到工单中心提交工单。'
  )
})

/**
 * 能不能发起售后：调用方允许（需求方视角）+ 窗口还开着 + 没有「已裁决且执行过资金」的收口案件。
 * 窗口 / 案件状态未知（老后端、或列表还没加载完）时不拦，保留后端 409 兜底。
 */
const canSubmitCase = computed(
  () => props.canOpenCase && !windowClosed.value && !concludedWithFunds.value,
)

/** 需求预算（分）：主张金额的上限，0 表示拿不到（不限制）。 */
const budgetFen = computed(() => {
  const budget = props.requirementBudget
  if (budget == null || !Number.isFinite(budget) || budget <= 0) {
    return 0
  }
  return Math.round(budget * 100)
})

/**
 * 主张金额的文案：它只是发起人的**主张**，平台认定时作参考（实际能执行多少由「客户已付且未退的
 * 部分」与「仍冻结的接单保证金」两个上限决定）。
 *
 * 文案里不出现「尾款」「保证金」这些池子名——「钱从哪出」是平台认定的事，发起人只需要说
 * 「我希望拿回多少」。留空表示由平台认定（按诉求与上限给）；上限是需求预算（这笔单子的价），
 * 后端也会以 400 拒收超预算的主张，所以这里直接把它写进占位提示。
 */
const claimAmountField = computed(() => ({
  label: '希望拿回多少（元）',
  placeholder: budgetFen.value
    ? `留空由平台认定；最多不超过需求预算 ${(budgetFen.value / 100).toFixed(2)} 元`
    : '留空由平台认定，不超过你已支付的金额',
}))

/** 有请求在途时不允许关窗，避免资金动作的结果无从收口。 */
const busy = computed(
  () =>
    submitting.value || respondingId.value !== null || withdrawingId.value !== null,
)

/** 诉求额度分：非法或非正数一律按 0（后端只把它当诉求参考，实际退款由平台裁决）。 */
const claimAmountFen = computed(() => {
  const parsed = Number(claimAmount.value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.round(parsed * 100)
})

/** 表态与撤回都只放行尚未进入资金执行的案件，与后端的状态守卫一致。 */
function actionAllowed(status: AfterSalesCase['status']) {
  return ['submitted', 'support_reviewing'].includes(status)
}

/**
 * 本方在这次案件里的表态：发起人走撤回 / 确认落实；他那一列在发起时已被写成 `opened`
 * （诉求即表态），所以这里不会是 null 只对本方是发起人时成立。
 */
const myDecision = computed(() => {
  const row = currentCase.value
  if (!row) {
    return null
  }
  return row.viewerRole === 'customer' ? row.customerDecision : row.developerDecision
})

/**
 * 能不能表态：案件处于可表态状态，且本方还没有表态过。
 * 后端每方只收一次表态（`*_decision IS NULL`），已经表过态的按钮留着只会点出 409。
 */
const canRespond = computed(() => {
  const row = currentCase.value
  if (!row || row.viewerRole === null || row.viewerRole === row.openerRole) {
    return false
  }
  return actionAllowed(row.status) && myDecision.value === null
})

/** 发起人视角的收口动作：确认落实（`agreed`）与撤回申请。 */
const isOpener = computed(
  () => Boolean(currentCase.value && currentCase.value.openedBy === props.currentUsername),
)

/** 发起人撤回：`agreed`（等确认落实）与 `rework_pending`（返工中）也放行，不想再追究就收口。 */
function withdrawAllowed(status: AfterSalesCase['status']) {
  return actionAllowed(status) || status === 'agreed' || status === 'rework_pending'
}

const canWithdraw = computed(() => {
  const row = currentCase.value
  return Boolean(row && isOpener.value && withdrawAllowed(row.status))
})

/** 发起人确认诉求已落实：`agreed`（没要钱 / 或两个上限都是 0）与 `rework_pending`（返工）都在等这一步。 */
const canComplete = computed(() =>
  Boolean(isOpener.value && ['agreed', 'rework_pending'].includes(currentCase.value?.status ?? '')),
)

/**
 * 发起人报返工未落实：只有返工中能用，点了转平台裁决（客服可动用退款与赔付两个渠道）。
 *
 * 这是返工单独开 `rework_pending` 的意义所在——`agreed` 上只有「确认已落实」一条路，
 * 对方答应了没做到时，发起人除了撤回重开没有别的说法。
 */
const canReportUnfulfilled = computed(() =>
  Boolean(isOpener.value && currentCase.value?.status === 'rework_pending'),
)

function statusText(status: AfterSalesCase['status']) {
  switch (status) {
    case 'submitted':
      return '待对方表态'
    case 'support_reviewing':
      return '平台裁决中'
    case 'processing':
      // 与平台侧（管理端 / 客服端）同口径：`processing` 指的是资金执行中，不是「平台在审」。
      // 双方一致与平台裁决走的是同一条资金链路，责任方在 `liableParty` 上（`mutual` = 双方一致）。
      return '资金执行中'
    case 'agreed':
      // 对方接受了诉求，但没有需要执行的资金动作（没要钱，或两个上限都是 0），等发起人确认落实。
      return '待确认落实'
    case 'rework_pending':
      // 对方接受了返工要求，等发起人验收（若还谈了钱，钱在这之前已按认定执行完）；
      // 发起人可点「确认已落实」或「未落实，申请平台介入」。
      return '返工中'
    case 'manual_required':
      // 渠道扣划失败或超时无人处理后的兜底状态，等客服人工介入。
      return '需人工处理'
    case 'succeeded':
      return '已结案'
    case 'rejected':
      return '已驳回'
    case 'withdrawn':
      return '已撤回'
    default:
      return '需人工处理'
  }
}

/**
 * 在办案件的一句话状态说明：先说清「现在到哪一步、你要做什么」。
 *
 * 待对方表态这类不需要解释的状态不给文案，省掉一行噪音。
 * `processing` 不在这张表里：它的说法要看责任方（见 [`processingTip`]）。
 */
const STATUS_TIPS: Partial<Record<AfterSalesCase['status'], string>> = {
  support_reviewing: '已提交平台裁决，等待客服认定责任方与金额。',
  agreed: '双方已就诉求达成一致，落实后由发起人点「确认已落实」结案。',
  rework_pending: '对方已接受返工要求（若同时谈了钱，钱已按认定执行完），返工完成后由发起人点「确认已落实」结案。',
}

/**
 * 资金执行中的说明分两种来路，不能混成一句。
 *
 * `liable_party = 'mutual'` 是双方在案件里自己谈成的（对方点了「接受诉求」），平台没做过任何
 * 裁决，只是照约定把钱退给发起人——写成「平台裁决已落地」会让人以为平台介入过，明明两边
 * 已经谈好了。只有客服认定（`customer` / `developer`）才是真的裁决。
 */
function processingTip(liableParty: AfterSalesCase['liableParty']) {
  return liableParty === 'mutual'
    ? '双方已达成一致，退款正在原路退回（渠道退款有等待期），到账后自动结案。'
    : '平台裁决已落地，资金正在执行，完成后自动结案。'
}

/** 折进折叠区的流程分支细节：只给确实有分支可说的状态，避免点开是空盒子。 */
const STATUS_DETAILS: Partial<Record<AfterSalesCase['status'], string>> = {
  support_reviewing:
    '客服给出责任方与金额认定后，由平台执行尾款退还 / 保证金赔付并结案（尾款已分账时按原分账份额原路退回）。这期间发起人仍可撤回申请；资金一旦开始执行就只能等落地。',
  agreed:
    '这条诉求没有需要平台执行的钱（没要钱，或两个上限都是 0），落实完成后由发起人确认结案；一直不确认会在售后窗口关闭后转人工客服。',
  rework_pending:
    '若对方没有落实，发起人可点「未落实，申请平台介入」转客服裁决，届时可动用尾款退还与保证金赔付两个渠道；一直不确认会在售后窗口关闭后转人工客服。',
}

const statusTip = computed(() => {
  const row = currentCase.value
  if (!row) {
    return null
  }
  if (row.status === 'processing') {
    return processingTip(row.liableParty)
  }
  return STATUS_TIPS[row.status] ?? null
})

const statusDetail = computed(() =>
  currentCase.value ? (STATUS_DETAILS[currentCase.value.status] ?? null) : null,
)

/** 分 → 「¥12.34」：差额行要拿两个金额相加，所以这里按金额分格式化一次。 */
function moneyFromFen(fen: number) {
  return `¥${(fen / 100).toFixed(2)}`
}

/** 案件卡上的「期望」一行：发起人想要什么（要钱 / 返工 / 两者都要 / 只是反馈）。 */
function expectationText(row: AfterSalesCase) {
  return afterSalesExpectationLabel({
    expectsMoney: row.expectsMoney,
    expectsRework: row.expectsRework,
  })
}

/**
 * 一条资金动作的落地凭据是**渠道单号**，不是案件行上的金额。
 *
 * `refundAmountFen` / `compensationAmountFen` 是裁决**认定**的额度，`claim_for_verdict` 一认领案件
 * 就写进去了；真的执行了才会带上 `providerRefundId`（渠道退款单号）/ `providerDepositConfirmId`
 * （保证金扣划确认单号）。赔付腿失败会转 `manual_required`，那时额度已经写好、钱却没动过
 * （实测：`compensation_amount_fen=20000`，而开发者的保证金冻结仍是整额、台账里没有补偿分录）。
 */
function executedFunds(row: AfterSalesCase): string[] {
  const parts: string[] = []
  if (row.refundAmountFen && row.providerRefundId) {
    // 「退还客户已付款」，不是「退还尾款」：结单后定金与尾款都能原路退，诉求不超过已付时
    // 全走退款，所以这一笔可能是两笔渠道退款（尾款 + 定金）合起来的结果。
    parts.push(`退还客户已付款 ${row.refundAmountCny} 元`)
  }
  if (row.compensationAmountFen && row.providerDepositConfirmId) {
    parts.push(`保证金赔付 ${row.compensationAmountCny} 元`)
  }
  return parts
}

/** 认定了但渠道还没受理的那几笔：单独说清「尚未执行」，不能混进「已执行资金」。 */
function pendingFunds(row: AfterSalesCase): string[] {
  const parts: string[] = []
  if (row.refundAmountFen && !row.providerRefundId) {
    parts.push(`退还客户已付款 ${row.refundAmountCny} 元`)
  }
  if (row.compensationAmountFen && !row.providerDepositConfirmId) {
    parts.push(`保证金赔付 ${row.compensationAmountCny} 元`)
  }
  return parts
}

/**
 * **已执行**的资金合计（分）：只有带渠道单号的那几笔算数。
 *
 * 诉求差额要拿它算，不能拿主张额度算——否则一分钱没落地的案件也会显示「本次共执行 360 元」。
 */
function executedFundsFen(row: AfterSalesCase): number {
  let total = 0
  if (row.refundAmountFen && row.providerRefundId) {
    total += row.refundAmountFen
  }
  if (row.compensationAmountFen && row.providerDepositConfirmId) {
    total += row.compensationAmountFen
  }
  return total
}

function decisionText(decision: AfterSalesDecision | null) {
  if (decision === 'opened') {
    // 发起人发起时就已经表态了：诉求本身就是他的立场，因此不会显示成「未表态」。
    return '已发起诉求'
  }
  if (decision === 'accept') {
    return '接受诉求'
  }
  if (decision === 'reject') {
    return '不接受，转平台裁决'
  }
  if (decision === 'unfulfilled') {
    return '返工未落实，已申请平台介入'
  }
  return '未表态'
}

async function refresh() {
  if (!props.token || !props.requirementId) {
    return
  }
  casesLoading.value = true
  try {
    const result = await listMyAfterSalesCases(props.token, props.requirementId)
    cases.value = result.items
    windowOpen.value = result.windowOpen
    windowClosesAt.value = result.windowClosesAt
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载售后案件失败', 'error')
  } finally {
    casesLoading.value = false
  }
}

async function submit() {
  if (!props.token || !props.requirementId || !props.canOpenCase) {
    return
  }
  if (!description.value.trim()) {
    showToast('请先描述遇到的问题', 'warning')
    return
  }
  // 主张金额不许超过需求预算（后端也会以 400 拒收）：在提交前就拦住，别让用户填完才吃一个错误提示。
  if (expectsMoney.value && budgetFen.value > 0 && claimAmountFen.value > budgetFen.value) {
    showToast(
      `主张金额不能超过需求预算 ${(budgetFen.value / 100).toFixed(2)} 元`,
      'warning',
    )
    return
  }

  submitting.value = true
  try {
    await openAfterSalesCase(
      props.token,
      props.requirementId,
      expectsMoney.value,
      expectsRework.value,
      description.value.trim(),
      // 没勾「要一笔钱回来」时不带金额：后端拒收「没要钱却填了额度」的诉求。
      expectsMoney.value ? claimAmountFen.value : 0,
    )
    showToast('售后申请已提交，对方会在会话里收到通知', 'success')
    description.value = ''
    claimAmount.value = ''
    await refresh()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发起售后申请失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function respond(item: AfterSalesCase, action: AfterSalesRespondAction) {
  if (!props.token) {
    return
  }
  respondingId.value = item.id
  try {
    const updated = await respondAfterSalesCase(props.token, item.id, action)
    showToast(respondToast(action, updated), 'success')
    await refresh()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交售后表态失败', 'error')
  } finally {
    respondingId.value = null
  }
}

/** 表态结果提示：接受分「当场退款」与「等发起人收口」两种去处，别用同一句话糊过去。 */function respondToast(action: AfterSalesRespondAction, updated: AfterSalesCase) {
  if (action === 'reject') {
    return '已提交，等待平台裁决'
  }
  if (action === 'complete') {
    return '已确认诉求落实，案件结案'
  }
  if (action === 'unfulfilled') {
    return '已提交，案件转平台裁决'
  }
  if (updated.status === 'rework_pending') {
    return '已接受返工要求，等对方确认返工完成'
  }
  return updated.status === 'agreed' ? '已接受对方诉求，等对方确认落实' : '已接受对方诉求，平台开始执行'
}

async function withdraw(item: AfterSalesCase) {
  if (!props.token) {
    return
  }
  withdrawingId.value = item.id
  try {
    await withdrawAfterSalesCase(props.token, item.id)
    showToast('售后申请已撤回', 'success')
    await refresh()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '撤回售后申请失败', 'error')
  } finally {
    withdrawingId.value = null
  }
}

function close() {
  if (busy.value) {
    return
  }
  emit('close')
}

// 每次打开都重新拉取：谈完一轮再打开要看到最新状态，而不是上次的缓存。
watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      return
    }
    expectsMoney.value = true
    expectsRework.value = false
    description.value = ''
    claimAmount.value = ''
    cases.value = []
    windowOpen.value = null
    windowClosesAt.value = null
    await refresh()
  },
)
</script>

<template>
  <div v-if="visible" class="modal-wrap" @click.self="close">
    <section class="pay-modal after-sales-modal" aria-label="售后弹窗">
      <h3>售后</h3>
      <p class="after-sales-modal__subject">
        <strong>{{ requirementTitle }}</strong>
        <span>{{ requirementId }}</span>
      </p>

      <p v-if="casesLoading" class="after-sales-modal__empty">正在加载售后案件…</p>

      <template v-else-if="currentCase">
        <dl class="after-sales-modal__facts">
          <div class="is-wide"><dt>案件编号</dt><dd>{{ currentCase.caseNo }}</dd></div>
          <div><dt>当前状态</dt><dd>{{ statusText(currentCase.status) }}</dd></div>
          <div><dt>发起人</dt><dd>{{ currentCase.openedBy }}</dd></div>
          <div><dt>诉求</dt><dd>{{ expectationText(currentCase) }}</dd></div>
          <div v-if="currentCase.expectsMoney"><dt>主张金额</dt><dd>{{ currentCase.claimAmountCny }} 元</dd></div>
          <div class="is-wide"><dt>诉求说明</dt><dd>{{ currentCase.description }}</dd></div>
          <div><dt>需求方表态</dt><dd>{{ decisionText(currentCase.customerDecision) }}</dd></div>
          <div><dt>开发者表态</dt><dd>{{ decisionText(currentCase.developerDecision) }}</dd></div>
          <div v-if="currentCase.requiresRework" class="is-wide">
            <dt>返工认定</dt><dd>本次认定要求对方返工 / 补交付，等发起人验收</dd>
          </div>
          <div v-if="currentCase.resolutionNote" class="is-wide">
            <dt>处理说明</dt>
            <dd>{{ currentCase.resolutionNote }}</dd>
          </div>
          <div v-if="executedFunds(currentCase).length" class="is-wide">
            <dt>已执行资金</dt>
            <dd>{{ executedFunds(currentCase).join(' / ') }}</dd>
          </div>
          <!-- 认定 ≠ 执行：赔付腿失败时案件行上已经写着认定额度，钱却一分没动（实测）。
               单独摆一行并写清「尚未执行」，别让人以为钱已经付出去了。 -->
          <div v-if="pendingFunds(currentCase).length" class="is-wide">
            <dt>本次认定（尚未执行）</dt>
            <dd>
              {{ pendingFunds(currentCase).join(' / ') }}
              <template v-if="currentCase.status === 'manual_required'">
                ——渠道尚未受理，案件已转人工，落地后自动结案。
              </template>
            </dd>
          </div>
          <!-- 诉求金额被两个上限截断时把差额直接摆出来：否则「实赔 200」看起来像「诉求 500 全赔了」。
               条件与算式都只认**已执行**的那几笔（带渠道单号）：裁决还没落地时只是「诉求未决」，
               不是「被上限截断」；拿认定额度算会把没执行的钱也算成「已执行」。 -->
          <div
            v-if="executedFundsFen(currentCase) > 0 && currentCase.shortfallFen > 0"
            class="is-wide"
          >
            <dt>诉求差额</dt>
            <dd>
              诉求 {{ currentCase.claimAmountCny }} 元，受可退部分与赔付上限（冻结保证金与需求预算取小）限制，本次共执行
              {{ moneyFromFen(executedFundsFen(currentCase)) }} 元，差额
              <strong>{{ currentCase.shortfallCny }} 元</strong>
            </dd>
          </div>
        </dl>

        <!-- 状态说明只留一句「现在到哪一步、要做什么」，分支细节收进折叠区，避免整段文字糊住按钮。 -->
        <p v-if="statusTip" class="tip">{{ statusTip }}</p>
        <p v-else-if="currentCase.status === 'manual_required'" class="tip">
          资金执行遇到问题，已转人工客服处理。客服会尽快跟进，进展会同步到需求会话里。
        </p>
        <details v-if="statusDetail" class="after-sales-modal__rules">
          <summary>点开看流程细节</summary>
          <p>{{ statusDetail }}</p>
        </details>

        <div v-if="canRespond" class="actions">
          <button class="ghost danger-plain" type="button" :disabled="respondingId === currentCase.id"
            @click="respond(currentCase, 'reject')">
            不接受，转平台裁决
          </button>
          <button class="ghost primary" type="button" :disabled="respondingId === currentCase.id"
            @click="respond(currentCase, 'accept')">
            {{ respondingId === currentCase.id ? '提交中...' : '接受诉求' }}
          </button>
        </div>
        <div v-else-if="canComplete" class="actions">
          <button v-if="canReportUnfulfilled" class="ghost danger-plain" type="button"
            :disabled="respondingId === currentCase.id" @click="respond(currentCase, 'unfulfilled')">
            {{ respondingId === currentCase.id ? '提交中...' : '未落实，申请平台介入' }}
          </button>
          <button class="ghost primary" type="button" :disabled="respondingId === currentCase.id"
            @click="respond(currentCase, 'complete')">
            {{ respondingId === currentCase.id ? '提交中...' : '确认已落实' }}
          </button>
        </div>

        <!-- 发起人自己的收口动作：撤回申请。对方视角下这里不渲染任何按钮。 -->
        <div v-if="canWithdraw" class="actions">
          <button class="ghost danger-plain" type="button"
            :disabled="withdrawingId === currentCase.id" @click="withdraw(currentCase)">
            {{ withdrawingId === currentCase.id ? '撤回中...' : '撤回申请' }}
          </button>
        </div>
      </template>

      <template v-else>
        <!-- 上一次售后的结论：案件只有一条，收口后的这一条就是上次的结果，双方都看得到。
             售后不记录轮次，再次提交会复用同一条案件并覆盖上次的诉求，平台侧也查不到历史，
             因此这里只出这一条结论，不堆历史列表，否则每次售后都会堆成一条「历史售后案件」。
             「已撤回」不进这块：那是发起人自己收手，没有结论可摆。 -->
        <dl v-if="lastConcludedCase" class="after-sales-modal__facts">
          <div>
            <dt>上次售后</dt>
            <dd>{{ statusText(lastConcludedCase.status) }}</dd>
          </div>
          <div><dt>收口时间</dt><dd>{{ lastConcludedAt ? formatCnDateTime(lastConcludedAt) : '—' }}</dd></div>
          <div><dt>诉求</dt><dd>{{ expectationText(lastConcludedCase) }}</dd></div>
          <div v-if="lastConcludedCase.expectsMoney">
            <dt>主张金额</dt><dd>{{ lastConcludedCase.claimAmountCny }} 元</dd>
          </div>
          <div v-if="lastConcludedCase.requiresRework" class="is-wide">
            <dt>返工认定</dt><dd>本次认定要求对方返工 / 补交付</dd>
          </div>
          <div class="is-wide"><dt>诉求说明</dt><dd>{{ lastConcludedCase.description }}</dd></div>
          <div v-if="lastConcludedCase.resolutionNote" class="is-wide">
            <dt>处理说明</dt>
            <dd>{{ lastConcludedCase.resolutionNote }}</dd>
          </div>
          <div v-if="executedFunds(lastConcludedCase).length" class="is-wide">
            <dt>已执行资金</dt>
            <dd>{{ executedFunds(lastConcludedCase).join(' / ') }}</dd>
          </div>
          <div v-if="pendingFunds(lastConcludedCase).length" class="is-wide">
            <dt>本次认定（尚未执行）</dt>
            <dd>{{ pendingFunds(lastConcludedCase).join(' / ') }}</dd>
          </div>
          <div
            v-if="executedFundsFen(lastConcludedCase) > 0 && lastConcludedCase.shortfallFen > 0"
            class="is-wide"
          >
            <dt>诉求差额</dt>
            <dd>
              诉求 {{ lastConcludedCase.claimAmountCny }} 元，受可退部分与赔付上限（冻结保证金与需求预算取小）限制，本次共执行
              {{ moneyFromFen(executedFundsFen(lastConcludedCase)) }} 元，差额
              <strong>{{ lastConcludedCase.shortfallCny }} 元</strong>
            </dd>
          </div>
        </dl>

        <template v-if="canSubmitCase">
          <fieldset class="after-sales-modal__expectations">
            <legend>你想要什么（可多选）</legend>
            <label class="after-sales-modal__expectation">
              <input v-model="expectsMoney" type="checkbox" />
              <span>
                <strong>要一笔钱回来</strong>
                <small>退多少、从哪儿退由平台认定：先退你自己付过的部分，不够再由平台从对方保证金里赔</small>
              </span>
            </label>
            <label class="after-sales-modal__expectation">
              <input v-model="expectsRework" type="checkbox" />
              <span>
                <strong>要求返工 / 补交付</strong>
                <small>可以与「要钱」同时选：先返工，做不到再按上面的金额处理</small>
              </span>
            </label>
            <p v-if="!expectsMoney && !expectsRework" class="tip">
              两个都不选就是只反馈问题：平台会记录在案，但不会有资金动作。
            </p>
          </fieldset>

          <label v-if="expectsMoney" class="pay-line after-sales-modal__field">
            <strong>{{ claimAmountField.label }}</strong>
            <input v-model="claimAmount" type="number" min="0" step="0.01" inputmode="decimal"
              :max="requirementBudget ?? undefined" :placeholder="claimAmountField.placeholder" />
          </label>

          <label class="pay-line after-sales-modal__field">
            <strong>问题描述</strong>
            <textarea v-model="description" rows="5" maxlength="2000"
              placeholder="请写明时间、问题现象、与对方沟通的结果和你的诉求"></textarea>
          </label>
        </template>

        <p v-else-if="canOpenCase && concludedWithFunds" class="tip">
          {{ caseConcludedTip }}
        </p>

        <p v-else-if="canOpenCase && windowClosed" class="tip">
          {{ windowClosedTip }}
        </p>

        <template v-else>
          <p class="tip">
            售后由需求方（甲方）发起，你这边只用于查看诉求并表态：接受即按诉求执行，不接受由平台裁决。
          </p>
          <details class="after-sales-modal__rules">
            <summary>点开看你能做什么</summary>
            <ul>
              <li>
                接受即按对方诉求执行：要钱的按主张金额执行 —— 先原路退还他付过的部分（结单后尾款
                已分账，渠道按原分账份额退回，所以通常等于从你的分账收入里扣回），不够的部分才从你
                仍冻结的接单保证金扣划赔付；要返工的你得真的把活补上，等他验收。
                不认可就走「不接受，转平台裁决」，由客服认定责任方与金额。
              </li>
              <li>
                需求方点了「确认已落实」即结案；返工类诉求若你认为已做到、对方却报「未落实」，案件会转客服裁决。
              </li>
              <li>结单后如需反映其它问题，请走工单中心联系平台。</li>
            </ul>
          </details>
          <!-- P23：乙方没有自助立案入口，这里把「该走哪条路」写成可点的出口，别只留一句话。 -->
          <p class="tip">
            你是乙方：结单后平台<strong>不开放</strong>自助立案（资金出口只通向需求方）。如遇对方拖欠、或需要平台介入，
            请到 <router-link to="/workbench/tickets">工单中心</router-link> 提交工单，由客服跟进处理。
          </p>
        </template>
      </template>

      <div class="actions">
        <button class="ghost" type="button" :disabled="busy" @click="close">关闭</button>
        <button v-if="canSubmitCase && !currentCase && !casesLoading" class="ghost primary" type="button"
          :disabled="submitting" @click="submit">
          {{ submitting ? '提交中...' : '提交售后申请' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 样式挂在全局的 .pay-modal 之上：这里只补售后弹窗自己的字段与记录列表。 */
.pay-modal.after-sales-modal {
  width: min(600px, 100%);
  max-height: calc(100vh - 36px);
  overflow-y: auto;
}

/* 需求标题与编号并成一行：它们是背景信息，不值得占两行正文位置。 */
.pay-modal .after-sales-modal__subject {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  margin: 0 0 14px;
}

.pay-modal .after-sales-modal__subject strong {
  color: #0f172a;
  font-size: 15px;
  font-weight: 800;
}

.pay-modal .after-sales-modal__subject span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
}

/* 案件事实排成两列：字段一眼扫完，不再是一串「标签：值」的长行。 */
.pay-modal .after-sales-modal__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 18px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.72);
}

.pay-modal .after-sales-modal__facts > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.pay-modal .after-sales-modal__facts > div.is-wide {
  grid-column: 1 / -1;
}

.pay-modal .after-sales-modal__facts dt {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.pay-modal .after-sales-modal__facts dd {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

/* 规则与流程细节默认折起来，需要时再点开。 */
.pay-modal .after-sales-modal__rules {
  margin-top: 14px;
  padding: 10px 14px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.72);
}

.pay-modal .after-sales-modal__rules > summary {
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.pay-modal .after-sales-modal__rules ul {
  display: grid;
  gap: 6px;
  margin: 10px 0 0;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

.pay-modal .after-sales-modal__rules p {
  margin: 10px 0 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.7;
}

/* 历史案件默认折起来：动辄几十条，摊开只会把当前要处理的事顶出屏幕。 */
.pay-modal .after-sales-modal__summary {
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.pay-modal .after-sales-modal__summary span {
  margin-left: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.pay-modal .after-sales-modal__field {
  display: grid;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 14px;
}

.pay-modal .after-sales-modal__field > strong {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

/* 期望多选：两个卡片式勾选项（要钱 / 要返工），可以同时选。
   与「票种」那两个卡片同一个视觉口径，不再用下拉：选项就两个、还允许并存。 */
.pay-modal .after-sales-modal__expectations {
  display: grid;
  gap: 8px;
  margin: 0;
  border: 0;
  padding: 0;
}

.pay-modal .after-sales-modal__expectations legend {
  margin-bottom: 8px;
  padding: 0;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
}

.pay-modal .after-sales-modal__expectation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid rgba(198, 210, 236, 0.9);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.pay-modal .after-sales-modal__expectation:hover {
  border-color: rgba(148, 163, 184, 0.9);
}

.pay-modal .after-sales-modal__expectation:has(input:checked) {
  border-color: rgba(37, 99, 235, 0.5);
  background: rgba(37, 99, 235, 0.05);
}

.pay-modal .after-sales-modal__expectation input {
  width: auto;
  min-height: 0;
  margin: 3px 0 0;
  accent-color: #2563eb;
}

.pay-modal .after-sales-modal__expectation span {
  display: grid;
  gap: 2px;
}

.pay-modal .after-sales-modal__expectation strong {
  color: #0f172a;
  font-size: 13px;
}

.pay-modal .after-sales-modal__expectation small {
  color: #64748b;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

.pay-modal .after-sales-modal__field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(198, 210, 236, 0.9);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
  color: #0f172a;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  outline: none;
}

.pay-modal .after-sales-modal__field input:focus {
  border-color: rgba(37, 99, 235, 0.58);
  background: #ffffff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}

.pay-modal .after-sales-modal__empty {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 640px) {
  /* 窄屏上事实列表退回单列：两列会把「标签 + 值」挤成竖排字。 */
  .pay-modal .after-sales-modal__facts {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
