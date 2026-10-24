<script setup lang="ts">
import type { AfterSalesRespondAction } from '@/api/afterSales'
import AfterSalesCaseFacts from '@/components/aftersales/AfterSalesCaseFacts.vue'
import { useAfterSalesCase } from '@/composables/useAfterSalesCase'

/**
 * 结单后的「解除合作 / 售后」弹窗。
 *
 * 三种画面，各自由契约字段决定：在办案件（`open`）看事实与表态、已收口案件只说一句上次的结果、
 * 没有在办案件就出立案表单。金额一律「元进分出」：输入框收元，接口只收 `claim_amount_fen`。
 */
const props = defineProps<{
  visible: boolean
  token: string | null
  currentUsername: string
  requirementId: string
  requirementTitle: string
  canOpenCase: boolean
}>()

const emit = defineEmits<{ close: [] }>()
const caseState = useAfterSalesCase(props, () => emit('close'))
const {
  description,
  claimAmount,
  submitting,
  casesLoading,
  caseDetail,
  respondingCaseNo,
  withdrawingCaseNo,
  openCase,
  lastClosedCase,
  canRespond,
  canWithdraw,
  busy,
  submit,
  respond,
  withdraw,
  close,
} = caseState

function respondCurrentCase(action: AfterSalesRespondAction) {
  if (openCase.value) void respond(openCase.value, action)
}
</script>

<template>
  <div v-if="visible" class="modal-wrap" @click.self="close">
    <section class="pay-modal after-sales-modal" aria-label="解除合作弹窗">
      <h3>解除合作</h3>
      <p class="after-sales-modal__subject">
        <strong>{{ requirementTitle }}</strong>
        <span>{{ requirementId }}</span>
      </p>

      <p v-if="casesLoading" class="after-sales-modal__empty">正在加载解除合作案件…</p>

      <template v-else-if="openCase">
        <AfterSalesCaseFacts v-if="caseDetail" :record="caseDetail" />
        <dl v-else class="after-sales-modal__facts">
          <div>
            <dt>案件编号</dt>
            <dd>{{ openCase.case_no }}</dd>
          </div>
          <div>
            <dt>案件类型</dt>
            <dd>{{ openCase.kind_label }}</dd>
          </div>
          <div>
            <dt>当前状态</dt>
            <dd>{{ openCase.status_label }}</dd>
          </div>
        </dl>
        <div class="actions">
          <template v-if="canRespond">
            <button
              class="ghost primary"
              type="button"
              :disabled="busy"
              @click="respondCurrentCase('approve')"
            >
              同意解除
            </button>
            <button
              class="ghost"
              type="button"
              :disabled="busy"
              @click="respondCurrentCase('reject')"
            >
              不同意，转平台裁决
            </button>
          </template>
          <button
            v-if="canWithdraw"
            class="ghost"
            type="button"
            :disabled="busy"
            @click="openCase && withdraw(openCase)"
          >
            {{ withdrawingCaseNo ? '撤回中...' : '撤回申请' }}
          </button>
        </div>
        <p v-if="!canRespond && !canWithdraw && openCase.open" class="tip">
          当前进展：{{ openCase.status_label }}。案件的后续处置由平台完成。
        </p>
      </template>

      <template v-else>
        <p v-if="lastClosedCase" class="tip">
          最近案件 {{ lastClosedCase.case_no }}：{{ lastClosedCase.status_label }}。
        </p>
        <template v-if="canOpenCase">
          <label class="pay-line after-sales-modal__field">
            <strong>主张金额（元，可留空）</strong>
            <input v-model="claimAmount" type="number" min="0" step="0.01" inputmode="decimal" />
          </label>
          <label class="pay-line after-sales-modal__field">
            <strong>诉求说明</strong>
            <textarea v-model="description" rows="5" maxlength="2000"></textarea>
          </label>
        </template>
        <p v-else class="tip">当前没有待表态的案件。</p>
      </template>

      <div class="actions">
        <button class="ghost" type="button" :disabled="busy" @click="close">关闭</button>
        <button
          v-if="canOpenCase && !openCase && !casesLoading"
          class="ghost primary"
          type="button"
          :disabled="submitting || respondingCaseNo !== null"
          @click="submit"
        >
          {{ submitting ? '提交中...' : '提交解除合作申请' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped src="./after-sales-modal.css"></style>
