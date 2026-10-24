<script setup lang="ts">
import { computed } from 'vue'

import type { AdapayBreachCase, AdapayBreachDecisionValue } from '@/api/adapay'
import RequirementBreachCaseFacts from '@/components/dev/RequirementBreachCaseFacts.vue'
import {
  breachDialogTitle,
  breachRoundHint,
  breachSubmitLabel,
  canRequestPlatformReview,
  isTerminationNegotiating,
} from '@/shared/requirementBreach'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { TButton, TDialog, TForm, TFormItem, TInput } from 'ui_73info'

/**
 * 开发者侧「解除合作」弹窗：案件进展、协商表态、AI 判定表态、撤回与重新申报。
 *
 * 这里只渲染、只 emit——案件加载 / 申报 / 撤回 / 表态的请求与 toast 在
 * `composables/useBreachCase`，视图把它的状态铺成 props、把它的动作接成 emits。
 * 「是不是我 / 能不能表态」这类判定由编排层算成布尔传进来，组件不自己去 store 取当前登录人。
 *
 * `canStartNewRound`（有生效担保合同才能再发起一轮）尤其要在外面算：它依赖列表一次取回的
 * `signingStatusMap`，在这里再查一次就是第二份口径，会与卡片上的入口判定打架。
 */
const props = defineProps<{
  breachCase: AdapayBreachCase | null
  /** 正在加载已存在的案件（首次打开弹窗时的短请求）。 */
  caseLoading: boolean
  /** 已结束的案件在填「新一轮」表单。 */
  newRound: boolean
  /** 申报表单提交中。 */
  reportLoading: boolean
  platformReviewLoading: boolean
  withdrawLoading: boolean
  withdrawConfirm: boolean
  decisionLoading: boolean
  /** 「不接受判定」的原因输入框是否展开（纯 UI 态）。 */
  rejectPanel: boolean
  /** 上一轮撤回人是不是本人（决定「重新发起」还是「提交解除合作申请」的措辞）。 */
  withdrawnByMe: boolean
  /** 有生效担保合同才能再发起一轮（结案会作废合同，见 BUG-038）。 */
  canStartNewRound: boolean
  /** 当前登录人是不是「非发起人」（只有他能在协商阶段表态）。 */
  canRespond: boolean
  /** 当前登录人能不能撤回自己提交的申请。 */
  canWithdraw: boolean
  /** AI 判定后我方（开发者）还没表态，才需要选接受 / 不接受。 */
  canDecide: boolean
}>()

const emit = defineEmits<{
  close: []
  submitReport: []
  submitPlatformReview: []
  openWithdrawConfirm: []
  cancelWithdrawConfirm: []
  submitWithdraw: []
  reopen: []
  openRejectPanel: []
  cancelRejectPanel: []
  submitDecision: [decision: AdapayBreachDecisionValue]
}>()

/** 开关走 `v-model:visible`：与视图里 `v-model:open` 的 TDialog 旧的关闭口径一致。 */
const visible = defineModel<boolean>('visible', { required: true })
/** 申报理由（表单里的「事实与依据」）。 */
const reason = defineModel<string>('reason', { required: true })
/** 表态说明 / 不接受判定的原因，两个输入框共用一份草稿。 */
const decisionNote = defineModel<string>('decisionNote', { required: true })

const dialogTitle = computed(() =>
  breachDialogTitle(props.breachCase, props.newRound, props.withdrawnByMe),
)
const submitLabel = computed(() =>
  breachSubmitLabel(props.breachCase, props.newRound, props.withdrawnByMe),
)
const roundHint = computed(() => breachRoundHint(props.breachCase, props.withdrawnByMe))
const negotiating = computed(() => isTerminationNegotiating(props.breachCase))
const canRequestReview = computed(() => canRequestPlatformReview(props.breachCase))
</script>

<template>
  <TDialog
    :open="visible"
    :title="dialogTitle"
    width="520px"
    class="dev-dialog"
    :mask-closable="false"
    :escape-closable="false"
    @update:open="(next) => !next && (visible = false)"
    @close="emit('close')"
  >
    <div class="delivery-dialog-body">
      <p class="unbind-dialog-tip">
        提交后案件进入「协商中」：双方先在案件内协商定金与尾款的退还额度，谈成即直接退款结案。
        协商不成再由任一方申请平台介入，平台核对合同、支付、交付与沟通记录，由审核智能体判定责任方，客服人工复核。
      </p>
      <p v-if="caseLoading" class="unbind-dialog-tip">正在加载解除合作案件…</p>
      <template v-else-if="breachCase && !newRound">
        <RequirementBreachCaseFacts :breach-case="breachCase" :withdrawn-by-me="withdrawnByMe" />
        <!-- 上一轮结案会把合同作废、需求退回大厅：这时没有生效合同可依，按钮不给，
             但必须把「为什么不能再发起、要做什么」写清楚（BUG-038）。 -->
        <p
          v-if="
            (breachCase.status === 'succeeded' || breachCase.status === 'rejected') &&
            !canStartNewRound
          "
          class="unbind-dialog-tip"
        >
          {{ roundHint }}
        </p>

        <!-- 协商阶段：对方同意即无责退出，不同意才申请平台介入。 -->
        <template v-if="negotiating">
          <p class="unbind-dialog-tip">
            先协商：对方同意即按协商一致处理——无责退出，定金全额原路退还需求方、无违约金、不产生赔付。
            对方不同意或超时未回应，任一方可申请平台介入。
          </p>
          <TInput
            v-if="canRespond"
            show-count
            v-model="decisionNote"
            type="textarea"
            :rows="3"
            :maxlength="1000"
            placeholder="可选：说明你同意或不同意的立场，双方与客服都会看到"
          />
          <p v-else class="unbind-dialog-tip">已提交申请，等待对方回应。</p>
        </template>
        <p v-else-if="breachCase.mutualAgreedAt" class="unbind-dialog-line">
          协商结果：双方协商一致（无责退出），{{ formatCnDateTime(breachCase.mutualAgreedAt) }}
        </p>
        <p v-else-if="breachCase.mutualRejectedAt" class="unbind-dialog-line">
          协商结果：对方不同意解除合作（{{
            formatCnDateTime(breachCase.mutualRejectedAt)
          }}），任一方可申请平台介入
        </p>

        <div v-if="canDecide" class="breach-decision">
          <p class="unbind-dialog-line">
            请选择是否接受 AI
            判定：双方都接受后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。
          </p>
          <TInput
            show-count
            v-if="rejectPanel"
            v-model="decisionNote"
            type="textarea"
            :rows="3"
            :maxlength="1000"
            placeholder="可选：说明不接受该判定的理由，便于客服人工复核"
          />
          <div class="breach-decision__actions">
            <template v-if="rejectPanel">
              <TButton :disabled="decisionLoading" @click="emit('cancelRejectPanel')">取消</TButton>
              <TButton
                variant="solid"
                tone="danger"
                :loading="decisionLoading"
                @click="emit('submitDecision', 'rejected')"
                >确认不接受</TButton
              >
            </template>
            <template v-else>
              <TButton
                variant="outline"
                tone="danger"
                :disabled="decisionLoading"
                @click="emit('openRejectPanel')"
                >不接受</TButton
              >
              <TButton
                variant="solid"
                tone="accent"
                :loading="decisionLoading"
                @click="emit('submitDecision', 'accepted')"
                >接受判定</TButton
              >
            </template>
          </div>
        </div>
        <p
          v-else-if="
            !negotiating &&
            !breachCase.mutualAgreedAt &&
            !breachCase.mutualRejectedAt &&
            (breachCase.status === 'submitted' || breachCase.status === 'ai_reviewing')
          "
          class="unbind-dialog-tip"
        >
          平台按 AI 判定 + 客服人工审核认定责任方，判定完成后由双方各自选择是否接受。
        </p>

        <div v-if="withdrawConfirm" class="breach-decision">
          <p class="unbind-dialog-line">
            确认撤回本次解除合作申请？撤回后本次申请结束，如仍有争议可在同一需求上重新发起；撤回不会触发任何退款或赔付。
          </p>
          <div class="breach-decision__actions">
            <TButton :disabled="withdrawLoading" @click="emit('cancelWithdrawConfirm')"
              >再想想</TButton
            >
            <TButton
              variant="solid"
              tone="danger"
              :loading="withdrawLoading"
              @click="emit('submitWithdraw')"
              >确认撤回申请</TButton
            >
          </div>
        </div>
      </template>
      <TForm v-else label-position="top">
        <p v-if="newRound" class="unbind-dialog-tip">{{ roundHint }}</p>
        <TFormItem label="事实与依据" required>
          <TInput
            show-count
            v-model="reason"
            type="textarea"
            :rows="6"
            :maxlength="2000"
            placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实"
          />
        </TFormItem>
      </TForm>
    </div>
    <template #footer>
      <TButton
        :disabled="platformReviewLoading || reportLoading || decisionLoading || withdrawLoading"
        @click="emit('close')"
      >
        {{ breachCase && !newRound ? '关闭' : '取消' }}
      </TButton>
      <TButton
        variant="outline"
        tone="danger"
        v-if="canWithdraw && !withdrawConfirm"
        :disabled="platformReviewLoading || decisionLoading || withdrawLoading"
        @click="emit('openWithdrawConfirm')"
        >撤回申请</TButton
      >
      <TButton
        variant="solid"
        tone="accent"
        v-else-if="breachCase?.status === 'withdrawn' && !newRound"
        :disabled="platformReviewLoading || decisionLoading || withdrawLoading"
        @click="emit('reopen')"
        >{{ withdrawnByMe ? '重新发起' : '提交解除合作申请' }}</TButton
      >
      <TButton
        variant="solid"
        tone="accent"
        v-else-if="
          (breachCase?.status === 'rejected' || breachCase?.status === 'succeeded') &&
          !newRound &&
          canStartNewRound
        "
        :disabled="platformReviewLoading || decisionLoading || withdrawLoading"
        @click="emit('reopen')"
        >发起新的解除合作</TButton
      >
      <TButton
        variant="outline"
        tone="accent"
        v-if="canRequestReview"
        :loading="platformReviewLoading"
        @click="emit('submitPlatformReview')"
        >申请平台介入</TButton
      >
      <template v-if="canRespond">
        <TButton
          variant="outline"
          tone="danger"
          :loading="decisionLoading"
          :disabled="platformReviewLoading || withdrawLoading"
          @click="emit('submitDecision', 'rejected')"
          >不同意</TButton
        >
        <TButton
          variant="solid"
          tone="accent"
          :loading="decisionLoading"
          :disabled="platformReviewLoading || withdrawLoading"
          @click="emit('submitDecision', 'accepted')"
          >同意解除</TButton
        >
      </template>
      <TButton
        variant="solid"
        tone="accent"
        v-else-if="!breachCase || newRound"
        :loading="reportLoading"
        @click="emit('submitReport')"
      >
        {{ submitLabel }}
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped>
/* 解除合作案件弹窗的排版。类名沿用旧「解绑弹窗」时期的 `.unbind-dialog-*`：
   这几条是跨块的后代选择器（`.delivery-dialog-body .unbind-dialog-tip` 等），
   跟着弹窗一起搬进组件，`scoped` 之后不再与页面里其它弹窗互相命中。
   配色令牌靠 `.dev-dialog`（见 dev-base.css），弹窗 teleport 到 body 也认得到。 */
.delivery-dialog-body {
  display: grid;
  gap: 10px;
}

.unbind-dialog-tip {
  margin: 0;
  color: var(--dev-gold);
  font-size: 13px;
  line-height: 1.6;
}

.delivery-dialog-body .unbind-dialog-tip {
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--dev-gold) 28%, transparent);
  border-radius: var(--dev-radius-control);
  background: color-mix(in srgb, var(--dev-gold) 10%, transparent);
  font-size: 12px;
  line-height: 1.5;
}

.unbind-dialog-line {
  margin: 0;
  color: var(--dev-ink);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

/* 解除合作案件：双方表态（接受 / 不接受）区块 */
.breach-decision {
  display: grid;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--wb-accent-line);
  border-radius: var(--dev-radius-control);
  background: var(--wb-accent-soft);
}

.breach-decision .unbind-dialog-line {
  font-size: 12px;
  line-height: 1.5;
}

.breach-decision__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
</style>
