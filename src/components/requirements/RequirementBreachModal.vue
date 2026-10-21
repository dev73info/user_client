<script setup lang="ts">
import { computed } from 'vue'

import type { AdapayBreachCase, AdapayBreachDecisionValue } from '@/api/adapay'
import type { RequirementItem } from '@/api/requirements'
import { breachStatusLabel } from '@/shared/breachStatus'
import {
  breachDecisionText,
  breachDialogTitle,
  breachLiablePartyLabel,
  breachRoundHint,
  breachSubmitLabel,
  breachVerdictSourceText,
  canDecideBreachCase,
  canRequestPlatformReview,
  isTerminationNegotiating,
  showBreachDecisions,
} from '@/shared/requirementBreach'
import { formatCnDateTime } from '@/shared/requirementDisplay'

/**
 * 「解除合作」弹窗：案件进展、协商表态、AI 判定表态、撤回与重新申报。
 *
 * 这里只渲染、只 emit——案件加载 / 申报 / 撤回 / 表态的请求与 toast 在
 * `useRequirementBreach`，「去完成收款银行卡」的跳转留在视图（组件不碰 router）。
 * 「是不是我」这类判定由视图算成布尔传进来，组件不自己去 store 取当前登录人。
 */
const props = defineProps<{
  breachVisible: boolean
  breachRequirement: RequirementItem | null
  breachCase: AdapayBreachCase | null
  /** 正在加载已存在的案件（首次打开弹窗时的短请求）。 */
  breachCaseLoading: boolean
  /** 申报表单提交中。 */
  breachLoading: boolean
  /** 已结束的案件在填「新一轮」表单。 */
  breachNewRound: boolean
  /** 上一轮撤回人是不是本人（决定「重新发起」还是「提交解除合作申请」的措辞）。 */
  breachWithdrawnByMe: boolean
  /** 有生效担保合同才能再发起一轮（结案会作废合同，见 BUG-038）。 */
  breachCanStartNewRound: boolean
  /** 当前登录人是不是「非发起人」（只有他能在协商阶段表态）。 */
  breachCanRespond: boolean
  /** 当前登录人能不能撤回自己提交的申请。 */
  breachCanWithdraw: boolean
  platformReviewLoading: boolean
  breachWithdrawLoading: boolean
  breachWithdrawConfirm: boolean
  breachDecisionLoading: boolean
  breachRejectPanel: boolean
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
  /** 中间态：赔付要打给本人，但收款结算账户没就绪——跳账号中心绑卡（路由在视图里）。 */
  bindSettlement: []
}>()

/** 申报理由（表单里的「事实与依据」）。 */
const breachReason = defineModel<string>('breachReason', { required: true })
/** 表态说明 / 不接受判定的原因，两个输入框共用一份草稿。 */
const breachDecisionNote = defineModel<string>('breachDecisionNote', { required: true })

const dialogTitle = computed(() =>
  breachDialogTitle(props.breachCase, props.breachNewRound, props.breachWithdrawnByMe),
)
const submitLabel = computed(() =>
  breachSubmitLabel(props.breachCase, props.breachNewRound, props.breachWithdrawnByMe),
)
const roundHint = computed(() => breachRoundHint(props.breachCase, props.breachWithdrawnByMe))
</script>

<template>
  <div v-if="breachVisible && breachRequirement" class="modal-wrap" @click.self="emit('close')">
    <section class="pay-modal breach-modal" aria-label="解除合作弹窗">
      <h3>{{ dialogTitle }}</h3>
      <p class="pay-line"><strong>需求标题：</strong>{{ breachRequirement.title }}</p>
      <p class="pay-line"><strong>需求编号：</strong>{{ breachRequirement.requirement_id }}</p>
      <p v-if="breachCaseLoading" class="pay-line">正在加载解除合作案件…</p>
      <template v-else-if="breachCase && !breachNewRound">
        <p class="pay-line"><strong>案件编号：</strong>{{ breachCase.caseNo }}</p>
        <p class="pay-line">
          <strong>当前状态：</strong>{{ breachStatusLabel(breachCase.status) }}
        </p>
        <p v-if="breachCase.status === 'withdrawn'" class="pay-line">
          <strong>申请人：</strong>{{ breachWithdrawnByMe ? '我方' : '对方' }}
        </p>
        <p v-if="breachCase.status === 'withdrawn' && breachCase.resolvedAt" class="pay-line">
          <strong>撤回时间：</strong>{{ formatCnDateTime(breachCase.resolvedAt) }}
        </p>
        <p v-if="breachCase.liableParty" class="pay-line">
          <strong>责任认定：</strong>{{ breachLiablePartyLabel(breachCase.liableParty) }}
        </p>
        <p class="pay-line"><strong>申请理由：</strong>{{ breachCase.reason }}</p>
        <template v-if="breachCase.aiJudgedAt || breachCase.aiReasoning">
          <p class="pay-line">
            <strong>AI 判定：</strong
            >{{
              breachCase.aiLiableParty
                ? breachLiablePartyLabel(breachCase.aiLiableParty)
                : '无法判定，已转客服人工判定'
            }}
          </p>
          <p v-if="breachCase.aiJudgedAt" class="pay-line">
            <strong>判定时间：</strong>{{ formatCnDateTime(breachCase.aiJudgedAt) }}
          </p>
          <p v-if="breachCase.aiReasoning" class="pay-line">
            <strong>判定理由：</strong>{{ breachCase.aiReasoning }}
          </p>
        </template>
        <p v-if="breachCase.decisionDeadlineAt" class="pay-line">
          <strong>表态截止：</strong>{{ formatCnDateTime(breachCase.decisionDeadlineAt) }}
        </p>
        <template v-if="showBreachDecisions(breachCase)">
          <p class="pay-line">
            <strong>我方表态：</strong>{{ breachDecisionText(breachCase.customerDecision) }}
          </p>
          <p class="pay-line">
            <strong>对方表态：</strong>{{ breachDecisionText(breachCase.developerDecision) }}
          </p>
        </template>
        <p class="pay-line">
          <strong>资金处理：</strong>定金 ¥{{ breachCase.depositAmountCny }} · 已退尾款 ¥{{
            breachCase.refundAmountCny
          }}
          · 赔付 ¥{{ breachCase.compensationAmountCny
          }}<template v-if="breachCase.extraCompensationFen > 0">
            · 额外赔偿 ¥{{ breachCase.extraCompensationCny }}</template
          >
        </p>
        <p v-if="breachCase.verdictSource" class="pay-line">
          <strong>判定来源：</strong>{{ breachVerdictSourceText(breachCase.verdictSource) }}
        </p>
        <p v-if="breachCase.resolutionNote" class="pay-line">
          <strong>处理说明：</strong>{{ breachCase.resolutionNote }}
        </p>

        <!-- 中间态：赔付要打给需求方（本人），但收款结算账户还没就绪，钱落不下来。
             案件不转人工，等绑卡完成后平台自动按现有认定续做——所以这里给一个绑卡入口。 -->
        <template v-if="breachCase.status === 'awaiting_payer_settlement'">
          <p class="tip">
            赔付要打进你的渠道收款账户，但该账户还没就绪（未开通或未绑定收款银行卡），这笔钱暂时落不下来。
            案件已停在「等待需求方补收款账户」，<strong>不转人工</strong>；绑卡成功后平台会自动按现有认定
            续做赔付与退款，到账后可在账号中心提现。
          </p>
          <div class="actions">
            <button class="ghost primary" type="button" @click="emit('bindSettlement')">
              去完成收款银行卡
            </button>
          </div>
        </template>

        <!-- 协商阶段：对方同意即无责退出，不同意才申请平台介入。 -->
        <template v-if="isTerminationNegotiating(breachCase)">
          <p class="tip">
            先协商：对方同意即按协商一致处理——无责退出，定金全额原路退还需求方、无违约金、不产生赔付。
            对方不同意或超时未回应，任一方可申请平台介入。
          </p>
          <label v-if="breachCanRespond" class="pay-line breach-modal__field">
            <strong>同意或不同意的说明</strong>
            <textarea
              v-model="breachDecisionNote"
              rows="3"
              maxlength="1000"
              placeholder="可选：说明你同意或不同意的立场，双方与客服都会看到"
            ></textarea>
          </label>
          <p v-else class="tip">已提交申请，等待对方回应。</p>
        </template>
        <p v-else-if="breachCase.mutualAgreedAt" class="pay-line">
          <strong>协商结果：</strong>双方协商一致（无责退出），{{
            formatCnDateTime(breachCase.mutualAgreedAt)
          }}
        </p>
        <p v-else-if="breachCase.mutualRejectedAt" class="pay-line">
          <strong>协商结果：</strong>对方不同意解除合作（{{
            formatCnDateTime(breachCase.mutualRejectedAt)
          }}），任一方可申请平台介入
        </p>

        <div v-if="canDecideBreachCase(breachCase)" class="breach-modal__decision">
          <p class="pay-line">
            <strong>是否接受：</strong>双方都接受 AI
            判定后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。
          </p>
          <label v-if="breachRejectPanel" class="pay-line breach-modal__field">
            <strong>不接受的原因</strong>
            <textarea
              v-model="breachDecisionNote"
              rows="3"
              maxlength="1000"
              placeholder="可选：说明不接受该判定的理由，便于客服人工复核"
            ></textarea>
          </label>
          <div class="actions">
            <template v-if="breachRejectPanel">
              <button
                class="ghost"
                type="button"
                :disabled="breachDecisionLoading"
                @click="emit('cancelRejectPanel')"
              >
                取消
              </button>
              <button
                class="ghost danger"
                type="button"
                :disabled="breachDecisionLoading"
                @click="emit('submitDecision', 'rejected')"
              >
                {{ breachDecisionLoading ? '提交中...' : '确认不接受' }}
              </button>
            </template>
            <template v-else>
              <button
                class="ghost danger-plain"
                type="button"
                :disabled="breachDecisionLoading"
                @click="emit('openRejectPanel')"
              >
                不接受
              </button>
              <button
                class="ghost primary"
                type="button"
                :disabled="breachDecisionLoading"
                @click="emit('submitDecision', 'accepted')"
              >
                {{ breachDecisionLoading ? '提交中...' : '接受判定' }}
              </button>
            </template>
          </div>
        </div>

        <p
          v-else-if="
            !isTerminationNegotiating(breachCase) &&
            !breachCase.mutualAgreedAt &&
            !breachCase.mutualRejectedAt &&
            (breachCase.status === 'submitted' || breachCase.status === 'ai_reviewing')
          "
          class="tip"
        >
          平台按 AI 判定 + 客服人工审核认定责任方，判定完成后由双方各自选择是否接受。
        </p>

        <div v-if="breachWithdrawConfirm" class="breach-modal__decision">
          <p class="pay-line">
            <strong>确认撤回：</strong
            >撤回后本次申请结束，如仍有争议可在同一需求上重新发起；撤回不会触发任何退款或赔付。
          </p>
          <div class="actions">
            <button
              class="ghost"
              type="button"
              :disabled="breachWithdrawLoading"
              @click="emit('cancelWithdrawConfirm')"
            >
              再想想
            </button>
            <button
              class="ghost danger"
              type="button"
              :disabled="breachWithdrawLoading"
              @click="emit('submitWithdraw')"
            >
              {{ breachWithdrawLoading ? '撤回中...' : '确认撤回申请' }}
            </button>
          </div>
        </div>

        <div class="actions">
          <button
            class="ghost"
            type="button"
            :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
            @click="emit('close')"
          >
            关闭
          </button>
          <button
            v-if="breachCanWithdraw && !breachWithdrawConfirm"
            class="ghost danger-plain"
            type="button"
            :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
            @click="emit('openWithdrawConfirm')"
          >
            撤回申请
          </button>
          <button
            v-if="breachCase.status === 'withdrawn'"
            class="ghost primary"
            type="button"
            :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
            @click="emit('reopen')"
          >
            {{ breachWithdrawnByMe ? '重新发起' : '提交解除合作申请' }}
          </button>
          <button
            v-else-if="
              (breachCase.status === 'rejected' || breachCase.status === 'succeeded') &&
              breachCanStartNewRound
            "
            class="ghost primary"
            type="button"
            :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
            @click="emit('reopen')"
          >
            发起新的解除合作
          </button>
          <button
            v-if="canRequestPlatformReview(breachCase)"
            class="ghost primary"
            type="button"
            :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
            @click="emit('submitPlatformReview')"
          >
            {{ platformReviewLoading ? '提交中...' : '申请平台介入' }}
          </button>
          <template v-if="breachCanRespond">
            <button
              class="ghost danger-plain"
              type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="emit('submitDecision', 'rejected')"
            >
              {{ breachDecisionLoading ? '提交中...' : '不同意' }}
            </button>
            <button
              class="ghost primary"
              type="button"
              :disabled="platformReviewLoading || breachDecisionLoading || breachWithdrawLoading"
              @click="emit('submitDecision', 'accepted')"
            >
              {{ breachDecisionLoading ? '提交中...' : '同意解除' }}
            </button>
          </template>
        </div>
        <!-- 上一轮结案会把合同作废、需求退回大厅：这时没有生效合同可依，按钮不给，
             但必须把「为什么不能再发起、要做什么」写清楚，不能让人对着一个结论干瞪眼（BUG-038）。 -->
        <p
          v-if="
            (breachCase.status === 'succeeded' || breachCase.status === 'rejected') &&
            !breachCanStartNewRound
          "
          class="tip"
        >
          {{ roundHint }}
        </p>
      </template>
      <template v-else>
        <p v-if="breachNewRound" class="tip">{{ roundHint }}</p>
        <label class="pay-line breach-modal__field">
          <strong>事实与依据</strong>
          <textarea
            v-model="breachReason"
            rows="6"
            maxlength="2000"
            placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实"
          ></textarea>
        </label>
        <p class="tip">
          提交后案件进入「协商中」：双方先在案件内协商定金与尾款的退还额度，谈成即直接退款结案；协商不成再由任一方申请平台介入，由审核智能体依据双方会话与材料判定责任方。
        </p>
        <div class="actions">
          <button class="ghost" type="button" :disabled="breachLoading" @click="emit('close')">
            取消
          </button>
          <button
            class="ghost primary"
            type="button"
            :disabled="breachLoading"
            @click="emit('submitReport')"
          >
            {{ breachLoading ? '提交中...' : submitLabel }}
          </button>
        </div>
      </template>
    </section>
  </div>
</template>
