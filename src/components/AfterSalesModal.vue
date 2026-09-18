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
  listMyAfterSalesCases,
  openAfterSalesCase,
  respondAfterSalesCase,
  withdrawAfterSalesCase,
  type AfterSalesCase,
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

/** 售后诉求类型（取值与后端 `kind` 一致，`refund` 才需要填退款额度）。 */
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

/** 诉求额度只在退款型诉求下有意义（后端也只在 `refund` 时按额度默认退款）。 */
const claimAmountVisible = computed(() => kind.value === 'refund')

/** 有请求在途时不允许关窗，避免资金动作的结果无从收口。 */
const busy = computed(
  () => submitting.value || respondingId.value !== null || withdrawingId.value !== null,
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
  return ['submitted', 'negotiating', 'support_reviewing'].includes(status)
}

function statusText(status: AfterSalesCase['status']) {
  switch (status) {
    case 'submitted':
      return '待对方表态'
    case 'negotiating':
      return '协商中'
    case 'processing':
      return '平台处理中'
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
    await respondAfterSalesCase(props.token, item.id, action)
    showToast(action === 'accept' ? '已接受对方诉求' : '已提交，等待平台裁决', 'success')
    await refresh()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交售后表态失败', 'error')
  } finally {
    respondingId.value = null
  }
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
        <p v-else-if="currentCase.status === 'manual_required'" class="tip">
          资金执行遇到问题，已转人工客服处理，请留意会话消息。
        </p>

        <div v-else-if="actionAllowed(currentCase.status) && currentCase.openedBy !== currentUsername"
          class="actions">
          <button class="ghost danger-plain" type="button" :disabled="respondingId === currentCase.id"
            @click="respond(currentCase, 'reject')">
            不接受，转平台裁决
          </button>
          <button class="ghost primary" type="button" :disabled="respondingId === currentCase.id"
            @click="respond(currentCase, 'accept')">
            {{ respondingId === currentCase.id ? '提交中...' : '接受诉求' }}
          </button>
        </div>
        <div v-else-if="actionAllowed(currentCase.status) && currentCase.openedBy === currentUsername"
          class="actions">
          <button class="ghost danger-plain" type="button" :disabled="withdrawingId === currentCase.id"
            @click="withdraw(currentCase)">
            {{ withdrawingId === currentCase.id ? '撤回中...' : '撤回申请' }}
          </button>
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

        <label v-if="claimAmountVisible" class="pay-line after-sales-modal__field">
          <strong>希望退还的尾款（元）</strong>
          <input v-model="claimAmount" type="number" min="0" step="0.01" inputmode="decimal"
            placeholder="留空按平台裁决，不得超过已付尾款" />
        </label>

        <label class="pay-line after-sales-modal__field">
          <strong>问题描述</strong>
          <textarea v-model="description" rows="5" maxlength="2000"
            placeholder="请写明时间、问题现象、与对方沟通的结果和你的诉求"></textarea>
        </label>

        <p class="tip">
          售后只在结单后的售后窗口内受理。提交后对方会在需求会话里收到通知：对方接受即按诉求执行；
          不接受由平台裁决——原路退还已付尾款，并从开发者仍冻结的接单保证金扣划赔付。
        </p>
      </template>

      <p v-else-if="canOpenCase && windowClosed" class="tip">
        {{ windowClosedTip }}
      </p>

      <template v-else>
        <p class="tip">
          售后由需求方（甲方）发起，你这边用于查看诉求并表态：接受即按诉求执行，不接受由平台裁决。
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
