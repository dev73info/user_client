<script setup lang="ts">
import { ref } from 'vue'
import { TButton, TDialog } from 'ui_73info'

import type { RequirementBreachCaseItem } from '@/api/afterSales'
import BreachCaseFacts from '@/components/aftersales/BreachCaseFacts.vue'
import { useConversationBreachActions } from '@/composables/useConversationBreachActions'
import { useConversationBreachFields } from '@/composables/useConversationBreachFields'
import { useAuthStore } from '@/stores/auth'

/**
 * 解除合作弹窗：案件进展、表态（同意 / 不同意）、撤回与申报。
 *
 * 从 `RequirementConversationActions.vue` 的模板与脚本里整块搬出来。入口仍由工具条的 chip 给，
 * 开窗时请父组件重拉一次案件（缓存一份反而会显示上一轮的结果）；每次提交成功后请父组件
 * 重取案件并刷新整条工具条——判据（轮到谁、能不能表态）都是后端算的，前端不留旧态。
 *
 * 契约里没有「申请平台介入」与「AI 判定表态」两段，这里既没有那枚按钮，也没有那段话术。
 */
const props = defineProps<{
  token: string
  requirementId: string
  /** 案件摘要（`has_case = false` 时父组件传 null）。 */
  case: RequirementBreachCaseItem | null
  requirementTitle?: string
  /** 合同是否已生效（结案后再发起一轮要求先有合同，与需求列表页同一口径）。 */
  hasContract: boolean
}>()

const emit = defineEmits<{
  changed: []
  /** 打开时与每次提交后请父组件重取案件。 */
  refresh: []
}>()

const auth = useAuthStore()
const breachVisible = ref(false)

const {
  activeBreachCase,
  settledBreachCase,
  withdrawnBreachCase,
  breachWithdrawnByMe,
  canRespondTermination,
  canWithdrawBreach,
  breachDialogTitle,
  breachRoundHint,
} = useConversationBreachFields(() => ({
  case: props.case,
  currentUsername: auth.username,
}))

const {
  breachReason,
  breachDecisionNote,
  breachSubmitting,
  breachActing,
  resetForm,
  submitBreachReport,
  submitBreachDecision,
  submitBreachWithdraw,
} = useConversationBreachActions(() => ({
  token: props.token,
  requirementId: props.requirementId,
  caseNo: activeBreachCase.value?.case_no ?? null,
  onRefreshed: () => emit('refresh'),
  onChanged: () => emit('changed'),
  onClosed: () => {
    breachVisible.value = false
  },
}))

/**
 * 打开解除合作弹窗：案件由父组件持有，这里请它重取一次——缓存一份反而会显示上一轮的结果。
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
      <BreachCaseFacts :record="activeBreachCase" />

      <template v-if="canRespondTermination">
        <p class="conversation-actions__tip">
          对方发起了「协商解除」：同意即按协商一致处理，不同意则由平台核对合同、支付与交付记录后裁决。
        </p>
        <label class="conversation-actions__field">
          <span>同意或不同意的说明（可选）</span>
          <textarea
            v-model="breachDecisionNote"
            rows="3"
            maxlength="1000"
            placeholder="说明你的立场，双方与平台都会看到"
          ></textarea>
        </label>
      </template>
      <p v-else class="conversation-actions__tip">
        当前进展：{{ activeBreachCase.turn_label }}。案件的后续处置由平台完成。
      </p>
    </template>

    <template v-else>
      <template v-if="settledBreachCase">
        <p class="conversation-actions__line">
          <strong>上一轮案件编号：</strong>{{ settledBreachCase.case_no }}
        </p>
        <p class="conversation-actions__line">
          <strong>上一轮状态：</strong>{{ settledBreachCase.status_label }}
        </p>
        <p class="conversation-actions__line">
          <strong>上一轮诉求金额：</strong>{{ settledBreachCase.claim_amount_cny }} 元
        </p>
        <p class="conversation-actions__line">
          <strong>立案时间：</strong>{{ settledBreachCase.opened_at }}
        </p>
      </template>
      <template v-if="withdrawnBreachCase">
        <p class="conversation-actions__line">
          <strong>上一轮案件编号：</strong>{{ withdrawnBreachCase.case_no }}
        </p>
        <p class="conversation-actions__line">
          <strong>上一轮立案人：</strong>{{ breachWithdrawnByMe ? '我方' : '对方' }}
        </p>
        <p class="conversation-actions__line">
          <strong>上一轮立案时间：</strong>{{ withdrawnBreachCase.opened_at }}
        </p>
      </template>
      <p v-if="breachRoundHint" class="conversation-actions__tip">{{ breachRoundHint }}</p>
      <label class="conversation-actions__field">
        <span>事实与依据</span>
        <textarea
          v-model="breachReason"
          rows="6"
          maxlength="2000"
          placeholder="请描述合作终止的事实、时间与相关证据说明（至少 5 个字）"
        ></textarea>
      </label>
      <p class="conversation-actions__tip">
        提交后立一个「协商解除」案件：对方同意即按协商一致处理；不同意或长时间不回应，由平台核对合同、
        支付与交付记录后裁决。恶意申报会影响账号信用。
      </p>
    </template>

    <template #footer>
      <TButton @click="breachVisible = false">关闭</TButton>
      <template v-if="activeBreachCase">
        <TButton v-if="canWithdrawBreach" :loading="breachActing" @click="submitBreachWithdraw">
          撤回申请
        </TButton>
        <template v-if="canRespondTermination">
          <TButton
            variant="outline"
            tone="danger"
            :loading="breachActing"
            @click="submitBreachDecision('reject')"
          >
            不同意
          </TButton>
          <TButton
            variant="solid"
            tone="accent"
            :loading="breachActing"
            @click="submitBreachDecision('approve')"
          >
            同意解除
          </TButton>
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
