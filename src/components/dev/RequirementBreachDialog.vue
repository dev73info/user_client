<script setup lang="ts">
import { computed } from 'vue'

import type {
  AfterSalesCaseDetail,
  AfterSalesRespondAction,
  RequirementBreachCaseItem,
} from '@/api/afterSales'
import BreachCaseFacts from '@/components/aftersales/BreachCaseFacts.vue'
import {
  breachDialogTitle,
  breachRoundHint,
  breachSubmitLabel,
  isBreachCaseSettled,
} from '@/shared/requirementBreach'
import { TButton, TDialog, TForm, TFormItem, TInput } from 'ui_73info'

/**
 * 开发者侧「解除合作」弹窗：案件进展、表态（同意 / 不同意）、撤回与重新申报。
 *
 * 这里只渲染、只 emit——案件读取 / 申报 / 撤回 / 表态的请求与 toast 在
 * `composables/useRequirementBreach`，视图把它的状态铺成 props、把它的动作接成 emits。
 * 「是不是我 / 能不能表态」这类判定由编排层算成布尔传进来，组件不自己去 store 取当前登录人。
 *
 * 契约里没有「申请平台介入」与「AI 判定后接受 / 不接受」两段：转平台由客服在管理端开闸，
 * 当事人这边只剩「同意 / 不同意」与「撤回」。所以这里既没有那枚按钮，也没有那段话术。
 *
 * `canStartNewRound`（有生效担保合同才能再发起一轮）尤其要在外面算：它依赖列表一次取回的
 * 签约状态，在这里再查一次就是第二份口径，会与卡片上的入口判定打架。
 */
const props = defineProps<{
  breachCase: RequirementBreachCaseItem | null
  /** 案件详情（诉求说明 / 表态流水 / 裁决）：拿不到就只显示摘要。 */
  breachCaseDetail?: AfterSalesCaseDetail | null
  /** 正在加载已存在的案件（首次打开弹窗时的短请求）。 */
  caseLoading: boolean
  /** 已收口的案件在填「新一轮」表单。 */
  newRound: boolean
  /** 申报表单提交中。 */
  reportLoading: boolean
  withdrawLoading: boolean
  withdrawConfirm: boolean
  decisionLoading: boolean
  /** 上一轮撤回人是不是本人（决定「重新发起」还是「提交解除合作申请」的措辞）。 */
  withdrawnByMe: boolean
  /** 有生效担保合同才能再发起一轮（结案会作废合同，见 BUG-038）。 */
  canStartNewRound: boolean
  /** 当前登录人是案件里的「对方当事人」，且还在表态窗口内。 */
  canRespond: boolean
  /** 当前登录人是立案人，且还在撤回窗口内。 */
  canWithdraw: boolean
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

/** 开关走 `v-model:visible`：与视图里 `v-model:open` 的 TDialog 旧的关闭口径一致。 */
const visible = defineModel<boolean>('visible', { required: true })
/** 申报理由（表单里的「事实与依据」）。 */
const reason = defineModel<string>('reason', { required: true })
/** 表态说明，与申报表单一同走草稿，提交后由编排层清空。 */
const decisionNote = defineModel<string>('decisionNote', { required: true })

const dialogTitle = computed(() =>
  breachDialogTitle(props.breachCase, props.newRound, props.withdrawnByMe),
)
const submitLabel = computed(() =>
  breachSubmitLabel(props.breachCase, props.newRound, props.withdrawnByMe),
)
const roundHint = computed(() => breachRoundHint(props.breachCase, props.withdrawnByMe))
const settled = computed(() => isBreachCaseSettled(props.breachCase))
const busy = computed(() => props.reportLoading || props.decisionLoading || props.withdrawLoading)
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
        解除合作由当事人发起：先立一个「协商解除」案件，对方在案件里表态——同意即按协商一致处理，
        不同意或长时间不回应时由平台介入核对合同、支付与交付记录后裁决。
      </p>
      <p v-if="caseLoading" class="unbind-dialog-tip">正在加载解除合作案件…</p>
      <template v-else-if="breachCase && !newRound">
        <BreachCaseFacts :record="breachCase" :detail="breachCaseDetail" />

        <!-- 上一轮结案会把合同作废、需求退回大厅：这时没有生效合同可依，按钮不给，
             但必须把「为什么不能再发起、要做什么」写清楚（BUG-038）。 -->
        <p v-if="settled && !canStartNewRound" class="unbind-dialog-tip">{{ roundHint }}</p>

        <template v-if="canRespond">
          <TInput
            show-count
            v-model="decisionNote"
            type="textarea"
            :rows="3"
            :maxlength="1000"
            placeholder="可选：说明你同意或不同意的立场，双方与平台都会看到"
          />
        </template>
        <p v-else-if="breachCase.is_open" class="unbind-dialog-tip">
          当前进展：{{ breachCase.turn_label }}。
        </p>

        <div v-if="withdrawConfirm" class="breach-decision">
          <p class="unbind-dialog-line">
            确认撤回本次解除合作申请？撤回后本次申请结束，如仍有争议可在同一需求上重新发起；
            撤回不会触发任何退款或赔付。
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
      <TButton :disabled="busy" @click="emit('close')">
        {{ breachCase && !newRound ? '关闭' : '取消' }}
      </TButton>
      <TButton
        variant="outline"
        tone="danger"
        v-if="canWithdraw && !withdrawConfirm"
        :disabled="busy"
        @click="emit('openWithdrawConfirm')"
        >撤回申请</TButton
      >
      <TButton
        variant="solid"
        tone="accent"
        v-else-if="breachCase?.status === 'withdrawn' && !newRound"
        :disabled="busy"
        @click="emit('reopen')"
        >{{ withdrawnByMe ? '重新发起' : '提交解除合作申请' }}</TButton
      >
      <TButton
        variant="solid"
        tone="accent"
        v-else-if="settled && !newRound && canStartNewRound"
        :disabled="busy"
        @click="emit('reopen')"
        >发起新的解除合作</TButton
      >
      <template v-if="canRespond">
        <TButton
          variant="outline"
          tone="danger"
          :loading="decisionLoading"
          :disabled="withdrawLoading"
          @click="emit('submitDecision', 'reject')"
          >不同意</TButton
        >
        <TButton
          variant="solid"
          tone="accent"
          :loading="decisionLoading"
          :disabled="withdrawLoading"
          @click="emit('submitDecision', 'approve')"
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

/* 解除合作案件：撤回二次确认区块 */
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
