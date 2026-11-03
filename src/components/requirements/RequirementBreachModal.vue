<script setup lang="ts">
import { computed } from 'vue'

import type {
  AfterSalesCaseDetail,
  AfterSalesRespondAction,
  RequirementBreachCaseItem,
} from '@/api/afterSales'
import type { RequirementItem } from '@/api/requirements'
import BreachCaseFacts from '@/components/aftersales/BreachCaseFacts.vue'
import {
  breachDialogTitle,
  breachRoundHint,
  breachSubmitLabel,
  isBreachCaseSettled,
} from '@/shared/requirementBreach'
import { TButton, TDialog } from 'ui_73info'

/**
 * 「解除合作」弹窗（需求方侧）：案件进展、表态（同意 / 不同意）、撤回与重新申报。
 *
 * 这里只渲染、只 emit——案件读取 / 申报 / 撤回 / 表态的请求与 toast 在
 * `useRequirementBreach`，「去完成收款银行卡」的跳转留在视图（组件不碰 router）。
 * 「是不是我 / 能不能表态」这类判定由视图算成布尔传进来，组件不自己去 store 取当前登录人。
 *
 * 契约里没有「申请平台介入」与「AI 判定后接受 / 不接受」两段，这两个入口连同话术一起删了：
 * 转平台是客服在管理端的动作，当事人这边只剩「同意 / 不同意」与「撤回」。
 */
const props = defineProps<{
  breachVisible: boolean
  breachRequirement: RequirementItem | null
  breachCase: RequirementBreachCaseItem | null
  /** 案件详情（诉求说明 / 表态流水 / 裁决）：拿不到就只显示摘要。 */
  breachCaseDetail?: AfterSalesCaseDetail | null
  /** 正在加载已存在的案件（首次打开弹窗时的短请求）。 */
  breachCaseLoading: boolean
  /** 申报表单提交中。 */
  breachLoading: boolean
  /** 已收口的案件在填「新一轮」表单。 */
  breachNewRound: boolean
  /** 上一轮撤回人是不是本人（决定「重新发起」还是「提交解除合作申请」的措辞）。 */
  breachWithdrawnByMe: boolean
  /** 有生效担保合同才能再发起一轮（结案会作废合同，见 BUG-038）。 */
  breachCanStartNewRound: boolean
  /** 当前登录人是案件里的「对方当事人」，且还在表态窗口内。 */
  breachCanRespond: boolean
  /** 当前登录人是立案人，且还在撤回窗口内。 */
  breachCanWithdraw: boolean
  breachWithdrawLoading: boolean
  breachWithdrawConfirm: boolean
  breachDecisionLoading: boolean
}>()

const emit = defineEmits<{
  close: []
  submitReport: []
  openWithdrawConfirm: []
  cancelWithdrawConfirm: []
  submitWithdraw: []
  reopen: []
  submitDecision: [action: AfterSalesRespondAction]
}>()

/** 申报理由（表单里的「事实与依据」）。 */
const breachReason = defineModel<string>('breachReason', { required: true })
/** 表态说明（同意 / 不同意的理由），与申报表单一同走草稿，提交后由编排层清空。 */
const breachDecisionNote = defineModel<string>('breachDecisionNote', { required: true })

const dialogTitle = computed(() =>
  breachDialogTitle(props.breachCase, props.breachNewRound, props.breachWithdrawnByMe),
)
const submitLabel = computed(() =>
  breachSubmitLabel(props.breachCase, props.breachNewRound, props.breachWithdrawnByMe),
)
const roundHint = computed(() => breachRoundHint(props.breachCase, props.breachWithdrawnByMe))
const settled = computed(() => isBreachCaseSettled(props.breachCase))
const busy = computed(
  () => props.breachLoading || props.breachDecisionLoading || props.breachWithdrawLoading,
)
</script>

<template>
  <TDialog
    :open="breachVisible && Boolean(breachRequirement)"
    :title="dialogTitle"
    width="760px"
    class="breach-dialog"
    :mask-closable="!busy"
    @update:open="(next) => !next && emit('close')"
  >
    <section v-if="breachRequirement" class="breach-panel" aria-label="解除合作弹窗">
      <div class="breach-panel__body">
        <div class="breach-panel__main">
          <div class="breach-panel__requirement">
            <span class="breach-panel__requirement-title">{{ breachRequirement.title }}</span>
            <span class="breach-panel__requirement-no">{{ breachRequirement.requirement_id }}</span>
          </div>

          <p v-if="breachCaseLoading" class="breach-panel__hint">正在加载解除合作案件…</p>

          <template v-else-if="breachCase && !breachNewRound">
            <BreachCaseFacts :record="breachCase" :detail="breachCaseDetail" />

            <!-- 协商阶段：对方同意即按协商一致处理，不同意则转平台裁决。 -->
            <template v-if="breachCanRespond">
              <p class="breach-panel__tip">
                对方发起了「协商解除」。同意即按协商一致处理，不同意则由平台核对后裁决。
              </p>
              <label class="breach-panel__field">
                <span class="breach-panel__label">同意或不同意的说明（可选）</span>
                <textarea
                  v-model="breachDecisionNote"
                  class="breach-panel__textarea"
                  rows="3"
                  maxlength="1000"
                  placeholder="可选：说明你同意或不同意的立场，双方与平台都会看到"
                ></textarea>
              </label>
            </template>
            <p v-else-if="breachCase.is_open" class="breach-panel__tip">
              当前进展：{{ breachCase.turn_label }}。
            </p>

            <div v-if="breachWithdrawConfirm" class="breach-panel__confirm">
              <p class="breach-panel__confirm-text">
                撤回后本次申请结束，如仍有争议可在同一需求上重新发起；撤回不会触发任何退款或赔付。
              </p>
              <div class="breach-panel__confirm-actions">
                <TButton
                  variant="outline"
                  type="button"
                  :disabled="breachWithdrawLoading"
                  @click="emit('cancelWithdrawConfirm')"
                >
                  再想想
                </TButton>
                <TButton
                  variant="solid"
                  tone="danger"
                  type="button"
                  :loading="breachWithdrawLoading"
                  @click="emit('submitWithdraw')"
                >
                  确认撤回申请
                </TButton>
              </div>
            </div>

            <!-- 上一轮结案会把合同作废、需求退回大厅：这时没有生效合同可依，按钮不给，
                 但必须把「为什么不能再发起、要做什么」写清楚，不能让人对着一个结论干瞪眼（BUG-038）。 -->
            <p v-if="settled && !breachCanStartNewRound" class="breach-panel__tip">
              {{ roundHint }}
            </p>
          </template>

          <template v-else>
            <p v-if="breachNewRound" class="breach-panel__tip">{{ roundHint }}</p>
            <label class="breach-panel__field">
              <span class="breach-panel__label">事实与依据 <i>*</i></span>
              <textarea
                v-model="breachReason"
                class="breach-panel__textarea"
                rows="8"
                maxlength="2000"
                placeholder="请填写时间、已交付内容、沟通记录和希望平台核查的事实（至少 5 个字）"
              ></textarea>
            </label>
          </template>
        </div>

        <aside class="breach-panel__summary">
          <span class="breach-panel__summary-title">案件概览</span>
          <dl class="breach-panel__meta">
            <div>
              <dt>需求编号</dt>
              <dd>{{ breachRequirement.requirement_id }}</dd>
            </div>
            <div>
              <dt>案件类型</dt>
              <dd>{{ breachCase?.kind_label ?? '协商解除' }}</dd>
            </div>
            <div>
              <dt>当前状态</dt>
              <dd>{{ breachCase?.status_label ?? '尚未立案' }}</dd>
            </div>
            <div>
              <dt>当前流程</dt>
              <dd>{{ breachCase?.turn_label ?? '提交后进入协商' }}</dd>
            </div>
          </dl>

          <p class="breach-panel__rule">
            {{
              breachCase && !breachNewRound
                ? '协商阶段由对方表态：同意即按协商一致处理；不同意或长时间不回应，由平台核对合同、支付与交付记录后裁决。'
                : '提交后立一个「协商解除」案件：对方同意即按协商一致处理；不同意或长时间不回应，由平台核对合同、支付与交付记录后裁决。恶意申报会影响账号信用。'
            }}
          </p>

          <div class="breach-panel__actions">
            <TButton variant="outline" type="button" :disabled="busy" @click="emit('close')">
              {{ breachCase && !breachNewRound ? '关闭' : '取消' }}
            </TButton>
            <TButton
              v-if="breachCanWithdraw && !breachWithdrawConfirm && !breachNewRound"
              variant="outline"
              tone="danger"
              type="button"
              :disabled="busy"
              @click="emit('openWithdrawConfirm')"
            >
              撤回申请
            </TButton>
            <TButton
              v-if="breachCase?.status === 'withdrawn' && !breachNewRound"
              variant="solid"
              tone="accent"
              type="button"
              :disabled="busy"
              @click="emit('reopen')"
            >
              {{ breachWithdrawnByMe ? '重新发起' : '提交解除合作申请' }}
            </TButton>
            <TButton
              v-else-if="settled && breachCanStartNewRound && !breachNewRound"
              variant="solid"
              tone="accent"
              type="button"
              :disabled="busy"
              @click="emit('reopen')"
            >
              发起新的解除合作
            </TButton>
            <template v-if="breachCanRespond">
              <TButton
                variant="outline"
                tone="danger"
                type="button"
                :loading="breachDecisionLoading"
                :disabled="busy"
                @click="emit('submitDecision', 'reject')"
              >
                不同意
              </TButton>
              <TButton
                variant="solid"
                tone="accent"
                type="button"
                :loading="breachDecisionLoading"
                :disabled="busy"
                @click="emit('submitDecision', 'approve')"
              >
                同意解除
              </TButton>
            </template>
            <TButton
              v-else-if="!breachCase || breachNewRound"
              variant="solid"
              tone="accent"
              type="button"
              :loading="breachLoading"
              @click="emit('submitReport')"
            >
              {{ submitLabel }}
            </TButton>
          </div>
        </aside>
      </div>
    </section>
  </TDialog>
</template>

<style scoped src="./requirement-breach-modal.css"></style>
