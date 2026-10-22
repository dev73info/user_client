<script setup lang="ts">
import { ref } from 'vue'
import { TButton, TDialog } from 'ui_73info'

import type { AdapayBreachCase } from '@/api/adapay'
import { useConversationBreachActions } from '@/composables/useConversationBreachActions'
import { useConversationBreachFields } from '@/composables/useConversationBreachFields'
import { useAuthStore } from '@/stores/auth'
import { breachLiablePartyLabel } from '@/shared/requirementBreach'
import { breachStatusLabel } from '@/shared/breachStatus'
import { formatCnDateTime } from '@/shared/requirementDisplay'

/**
 * 解除合作弹窗：案件进展、双方表态、申报表单。
 *
 * 从 `RequirementConversationActions.vue` 的模板与脚本里整块搬出来。入口仍由工具条的 chip 给，
 * 开窗时请父组件重拉一次案件（缓存一份反而会显示上一轮的结果）；每次提交拿到的新案件通过
 * `case-changed` 交给父组件存放，`changed` 原样往上抛，父组件仍按原来的方式刷新整条工具条。
 */
const props = defineProps<{
  token: string
  requirementId: string
  /** 案件：父组件在 loadActions 里拉一次，这里只读。 */
  case: AdapayBreachCase | null
  isDeveloper: boolean
  requirementTitle?: string
  /** 合同是否已发起（结案后发起新一轮申报要求先有合同，与原来同一口径）。 */
  hasContract: boolean
}>()

const emit = defineEmits<{
  changed: []
  'case-changed': [value: AdapayBreachCase]
  /** 打开时请父组件重拉一次案件（与原来 openBreachDialog 里的 await 同一时机）。 */
  refresh: []
}>()

const auth = useAuthStore()
const breachVisible = ref(false)

const {
  activeBreachCase,
  settledBreachCase,
  withdrawnBreachCase,
  breachWithdrawnByMe,
  canDecideBreach,
  terminationNegotiating,
  canRespondTermination,
  canRequestPlatformReview,
  canWithdrawBreach,
  breachAwaitingPayerSettlement,
  breachDialogTitle,
  breachRoundHint,
} = useConversationBreachFields(() => ({
  case: props.case,
  isDeveloper: props.isDeveloper,
  currentUsername: auth.username,
}))

const {
  breachReason,
  breachDecisionNote,
  breachRejectPanel,
  breachSubmitting,
  breachActing,
  goBindSettlementAccount,
  resetForm,
  submitBreachReport,
  submitBreachDecision,
  submitPlatformReview,
  submitBreachWithdraw,
} = useConversationBreachActions(() => ({
  token: props.token,
  requirementId: props.requirementId,
  activeCase: activeBreachCase.value,
  onCaseChanged: (value) => emit('case-changed', value),
  onChanged: () => emit('changed'),
  onClosed: () => {
    breachVisible.value = false
  },
}))

/**
 * 打开解除合作弹窗：案件列表、诉求与双方表态都在弹窗内，由它自己在打开时拉取（`visible` 一变就刷新），
 * 这里不预加载——缓存一份反而会显示上一轮的结果。
 */
function openBreachDialog() {
  resetForm()
  breachVisible.value = true
  emit('refresh')
}

/** 工具条点「解除合作」时调它开窗。 */
defineExpose({ openBreachDialog })
</script>

<template>
  <TDialog v-model:open="breachVisible" :title="breachDialogTitle" width="560px">
    <p class="conversation-actions__meta">{{ requirementTitle }} · {{ requirementId }}</p>

    <template v-if="activeBreachCase">
      <p class="conversation-actions__line">
        <strong>案件编号：</strong>{{ activeBreachCase.caseNo }}
      </p>
      <p class="conversation-actions__line">
        <strong>当前状态：</strong>{{ breachStatusLabel(activeBreachCase.status) }}
      </p>
      <p v-if="activeBreachCase.liableParty" class="conversation-actions__line">
        <strong>责任认定：</strong>{{ breachLiablePartyLabel(activeBreachCase.liableParty) }}
      </p>
      <p class="conversation-actions__line">
        <strong>申请理由：</strong>{{ activeBreachCase.reason }}
      </p>
      <p
        v-if="activeBreachCase.aiJudgedAt || activeBreachCase.aiReasoning"
        class="conversation-actions__line"
      >
        <strong>AI 判定：</strong
        >{{
          activeBreachCase.aiLiableParty
            ? breachLiablePartyLabel(activeBreachCase.aiLiableParty)
            : '无法判定，已转客服人工判定'
        }}
      </p>
      <p v-if="activeBreachCase.aiReasoning" class="conversation-actions__line">
        <strong>判定理由：</strong>{{ activeBreachCase.aiReasoning }}
      </p>
      <p v-if="activeBreachCase.decisionDeadlineAt" class="conversation-actions__line">
        <strong>表态截止：</strong>{{ formatCnDateTime(activeBreachCase.decisionDeadlineAt) }}
      </p>
      <p class="conversation-actions__line">
        <strong>资金处理：</strong>定金 ¥{{ activeBreachCase.depositAmountCny }} · 已退尾款 ¥{{
          activeBreachCase.refundAmountCny
        }}
        · 赔付 ¥{{ activeBreachCase.compensationAmountCny }}
      </p>

      <!-- 协商阶段（解除合作的第一步）：对方同意即按协商一致无责退出，不同意才申请平台介入。
           这一步不预设走向，所以当事人看到的不是「协商还是追责」的选择，而是「同意 / 不同意」。 -->
      <template v-if="terminationNegotiating">
        <p class="conversation-actions__tip">
          先协商：对方同意即按协商一致处理——无责退出，定金全额原路退还需求方、无违约金、双方都不担责。
          协商一致**协商不出赔付**（赔付只有平台判责才有依据）；对方不同意或超时未回应，任一方可申请平台介入，
          由平台认定责任方后按责任执行。
        </p>
        <template v-if="canRespondTermination">
          <label class="conversation-actions__field">
            <span>同意或不同意的说明（可选）</span>
            <textarea
              v-model="breachDecisionNote"
              rows="3"
              maxlength="1000"
              placeholder="说明你的立场，双方与客服都会看到"
            ></textarea>
          </label>
        </template>
        <p v-else class="conversation-actions__tip">已提交申请，等待对方回应。</p>
      </template>
      <p v-else-if="activeBreachCase.mutualAgreedAt" class="conversation-actions__line">
        <strong>协商结果：</strong>双方协商一致（无责退出），{{
          formatCnDateTime(activeBreachCase.mutualAgreedAt)
        }}
      </p>
      <p v-else-if="activeBreachCase.mutualRejectedAt" class="conversation-actions__line">
        <strong>协商结果：</strong>对方不同意解除合作（{{
          formatCnDateTime(activeBreachCase.mutualRejectedAt)
        }}）， 任一方可申请平台介入
      </p>

      <template v-if="canDecideBreach">
        <p class="conversation-actions__tip">
          双方都接受 AI
          判定后平台才会执行退款／赔付；任一方不接受或逾期未全部表态，案件转客服人工判定。
        </p>
        <label v-if="breachRejectPanel" class="conversation-actions__field">
          <span>不接受的原因（可选）</span>
          <textarea
            v-model="breachDecisionNote"
            rows="3"
            maxlength="1000"
            placeholder="说明不接受该判定的理由，便于客服人工复核"
          ></textarea>
        </label>
      </template>
      <!-- 中间态：赔付要打给需求方，但需求方还没有收款结算账户，钱落不下来。案件不转人工，
           等需求方补账户后平台自动按原认定续做——所以这里给需求方一个绑卡入口。 -->
      <template v-else-if="breachAwaitingPayerSettlement">
        <p class="conversation-actions__tip">
          赔付要打进需求方的渠道收款账户，但该账户还没就绪（未开通或未绑定收款银行卡），
          这笔钱暂时落不下来。案件已停在「等待需求方补收款账户」，<strong>不转人工</strong>。
        </p>
        <p v-if="isDeveloper" class="conversation-actions__tip">
          等待需求方完成收款银行卡绑定后，平台会自动续做赔付与退款，无需再申请平台介入。
        </p>
        <template v-else>
          <p class="conversation-actions__tip">
            请先在账号中心完成收款银行卡绑定；绑定成功后平台会自动按现有认定续做赔付与退款，
            钱会直接进入你的渠道账户，可在账号中心提现。
          </p>
          <TButton variant="solid" tone="accent" @click="goBindSettlementAccount">
            去完成收款银行卡
          </TButton>
        </template>
      </template>
      <p
        v-else-if="
          activeBreachCase.status === 'submitted' || activeBreachCase.status === 'ai_reviewing'
        "
        class="conversation-actions__tip"
      >
        平台按 AI 判定 + 客服人工审核认定责任方，AI 判定完成后由双方各自选择是否接受；
        任一方不接受或逾期未全部表态，案件转客服人工判定。
      </p>
    </template>

    <template v-else>
      <template v-if="settledBreachCase">
        <p class="conversation-actions__line">
          <strong>上一轮案件编号：</strong>{{ settledBreachCase.caseNo }}
        </p>
        <p v-if="settledBreachCase.liableParty" class="conversation-actions__line">
          <strong>责任认定：</strong>{{ breachLiablePartyLabel(settledBreachCase.liableParty) }}
        </p>
        <p v-if="settledBreachCase.resolutionNote" class="conversation-actions__line">
          <strong>处理结论：</strong>{{ settledBreachCase.resolutionNote }}
        </p>
        <p class="conversation-actions__line">
          <strong>资金处理：</strong>定金 ¥{{ settledBreachCase.depositAmountCny }} · 已退尾款 ¥{{
            settledBreachCase.refundAmountCny
          }}
          · 赔付 ¥{{ settledBreachCase.compensationAmountCny }}
        </p>
        <p v-if="settledBreachCase.resolvedAt" class="conversation-actions__line">
          <strong>处理时间：</strong>{{ formatCnDateTime(settledBreachCase.resolvedAt) }}
        </p>
      </template>
      <template v-if="withdrawnBreachCase">
        <p class="conversation-actions__line">
          <strong>上一轮案件编号：</strong>{{ withdrawnBreachCase.caseNo }}
        </p>
        <p class="conversation-actions__line">
          <strong>上一轮申请人：</strong>{{ breachWithdrawnByMe ? '我方' : '对方' }}
        </p>
        <p class="conversation-actions__line">
          <strong>上一轮申请理由：</strong>{{ withdrawnBreachCase.reason }}
        </p>
        <p v-if="withdrawnBreachCase.resolvedAt" class="conversation-actions__line">
          <strong>撤回时间：</strong>{{ formatCnDateTime(withdrawnBreachCase.resolvedAt) }}
        </p>
      </template>
      <p v-if="breachRoundHint" class="conversation-actions__tip">{{ breachRoundHint }}</p>
      <label class="conversation-actions__field">
        <span>事实与依据</span>
        <textarea
          v-model="breachReason"
          rows="6"
          maxlength="2000"
          placeholder="请描述合作终止的事实、时间与相关证据说明"
        ></textarea>
      </label>
      <p class="conversation-actions__tip">
        提交后案件先进入**协商阶段**：对方同意即按协商一致处理（无责退出，定金全额原路退还需求方、
        无违约金）；对方不同意或超时未回应，任一方可申请平台介入，由平台核对合同、支付、交付与沟通
        记录判定责任方，客服人工复核后按结论执行退款／赔付并解除需求绑定。协商一致协商不出赔付
        （赔付只有判责才有依据）。恶意申报会影响账号信用。
      </p>
    </template>

    <template #footer>
      <TButton @click="breachVisible = false">关闭</TButton>
      <template v-if="activeBreachCase">
        <TButton v-if="canWithdrawBreach" :loading="breachActing" @click="submitBreachWithdraw">
          撤回申请
        </TButton>
        <TButton
          v-if="canRequestPlatformReview"
          :loading="breachActing"
          @click="submitPlatformReview"
        >
          申请平台介入
        </TButton>
        <template v-if="canRespondTermination">
          <TButton
            variant="outline"
            tone="danger"
            :loading="breachActing"
            @click="submitBreachDecision('rejected')"
          >
            不同意
          </TButton>
          <TButton
            variant="solid"
            tone="accent"
            :loading="breachActing"
            @click="submitBreachDecision('accepted')"
          >
            同意解除
          </TButton>
        </template>
        <template v-if="canDecideBreach">
          <template v-if="breachRejectPanel">
            <TButton :loading="breachActing" @click="breachRejectPanel = false">取消</TButton>
            <TButton
              variant="solid"
              tone="danger"
              :loading="breachActing"
              @click="submitBreachDecision('rejected')"
            >
              确认不接受
            </TButton>
          </template>
          <template v-else>
            <TButton
              variant="outline"
              tone="danger"
              :loading="breachActing"
              @click="breachRejectPanel = true"
            >
              不接受
            </TButton>
            <TButton
              variant="solid"
              tone="accent"
              :loading="breachActing"
              @click="submitBreachDecision('accepted')"
            >
              接受判定
            </TButton>
          </template>
        </template>
      </template>
      <TButton
        v-else
        variant="solid"
        tone="danger"
        :loading="breachSubmitting"
        :disabled="Boolean(settledBreachCase) && !hasContract"
        @click="submitBreachReport"
      >
        {{
          settledBreachCase
            ? '发起新一轮解除合作'
            : breachWithdrawnByMe
              ? '重新发起'
              : '提交解除合作申请'
        }}
      </TButton>
    </template>
  </TDialog>
</template>

<style scoped src="./conversation-breach-dialog.css"></style>
