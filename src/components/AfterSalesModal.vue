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
import { RouterLink } from 'vue-router'
import {
  listMyAfterSalesCases,
  openAfterSalesCase,
  respondAfterSalesCase,
  withdrawAfterSalesCase,
  type AfterSalesCase,
  type AfterSalesDecision,
  type AfterSalesKind,
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

/**
 * 转人工后的催办出口：需求方与开发者各有一套工单中心。
 * `canOpenCase` 正好区分两者（只有甲方能发起售后，也就只有甲方走需求方路由）。
 */
const ticketCenterRoute = computed(() =>
  props.canOpenCase ? { name: 'workbench-tickets' } : { name: 'dev-tickets' },
)
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

/**
 * 当前需求正在办理的售后案件（一个需求只有一条案件，收口前就挂在它上面）。
 */
const currentCase = computed(() =>
  cases.value.find((row) => !CLOSED_STATUSES.includes(row.status)),
)

/**
 * 已经收口的案件（撤回 / 驳回 / 结案）：案件只有一条，所以它就是「上次售后」的结果。
 *
 * 售后不记录轮次：再次提交会复用同一条案件，上一次的诉求与结论被这次的覆盖，
 * 平台侧也查不到历史诉求，所以这里只展示「上次售后」这一条结论，不堆历史列表。
 */
const lastClosedCase = computed(() =>
  cases.value.find((row) => CLOSED_STATUSES.includes(row.status)),
)

/** 上次售后收口的展示时间：优先用后端给的结案时间，兜底用最后更新时间。 */
const lastClosedAt = computed(() => {
  const row = lastClosedCase.value
  return row ? row.resolvedAt || row.updatedAt : ''
})

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

function statusText(status: AfterSalesCase['status']) {
  switch (status) {
    case 'submitted':
      return '待对方表态'
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

/**
 * 在办案件的一句话状态说明：先说清「现在到哪一步、你要做什么」。
 *
 * 待对方表态这类不需要解释的状态不给文案，省掉一行噪音。
 */
const STATUS_TIPS: Partial<Record<AfterSalesCase['status'], string>> = {
  processing: '平台裁决已落地，资金正在执行，完成后自动结案。',
  support_reviewing: '已提交平台裁决，等待客服认定责任方与金额。',
  agreed: '双方已就诉求达成一致，落实后由发起人点「确认已落实」结案。',
  rework_pending: '对方已接受返工要求，返工完成后由发起人点「确认已落实」结案。',
}

/** 折进折叠区的流程分支细节：只给确实有分支可说的状态，避免点开是空盒子。 */
const STATUS_DETAILS: Partial<Record<AfterSalesCase['status'], string>> = {
  support_reviewing:
    '客服给出责任方与金额认定后，由平台执行尾款退还 / 保证金赔付并结案。这期间发起人仍可撤回申请；资金一旦开始执行就只能等落地。',
  agreed:
    '这条诉求没有需要平台执行的钱（赔偿 / 其它 / 未填退款额度的退款），落实完成后由发起人确认结案；一直不确认会在售后窗口关闭后转人工客服。',
  rework_pending:
    '若对方没有落实，发起人可点「未落实，申请平台介入」转客服裁决，届时可动用尾款退还与保证金赔付两个渠道；一直不确认会在售后窗口关闭后转人工客服。',
}

const statusTip = computed(() =>
  currentCase.value ? (STATUS_TIPS[currentCase.value.status] ?? null) : null,
)

const statusDetail = computed(() =>
  currentCase.value ? (STATUS_DETAILS[currentCase.value.status] ?? null) : null,
)

function kindText(value: AfterSalesKind) {
  return KIND_OPTIONS.find((option) => option.value === value)?.label ?? '其它问题'
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
          <div><dt>诉求类型</dt><dd>{{ kindText(currentCase.kind) }}</dd></div>
          <div><dt>诉求额度</dt><dd>{{ currentCase.claimAmountCny }} 元</dd></div>
          <div class="is-wide"><dt>诉求说明</dt><dd>{{ currentCase.description }}</dd></div>
          <div><dt>需求方表态</dt><dd>{{ decisionText(currentCase.customerDecision) }}</dd></div>
          <div><dt>开发者表态</dt><dd>{{ decisionText(currentCase.developerDecision) }}</dd></div>
          <div v-if="currentCase.resolutionNote" class="is-wide">
            <dt>处理说明</dt>
            <dd>{{ currentCase.resolutionNote }}</dd>
          </div>
          <div v-if="currentCase.refundAmountFen || currentCase.compensationAmountFen" class="is-wide">
            <dt>已执行资金</dt>
            <dd>
              退还尾款 {{ currentCase.refundAmountCny }} 元 / 保证金赔付
              {{ currentCase.compensationAmountCny }} 元
            </dd>
          </div>
        </dl>

        <!-- 状态说明只留一句「现在到哪一步、要做什么」，分支细节收进折叠区，避免整段文字糊住按钮。 -->
        <p v-if="statusTip" class="tip">{{ statusTip }}</p>
        <p v-else-if="currentCase.status === 'manual_required'" class="tip">
          资金执行遇到问题，已转人工客服处理；催办请走
          <RouterLink :to="ticketCenterRoute">工单中心</RouterLink>。
        </p>
        <details v-if="statusDetail" class="after-sales-modal__rules">
          <summary>点开看流程细节</summary>
          <p>{{ statusDetail }}</p>
        </details>

        <p v-else-if="currentCase.status === 'manual_required'" class="tip">
          资金执行遇到问题，已转人工客服处理。客服会尽快跟进，进展会同步到需求会话里；
          催办请走
          <RouterLink :to="ticketCenterRoute">工单中心</RouterLink>。
        </p>

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
             因此这里只出这一条结论，不堆历史列表，否则每次售后都会堆成一条「历史售后案件」。 -->
        <dl v-if="lastClosedCase" class="after-sales-modal__facts">
          <div>
            <dt>上次售后</dt>
            <dd>{{ statusText(lastClosedCase.status) }}</dd>
          </div>
          <div><dt>收口时间</dt><dd>{{ lastClosedAt ? formatCnDateTime(lastClosedAt) : '—' }}</dd></div>
          <div><dt>诉求类型</dt><dd>{{ kindText(lastClosedCase.kind) }}</dd></div>
          <div><dt>诉求额度</dt><dd>{{ lastClosedCase.claimAmountCny }} 元</dd></div>
          <div class="is-wide"><dt>诉求说明</dt><dd>{{ lastClosedCase.description }}</dd></div>
          <div v-if="lastClosedCase.resolutionNote" class="is-wide">
            <dt>处理说明</dt>
            <dd>{{ lastClosedCase.resolutionNote }}</dd>
          </div>
          <div v-if="lastClosedCase.refundAmountFen || lastClosedCase.compensationAmountFen" class="is-wide">
            <dt>已执行资金</dt>
            <dd>
              退还尾款 {{ lastClosedCase.refundAmountCny }} 元 / 保证金赔付
              {{ lastClosedCase.compensationAmountCny }} 元
            </dd>
          </div>
        </dl>

        <template v-if="canSubmitCase">
          <p v-if="lastClosedCase" class="tip">
            还有问题就继续提交：新诉求会接着这条案件处理，上一次的诉求与结论会被这次提交覆盖。
          </p>

          <label class="after-sales-modal__field">
            <strong>诉求类型</strong>
            <el-select v-model="kind" class="after-sales-modal__select" popper-class="after-sales-kind-popper"
              aria-label="诉求类型">
              <el-option v-for="option in KIND_OPTIONS" :key="option.value" :label="option.label"
                :value="option.value" />
            </el-select>
          </label>

          <label class="pay-line after-sales-modal__field">
            <strong>{{ claimAmountField.label }}</strong>
            <input v-model="claimAmount" type="number" min="0" step="0.01" inputmode="decimal"
              :placeholder="claimAmountField.placeholder" />
          </label>

          <label class="pay-line after-sales-modal__field">
            <strong>问题描述</strong>
            <textarea v-model="description" rows="5" maxlength="2000"
              placeholder="请写明时间、问题现象、与对方沟通的结果和你的诉求"></textarea>
          </label>
        </template>

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
                接受即按对方诉求执行（退款型诉求当场原路退还尾款）；不认可就走「不接受，转平台裁决」，
                由客服认定责任方与金额。
              </li>
              <li>
                需求方点了「确认已落实」即结案；返工类诉求若你认为已做到、对方却报「未落实」，案件会转客服裁决。
              </li>
              <li>结单后如需反映其它问题，请走工单中心联系平台。</li>
            </ul>
          </details>
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

/* 诉求类型下拉与同弹窗的输入框同高同圆角：Element 默认的 32px / 4px 会比旁边的输入框矮一截。
   浮层另见文件末尾不带 scoped 的样式块。 */
.pay-modal .after-sales-modal__select {
  width: 100%;
}

.pay-modal .after-sales-modal__select :deep(.el-select__wrapper) {
  /* 收起状态下 Element 用 --el-input-text-color 给已选中的值上色，改变量比压选择器更稳 */
  --el-input-text-color: #0f172a;

  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
  box-shadow: 0 0 0 1px rgba(198, 210, 236, 0.9) inset;
  font-size: 14px;
}

/* 浮层展开时 Element 会给已选中的值补一个 is-transparent（`!hasModelValue || expanded`），
   并把那段文字按占位灰（--el-text-color-placeholder）渲染——见 el-select.css 的
   `.el-select__placeholder.is-transparent`。于是同一段文字「收起时正文色、展开瞬间变灰」，
   字段看着像没填，光靠上面的 --el-input-text-color 压不住。这个下拉永远有值
   （默认「要求返工」，不可清空），所以直接压回正文色。 */
.pay-modal .after-sales-modal__select :deep(.el-select__placeholder) {
  color: #0f172a;
}

.pay-modal .after-sales-modal__select :deep(.el-select__wrapper:hover),
.pay-modal .after-sales-modal__select :deep(.el-select__wrapper.is-hovering) {
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.42) inset;
}

/* 聚焦态与同弹窗的输入框一致：一圈描边 + 一层淡蓝光晕 */
.pay-modal .after-sales-modal__select :deep(.el-select__wrapper.is-focused) {
  background: #ffffff;
  box-shadow:
    0 0 0 1px rgba(37, 99, 235, 0.58) inset,
    0 0 0 4px rgba(37, 99, 235, 0.1);
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

<style>
/* 诉求类型下拉的浮层：Element 会把它 teleport 到 body 上，scoped 样式够不到，
   所以单独放一个不带 scoped 的块。默认那套是 4px 方角 + 系统灰描边的白面板，
   跟这个弹窗的圆角卡片不是一套，这里整体对齐弹窗自己面板的圆角、描边与投影。 */
.after-sales-kind-popper.el-popper {
  padding: 6px !important;
  border: 1px solid rgba(226, 232, 240, 0.95) !important;
  border-radius: 14px !important;
  background: #ffffff !important;
  box-shadow: 0 18px 44px rgba(90, 120, 180, 0.16) !important;
}

.after-sales-kind-popper .el-select-dropdown,
.after-sales-kind-popper .el-select-dropdown__list {
  padding: 0;
  border-radius: 12px;
}

.after-sales-kind-popper .el-select-dropdown__item {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  color: #334155;
  font-size: 14px;
  line-height: 40px;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

/* 触屏档把选项行抬到 44px：列表项 / 菜单项的触摸目标不小于 44px 是移动端硬要求
   （见 doc/设计规范.md）。 */
@media (max-width: 640px) {
  .after-sales-kind-popper .el-select-dropdown__item {
    height: 44px;
    line-height: 44px;
  }
}

.after-sales-kind-popper .el-select-dropdown__item.is-hovering {
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
}

/* 当前选中的类型留一个常驻底色，一眼能看出现在是哪一类 */
.after-sales-kind-popper .el-select-dropdown__item.is-selected {
  background: rgba(239, 246, 255, 0.96);
  color: #1d4ed8;
  font-weight: 700;
}
</style>
