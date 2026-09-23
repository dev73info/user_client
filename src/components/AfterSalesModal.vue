<script setup lang="ts">
/**
 * 售后弹窗（结单后的唯一业务入口）。
 *
 * 需求方与开发者共用：发起售后只放行需求方（甲方）——资金出口只有「原路退还需求方尾款」
 * 与「从开发者保证金扣划赔付需求方」两个方向，开发者发起没有能落地的诉求，因此开发者侧
 * 只保留案件查看与「接受 / 不接受」表态（由调用方用 `canOpenCase` 关掉发起表单）。
 * 入口守卫里还包含售后窗口：窗口状态由服务端在案件列表响应里给出（`windowOpen`），
 * 窗口关闭后不再渲染发起表单，避免用户填完表单一律被后端 409 拒绝；前端不自己拿时间戳
 * 比大小，真正的判定仍在服务层。
 */
import { computed, ref, watch } from 'vue'
import {
  getAfterSalesCase,
  listMyAfterSalesCases,
  openAfterSalesCase,
  proposeAfterSalesNegotiation,
  respondAfterSalesCase,
  respondAfterSalesNegotiation,
  withdrawAfterSalesCase,
  type AfterSalesCase,
  type AfterSalesCaseDetail,
  type AfterSalesKind,
  type AfterSalesNegotiation,
  type AfterSalesNegotiationAction,
  type AfterSalesRespondAction,
} from '@/api/afterSales'
import { useToast } from '@/composables/useToast'
import { formatCnDateTime } from '@/shared/requirementDisplay'

const props = defineProps<{
  visible: boolean
  token: string | null
  currentUsername: string
  requirementId: string
  requirementTitle: string
  /** 当前登录人是否是本需求的需求方（甲方）：只有甲方能发起售后。 */
  canOpenCase: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const { showToast } = useToast()

/** 终态案件不再有可执行动作，只作为历史记录展示。 */
const CLOSED_STATUSES = ['succeeded', 'rejected', 'withdrawn']

/** 售后诉求类型（取值与后端 `kind` 一致，四类都能填诉求额度）。 */
const KIND_OPTIONS: ReadonlyArray<{ value: AfterSalesKind; label: string }> = [
  { value: 'refund', label: '要求退款' },
  { value: 'compensation', label: '要求赔偿' },
  { value: 'repair', label: '要求返工' },
  { value: 'other', label: '其它问题' },
]

const kind = ref<AfterSalesKind>('repair')
const description = ref('')
const claimAmount = ref<string | number>('')
const submitting = ref(false)
const cases = ref<AfterSalesCase[]>([])
const casesLoading = ref(false)
const respondingId = ref<number | null>(null)
const withdrawingId = ref<number | null>(null)

/** 在办案件的详情：协商记录与两个资金上限只在详情里下发，列表接口没有。 */
const caseDetail = ref<AfterSalesCaseDetail | null>(null)
/** 协商提议表单是否展开（提还价 / 改我的还价）。 */
const proposalOpen = ref(false)
const proposalAmount = ref<string | number>('')
const proposalCompensation = ref<string | number>('')
const proposalNote = ref('')
const proposing = ref(false)
const proposalRespondingId = ref<number | null>(null)

/** 售后窗口是否还开着（服务端判定）；窗口状态未知时为 null。 */
const windowOpen = ref<boolean | null>(null)
/** 售后窗口关闭时间，用于在窗口已关闭时告知需求方。 */
const windowClosesAt = ref<string | null>(null)

/** 售后窗口已关闭：此时不再渲染发起表单——表单填完必然被后端 409 拒绝。 */
const windowClosed = computed(() => windowOpen.value === false)

/**
 * 能不能发起售后：调用方允许（需求方视角）+ 窗口还开着。
 * 窗口状态为 null（老后端或没按需求查询）时不拦，保留后端 409 兜底。
 */
const canSubmitCase = computed(() => props.canOpenCase && !windowClosed.value)

/** 窗口已关闭时的说明文案：拿得到关闭时间就说清楚，拿不到（结单时间异常）退化为通用措辞。 */
const windowClosedTip = computed(() =>
  windowClosesAt.value
    ? `售后窗口已于 ${formatCnDateTime(windowClosesAt.value)} 关闭，本需求不再受理新的售后申请。如需反映其它问题，请走工单中心联系平台。`
    : '本需求的售后窗口已关闭，不再受理新的售后申请。如需反映其它问题，请走工单中心联系平台。',
)

/** 当前需求正在办理的售后案件（同一需求同时只允许一条在办案件）。 */
const currentCase = computed(() =>
  cases.value.find((row) => !CLOSED_STATUSES.includes(row.status)),
)

const closedCases = computed(() =>
  cases.value.filter((row) => CLOSED_STATUSES.includes(row.status)),
)

/**
 * 诉求额度的文案按诉求类型给。
 *
 * 四类诉求都能填这个额度——它只是发起人的主张，平台裁决时作参考（执行上限由「已缴尾款」与
 * 「仍冻结的接单保证金」两个池子决定，见裁决弹窗）。文案要跟着类型走，否则「要求返工」下
 * 顶着「希望退还的尾款」会让人以为在填返工费。
 */
const CLAIM_AMOUNT_FIELDS: Record<AfterSalesKind, { label: string; placeholder: string }> = {
  refund: {
    label: '希望退还的尾款（元）',
    placeholder: '留空按平台裁决，不得超过已付尾款',
  },
  compensation: {
    label: '希望赔偿的金额（元）',
    placeholder: '留空按平台裁决，不得超过开发者仍冻结的保证金',
  },
  repair: {
    label: '返工不成时希望退还的尾款（元）',
    placeholder: '选填；返工做到了就不涉及退钱',
  },
  other: {
    label: '希望平台处理的金额（元）',
    placeholder: '选填，供平台裁决参考',
  },
}

const claimAmountField = computed(() => CLAIM_AMOUNT_FIELDS[kind.value])

/** 有请求在途时不允许关窗，避免资金动作的结果无从收口。 */
const busy = computed(
  () =>
    submitting.value ||
    respondingId.value !== null ||
    withdrawingId.value !== null ||
    proposing.value ||
    proposalRespondingId.value !== null,
)

/** 诉求额度分：非法或非正数一律按 0（后端只把它当诉求参考，实际退款由平台裁决）。 */
const claimAmountFen = computed(() => {
  const parsed = Number(claimAmount.value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.round(parsed * 100)
})

/** 还价额度分：同样非法或非正数按 0（0 元也能提，表示「只希望返工、不涉及退钱」）。 */
const proposalAmountFen = computed(() => {
  const parsed = Number(proposalAmount.value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.round(parsed * 100)
})

/** 还价里的赔付额度分：同样非法或非正数按 0（不主张赔付，只谈退款）。 */
const proposalCompensationFen = computed(() => {
  const parsed = Number(proposalCompensation.value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }
  return Math.round(parsed * 100)
})

/** 表态与撤回都只放行尚未进入资金执行的案件，与后端的状态守卫一致。 */
function actionAllowed(status: AfterSalesCase['status']) {
  return ['submitted', 'negotiating', 'support_reviewing'].includes(status)
}

/** 本方在这次案件里的表态：发起人走撤回 / 确认落实，不写表态列。 */
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

/** 未决还价提议（详情接口下发）：有它时先处理提议，而不是对原诉求表态。 */
const pendingNegotiation = computed(() => caseDetail.value?.pendingNegotiation ?? null)

/** 协商记录（最新在前）。 */
const negotiations = computed(() => caseDetail.value?.negotiations ?? [])

/** 已缴尾款（分）：还价额度的上限，也是「退款只能从这个池子出」的直观依据。 */
const finalPaidFen = computed(() => caseDetail.value?.finalPaidFen ?? 0)

/** 仍冻结的接单保证金（分）：还价里赔付额度的上限。 */
const frozenDepositFen = computed(() => caseDetail.value?.frozenDepositFen ?? 0)

/** 有可赔付的冻结保证金时才显示赔付额度输入：为 0 时填了也一定被后端拒。 */
const canProposeCompensation = computed(() => Boolean(caseDetail.value && frozenDepositFen.value > 0))

/** 还价额度的上限提示：拿不到详情时（未缴尾款口径未知）退化为通用措辞。 */
const proposalLimitTip = computed(() => {
  if (!caseDetail.value) {
    return '还价额度不得超过本需求已缴尾款（正在读取上限…）'
  }
  const refundTip =
    finalPaidFen.value > 0
      ? `退还尾款不得超过已缴尾款 ${caseDetail.value.finalPaidCny} 元（退款只能从这笔钱里出）`
      : '本需求没有已缴尾款，退还尾款只能是 0（例如约定返工、不涉及退钱）'
  return canProposeCompensation.value
    ? `${refundTip}；保证金赔付不得超过仍冻结的 ${caseDetail.value.frozenDepositCny} 元（从开发者自己的保证金里出，谈成即视为开发者认责）`
    : refundTip
})

/** 是不是自己提的未决提议：是的话按钮是「改我的还价」而不是「接受 / 拒绝」。 */
const proposalIsMine = computed(() => {
  const row = currentCase.value
  const pending = pendingNegotiation.value
  return Boolean(row && pending && row.viewerRole === pending.initiatedBy)
})

/**
 * 能不能提还价：案件还在可谈的状态，且详情已加载（上限口径要用 `finalPaidFen`）。
 *
 * 对方手里有未决提议时不放行——那条提议顶不掉，必须先在表态里处理，否则后端一律 409。
 */
const canPropose = computed(() => {
  const row = currentCase.value
  if (!row || row.viewerRole === null || !caseDetail.value) {
    return false
  }
  const pending = pendingNegotiation.value
  if (pending && pending.initiatedBy !== row.viewerRole) {
    return false
  }
  return actionAllowed(row.status)
})

/**
 * 能不能对未决提议表态：必须是提议方之外的一方（后端禁止自问自答）。
 *
 * 这里不看本方是否已对原诉求表过态：后端允许「先前表态不接受，之后接受协商出的新额度」，
 * 最终立场以协商结果为准（`record_mutual_acceptance` 会覆盖旧表态）。
 */
const canRespondToProposal = computed(() => {
  const row = currentCase.value
  const pending = pendingNegotiation.value
  if (!row || !pending || row.viewerRole === null) {
    return false
  }
  return row.viewerRole !== pending.initiatedBy && actionAllowed(row.status)
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

/** 发起人确认诉求已落实：`agreed`（赔偿 / 其它 / 额度为 0 的退款）与 `rework_pending`（返工）都在等这一步。 */
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

/** 协商记录里的表态去向。 */
function negotiationStatusText(status: AfterSalesNegotiation['status']) {
  switch (status) {
    case 'pending':
      return '待对方表态'
    case 'accepted':
      return '已达成一致'
    default:
      return '未达成'
  }
}

/** 协商记录里的表态去向 + 对方留下的说明（未决提议还没有说明可显示）。 */
function negotiationResultText(row: AfterSalesNegotiation) {
  const status = negotiationStatusText(row.status)
  return row.responseNote ? `${status}：${row.responseNote}` : status
}

/** 协商记录里的提议方：区分我方 / 对方，并带上身份，避免多轮记录看不出谁提的。 */
function proposalPartyText(row: AfterSalesNegotiation) {
  const mine = currentCase.value?.viewerRole === row.initiatedBy
  const who = mine ? '我方' : '对方'
  const side = row.initiatedBy === 'customer' ? '需求方' : '开发者'
  return `${who}（${side}）`
}

/** 提议的两个额度拼成一句话：只写有金额的那一维，都谈才不会漏看赔付。 */
function proposalAmountText(row: AfterSalesNegotiation | null) {
  if (!row) {
    return ''
  }
  const parts: string[] = []
  if (row.refundAmountFen > 0) {
    parts.push(`退还尾款 ${row.refundAmountCny} 元`)
  }
  if (row.compensationAmountFen > 0) {
    parts.push(`保证金赔付 ${row.compensationAmountCny} 元`)
  }
  // 两个额度都是 0：这是一条「不要钱、只要对方做事」的提议（例如返工）。
  return parts.length > 0 ? parts.join(' + ') : '不动资金'
}

function statusText(status: AfterSalesCase['status']) {
  switch (status) {
    case 'submitted':
      return '待对方表态'
    case 'negotiating':
      return '协商中'
    case 'support_reviewing':
      return '平台裁决中'
    case 'processing':
      return '平台处理中'
    case 'agreed':
      // 对方接受了诉求，但没有可直接执行的资金动作（赔偿 / 其它 / 额度为 0 的退款），等发起人确认落实。
      return '待确认落实'
    case 'rework_pending':
      // 对方接受了返工要求，等发起人验收；发起人可点「确认已落实」或「未落实，申请平台介入」。
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

function kindText(value: AfterSalesKind) {
  return KIND_OPTIONS.find((option) => option.value === value)?.label ?? '其它问题'
}

function decisionText(decision: AfterSalesCase['customerDecision']) {
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
  await refreshDetail()
}

/**
 * 拉在办案件的详情：协商记录与两个资金上限只在详情接口下发，列表接口没有。
 * 详情失败不等于案件加载失败——按钮会退回「不可协商」而不是让整个弹窗报错。
 */
async function refreshDetail() {
  const row = currentCase.value
  if (!props.token || !row) {
    caseDetail.value = null
    return
  }
  try {
    caseDetail.value = await getAfterSalesCase(props.token, row.id)
  } catch (err) {
    caseDetail.value = null
    showToast(err instanceof Error ? err.message : '加载售后案件详情失败', 'error')
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

  submitting.value = true
  try {
    await openAfterSalesCase(
      props.token,
      props.requirementId,
      kind.value,
      description.value.trim(),
      claimAmountFen.value,
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

/** 表态结果提示：接受分「当场退款」与「等发起人收口」两种去处，别用同一句话糊过去。 */
function respondToast(action: AfterSalesRespondAction, updated: AfterSalesCase) {
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

/** 展开还价表单：自己已有未决提议时预填那条的两个额度与说明，方便在既有方案上改。 */
function openProposal() {
  const pending = pendingNegotiation.value
  proposalAmount.value =
    pending && pending.refundAmountFen > 0 ? (pending.refundAmountFen / 100).toFixed(2) : ''
  proposalCompensation.value =
    pending && pending.compensationAmountFen > 0
      ? (pending.compensationAmountFen / 100).toFixed(2)
      : ''
  proposalNote.value = pending ? pending.note : ''
  proposalOpen.value = true
}

/** 展开 / 收起还价表单。 */
function toggleProposal() {
  if (proposalOpen.value) {
    proposalOpen.value = false
    return
  }
  openProposal()
}

/** 提还价（自己已有未决提议时即为改额度重提，后端会就地作废旧那条）。 */
async function proposeNegotiation() {
  const row = currentCase.value
  if (!props.token || !row) {
    return
  }
  // 两个上限先在本方拦一次：后端也会拒（400），但让用户在提交前就知道差在哪儿更省事。
  if (proposalAmountFen.value > finalPaidFen.value) {
    showToast(
      `退还尾款不能超过已缴尾款 ${caseDetail.value?.finalPaidCny ?? '0.00'} 元`,
      'warning',
    )
    return
  }
  if (proposalCompensationFen.value > frozenDepositFen.value) {
    showToast(
      `保证金赔付不能超过仍冻结的 ${caseDetail.value?.frozenDepositCny ?? '0.00'} 元`,
      'warning',
    )
    return
  }
  proposing.value = true
  try {
    await proposeAfterSalesNegotiation(
      props.token,
      row.id,
      proposalAmountFen.value,
      proposalCompensationFen.value,
      proposalNote.value.trim(),
    )
    showToast('还价已提交，等对方表态', 'success')
    proposalOpen.value = false
    await refresh()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交还价失败', 'error')
  } finally {
    proposing.value = false
  }
}

/** 对未决提议表态：同意即按提议的两个额度执行结案（都是 0 时转「待确认落实」），拒绝则作废可重提。 */
async function respondProposal(action: AfterSalesNegotiationAction) {
  const row = currentCase.value
  if (!props.token || !row) {
    return
  }
  proposalRespondingId.value = row.id
  try {
    const updated = await respondAfterSalesNegotiation(props.token, row.id, action)
    showToast(proposalToast(action, updated), 'success')
    proposalOpen.value = false
    await refresh()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交协商表态失败', 'error')
  } finally {
    proposalRespondingId.value = null
  }
}

/** 协商表态结果提示：同意分「按提议额度执行」「转待确认落实」与「转返工中」几种去处，同诉求表态的取舍。 */
function proposalToast(action: AfterSalesNegotiationAction, updated: AfterSalesCase) {
  if (action === 'reject') {
    return '已拒绝提议，双方可改额度重提'
  }
  if (updated.status === 'rework_pending') {
    return '已接受提议，等对方确认返工完成'
  }
  return updated.status === 'agreed'
    ? '已接受提议，等对方确认落实'
    : '已接受提议，平台按提议额度退还尾款 / 扣划保证金赔付'
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
    kind.value = 'repair'
    description.value = ''
    claimAmount.value = ''
    cases.value = []
    caseDetail.value = null
    proposalOpen.value = false
    proposalAmount.value = ''
    proposalCompensation.value = ''
    proposalNote.value = ''
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
      <p class="pay-line"><strong>需求标题：</strong>{{ requirementTitle }}</p>
      <p class="pay-line"><strong>需求编号：</strong>{{ requirementId }}</p>

      <p v-if="casesLoading" class="after-sales-modal__empty">正在加载售后案件…</p>

      <template v-else-if="currentCase">
        <p class="pay-line"><strong>案件编号：</strong>{{ currentCase.caseNo }}</p>
        <p class="pay-line"><strong>当前状态：</strong>{{ statusText(currentCase.status) }}</p>
        <p class="pay-line"><strong>发起人：</strong>{{ currentCase.openedBy }}</p>
        <p class="pay-line"><strong>诉求类型：</strong>{{ kindText(currentCase.kind) }}</p>
        <p class="pay-line"><strong>诉求额度：</strong>{{ currentCase.claimAmountCny }} 元</p>
        <p class="pay-line"><strong>诉求说明：</strong>{{ currentCase.description }}</p>
        <p class="pay-line">
          <strong>需求方表态：</strong>{{ decisionText(currentCase.customerDecision) }}
        </p>
        <p class="pay-line">
          <strong>开发者表态：</strong>{{ decisionText(currentCase.developerDecision) }}
        </p>
        <p v-if="currentCase.resolutionNote" class="pay-line">
          <strong>处理说明：</strong>{{ currentCase.resolutionNote }}
        </p>
        <p v-if="currentCase.refundAmountFen || currentCase.compensationAmountFen" class="pay-line">
          <strong>已执行资金：</strong>
          退还尾款 {{ currentCase.refundAmountCny }} 元 / 保证金赔付 {{ currentCase.compensationAmountCny }} 元
        </p>
        <p v-if="currentCase.status === 'processing'" class="tip">
          平台裁决已落地，资金正在执行，完成后自动结案。
        </p>
        <p v-else-if="currentCase.status === 'support_reviewing'" class="tip">
          已提交平台裁决，等待客服给出责任方与金额认定；裁决落地后由平台执行尾款退还 /
          保证金赔付并结案。此期间发起人仍可撤回申请、双方也仍可就退款与赔付额度提还价
          （谈成即按还价额度结案），但资金一旦开始执行就只能等落地。
        </p>
        <p v-else-if="currentCase.status === 'agreed'" class="tip">
          双方已就诉求达成一致，这条诉求没有需要平台执行的钱（赔偿 / 其它 / 未填退款额度），
          落实完成后由发起人点「确认已落实」结案；一直不确认会在售后窗口关闭后转人工客服。
        </p>
        <p v-else-if="currentCase.status === 'rework_pending'" class="tip">
          对方已接受返工要求，返工完成后由发起人点「确认已落实」结案。若对方没有落实，
          发起人可点「未落实，申请平台介入」转客服裁决（届时可动用尾款退还与保证金赔付两个渠道）；
          一直不确认会在售后窗口关闭后转人工客服。
        </p>
        <p v-else-if="currentCase.status === 'manual_required'" class="tip">
          资金执行遇到问题，已转人工客服处理，请留意会话消息。
        </p>

        <!-- 未决还价提议：先处理它——同意即按提议的两个额度执行结案，拒绝后可改额度重提。 -->
        <div v-if="pendingNegotiation" class="after-sales-modal__proposal">
          <div class="after-sales-modal__proposal-head">
            <strong>当前还价提议</strong>
            <span>{{ proposalAmountText(pendingNegotiation) }}</span>
          </div>
          <p>{{ proposalPartyText(pendingNegotiation) }}提出：{{ pendingNegotiation.note || '（未填说明）' }}</p>
          <small>{{ formatCnDateTime(pendingNegotiation.createdAt) }} 提出，等对方表态</small>
        </div>

        <div v-if="canRespondToProposal" class="actions">
          <button class="ghost danger-plain" type="button" :disabled="busy" @click="respondProposal('reject')">
            {{ proposalRespondingId === currentCase.id ? '提交中...' : '拒绝提议' }}
          </button>
          <button class="ghost primary" type="button" :disabled="busy" @click="respondProposal('accept')">
            {{ proposalRespondingId === currentCase.id
              ? '提交中...'
              : `接受提议，${proposalAmountText(pendingNegotiation)}` }}
          </button>
        </div>
        <div v-else-if="canRespond && !pendingNegotiation" class="actions">
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

        <!-- 还价入口：自己有未决提议时是「改我的还价」，对方持有时按上文先表态（顶不掉）。 -->
        <div v-if="canWithdraw || canPropose" class="actions">
          <button v-if="canWithdraw" class="ghost danger-plain" type="button"
            :disabled="withdrawingId === currentCase.id" @click="withdraw(currentCase)">
            {{ withdrawingId === currentCase.id ? '撤回中...' : '撤回申请' }}
          </button>
          <button v-if="canPropose" class="ghost primary" type="button" :disabled="busy" @click="toggleProposal">
            {{ proposalOpen ? '收起还价表单' : proposalIsMine ? '改我的还价' : '提一个还价' }}
          </button>
        </div>

        <template v-if="canPropose && proposalOpen">
          <label class="pay-line after-sales-modal__field">
            <strong>我愿意退还给对方的尾款（元）</strong>
            <input v-model="proposalAmount" type="number" min="0" step="0.01" inputmode="decimal"
              placeholder="填 0 表示只要求 / 只同意返工，不涉及退钱" />
            <small class="after-sales-modal__limit">{{ proposalLimitTip }}</small>
          </label>
          <label v-if="canProposeCompensation" class="pay-line after-sales-modal__field">
            <strong>我愿意从保证金赔付给对方（元）</strong>
            <input v-model="proposalCompensation" type="number" min="0" step="0.01" inputmode="decimal"
              placeholder="留空为 0；赔付从你的接单保证金扣划，谈成即视为你认责" />
            <small class="after-sales-modal__limit">
              上限是仍冻结的 {{ caseDetail?.frozenDepositCny }} 元；赔付大于 0 时责任方记为开发者。
            </small>
          </label>
          <label class="pay-line after-sales-modal__field">
            <strong>还价说明</strong>
            <textarea v-model="proposalNote" rows="3" maxlength="1000"
              placeholder="说明你的方案，例如「已返工，验收后退一半尾款」"></textarea>
          </label>
          <div class="actions">
            <button class="ghost" type="button" :disabled="busy" @click="proposalOpen = false">取消</button>
            <button class="ghost primary" type="button" :disabled="busy" @click="proposeNegotiation">
              {{ proposing ? '提交中...' : '提交还价' }}
            </button>
          </div>
        </template>

        <div v-if="negotiations.length" class="after-sales-modal__history">
          <div class="after-sales-modal__history-head">
            <strong>协商记录</strong>
            <span>共 {{ negotiations.length }} 条</span>
          </div>
          <ul class="after-sales-modal__records">
            <li v-for="row in negotiations" :key="row.id">
              <div class="after-sales-modal__record-head">
                <strong>{{ proposalPartyText(row) }}提出还价：{{ proposalAmountText(row) }}</strong>
                <time>{{ formatCnDateTime(row.createdAt) }}</time>
              </div>
              <p>{{ row.note || '（未填说明）' }}</p>
              <small>{{ negotiationResultText(row) }}</small>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="canSubmitCase">
        <div class="after-sales-modal__field">
          <strong>诉求类型</strong>
          <div class="after-sales-modal__kinds" role="group" aria-label="诉求类型">
            <button v-for="option in KIND_OPTIONS" :key="option.value" type="button" class="after-sales-modal__kind"
              :class="{ 'is-active': kind === option.value }" @click="kind = option.value">
              {{ option.label }}
            </button>
          </div>
        </div>

        <label class="pay-line after-sales-modal__field">
          <strong>{{ claimAmountField.label }}</strong>
          <input v-model="claimAmount" type="number" min="0" step="0.01" inputmode="decimal"
            :placeholder="claimAmountField.placeholder" />
          <small class="after-sales-modal__limit">
            选填，作为平台裁决的参考，实际金额由双方协商或平台认定。
          </small>
        </label>

        <label class="pay-line after-sales-modal__field">
          <strong>问题描述</strong>
          <textarea v-model="description" rows="5" maxlength="2000"
            placeholder="请写明时间、问题现象、与对方沟通的结果和你的诉求"></textarea>
        </label>

        <p class="tip">
          售后只在结单后的售后窗口内受理。提交后对方会在需求会话里收到通知：对方接受即按诉求执行
          ——要求退款且填了额度时当场原路退还已付尾款，要求返工则转入「返工中」等你验收，
          其余诉求（赔偿 / 其它）等你确认落实后结案；不接受则由平台裁决——原路退还已付尾款，
          并从开发者仍冻结的接单保证金扣划赔付。返工中若对方没做到，你可以点「未落实，申请平台介入」
          转客服裁决。诉求额度四类诉求都能填，只是你方主张，供平台裁决参考。
        </p>
      </template>

      <p v-else-if="canOpenCase && windowClosed" class="tip">
        {{ windowClosedTip }}
      </p>

      <template v-else>
        <p class="tip">
          售后由需求方（甲方）发起，你这边用于查看诉求并表态：接受即按诉求执行，不接受由平台裁决。
          对诉求额度不认可时也可以直接提一个还价——对方接受即按还价的退款 + 保证金赔付两个额度执行结案，
          拒绝则提议作废，可以改额度再提。需求方点了「确认已落实」即结案；返工类诉求若你认为已做到、
          对方却报「未落实」，案件会转客服裁决。
          结单后如需反映其它问题，请走工单中心联系平台。
        </p>
      </template>

      <div v-if="closedCases.length" class="after-sales-modal__history">
        <div class="after-sales-modal__history-head">
          <strong>历史售后案件</strong>
          <span>共 {{ closedCases.length }} 条</span>
        </div>
        <ul class="after-sales-modal__records">
          <li v-for="row in closedCases" :key="row.id">
            <div class="after-sales-modal__record-head">
              <strong>{{ statusText(row.status) }}</strong>
              <time>{{ formatCnDateTime(row.createdAt) }}</time>
            </div>
            <p>{{ kindText(row.kind) }}：{{ row.description }}</p>
            <small v-if="row.resolutionNote">{{ row.resolutionNote }}</small>
          </li>
        </ul>
      </div>

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

.pay-modal .after-sales-modal__kinds {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.pay-modal .after-sales-modal__kind {
  min-height: 44px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 12px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.pay-modal .after-sales-modal__kind.is-active {
  border-color: rgba(37, 99, 235, 0.62);
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
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

/* 未决还价提议：金额是这一段的重点，所以右对齐单独放大显示。 */
.pay-modal .after-sales-modal__proposal {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 14px;
  background: rgba(239, 246, 255, 0.8);
}

.pay-modal .after-sales-modal__proposal-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.pay-modal .after-sales-modal__proposal-head strong {
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 800;
}

.pay-modal .after-sales-modal__proposal-head span {
  color: #1d4ed8;
  font-size: 18px;
  font-weight: 800;
}

.pay-modal .after-sales-modal__proposal p {
  margin: 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.pay-modal .after-sales-modal__proposal small,
.pay-modal .after-sales-modal__limit {
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.pay-modal .after-sales-modal__history {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.72);
}

.pay-modal .after-sales-modal__history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
}

.pay-modal .after-sales-modal__history-head span,
.pay-modal .after-sales-modal__record-head time {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.pay-modal .after-sales-modal__records {
  display: grid;
  gap: 10px;
  max-height: 220px;
  margin: 10px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.pay-modal .after-sales-modal__records > li {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 12px;
  background: #ffffff;
}

.pay-modal .after-sales-modal__record-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.pay-modal .after-sales-modal__records p {
  margin: 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.pay-modal .after-sales-modal__records small {
  color: #94a3b8;
  font-size: 12px;
}

@media (max-width: 640px) {
  .pay-modal .after-sales-modal__records {
    max-height: none;
  }
}
</style>
