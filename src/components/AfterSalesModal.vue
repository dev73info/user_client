<script setup lang="ts">
import type { AfterSalesRespondAction } from '@/api/afterSales'
import AfterSalesCaseFacts from '@/components/aftersales/AfterSalesCaseFacts.vue'
import { useAfterSalesCase } from '@/composables/useAfterSalesCase'
import { TButton, TDialog } from 'ui_73info'

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
  <TDialog
    :open="visible"
    title="解除合作"
    width="760px"
    class="after-sales-dialog"
    :mask-closable="!busy"
    @update:open="(next) => !next && close()"
  >
    <section class="after-sales-panel" aria-label="解除合作弹窗">
      <div class="after-sales-panel__body">
        <div class="after-sales-panel__main">
          <p class="after-sales-panel__subject">
            <strong>{{ requirementTitle }}</strong>
            <span>{{ requirementId }}</span>
          </p>

          <p v-if="casesLoading" class="after-sales-panel__hint">正在加载解除合作案件…</p>

          <template v-else-if="openCase">
            <AfterSalesCaseFacts v-if="caseDetail" :record="caseDetail" />
            <dl v-else class="after-sales-panel__facts">
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
            <p v-if="!canRespond && !canWithdraw && openCase.open" class="after-sales-panel__tip">
              当前进展：{{ openCase.status_label }}。案件的后续处置由平台完成。
            </p>
          </template>

          <template v-else>
            <p v-if="lastClosedCase" class="after-sales-panel__tip">
              最近案件 {{ lastClosedCase.case_no }}：{{ lastClosedCase.status_label }}。
            </p>
            <template v-if="canOpenCase">
              <label class="after-sales-panel__field">
                <span class="after-sales-panel__label">主张金额（元，可留空）</span>
                <input
                  v-model="claimAmount"
                  class="after-sales-panel__input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  placeholder="0.00"
                />
              </label>
              <label class="after-sales-panel__field">
                <span class="after-sales-panel__label">诉求说明 <i>*</i></span>
                <textarea
                  v-model="description"
                  class="after-sales-panel__textarea"
                  rows="8"
                  maxlength="2000"
                  placeholder="请填写交付情况、争议事实与希望平台核查的依据"
                ></textarea>
              </label>
            </template>
            <p v-else class="after-sales-panel__tip">当前没有待表态的案件。</p>
          </template>
        </div>

        <aside class="after-sales-panel__summary">
          <span class="after-sales-panel__summary-title">案件概览</span>
          <dl class="after-sales-panel__meta">
            <div>
              <dt>需求编号</dt>
              <dd>{{ requirementId }}</dd>
            </div>
            <template v-if="openCase">
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
            </template>
            <div v-else>
              <dt>当前状态</dt>
              <dd>{{ lastClosedCase ? '可重新发起' : '尚未立案' }}</dd>
            </div>
          </dl>

          <p class="after-sales-panel__rule">
            {{
              openCase
                ? '协商解除由双方表态推进：同意即按协商一致处理；不同意则由平台核对合同、支付与交付记录后裁决。'
                : '提交后立一个「协商解除」案件：对方同意即按协商一致处理；不同意或长时间不回应，由平台核对合同、支付与交付记录后裁决。'
            }}
          </p>

          <div class="after-sales-panel__actions">
            <TButton variant="outline" type="button" :disabled="busy" @click="close">关闭</TButton>
            <template v-if="openCase">
              <TButton
                v-if="canWithdraw"
                variant="outline"
                tone="danger"
                type="button"
                :loading="withdrawingCaseNo !== null"
                :disabled="busy"
                @click="openCase && withdraw(openCase)"
              >
                撤回申请
              </TButton>
              <template v-if="canRespond">
                <TButton
                  variant="outline"
                  tone="danger"
                  type="button"
                  :disabled="busy"
                  @click="respondCurrentCase('reject')"
                >
                  不同意，转平台裁决
                </TButton>
                <TButton
                  variant="solid"
                  tone="accent"
                  type="button"
                  :loading="respondingCaseNo !== null"
                  :disabled="busy"
                  @click="respondCurrentCase('approve')"
                >
                  同意解除
                </TButton>
              </template>
            </template>
            <TButton
              v-if="canOpenCase && !openCase && !casesLoading"
              variant="solid"
              tone="accent"
              type="button"
              :loading="submitting"
              :disabled="submitting || respondingCaseNo !== null"
              @click="submit"
            >
              提交解除合作申请
            </TButton>
          </div>
        </aside>
      </div>
    </section>
  </TDialog>
</template>

<style scoped src="./after-sales-modal.css"></style>
