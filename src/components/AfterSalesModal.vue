<script setup lang="ts">
/**
 * 解除合作弹窗（结单后的唯一业务入口）。
 *
 * 需求方与开发者共用，两侧看到的是**同一件事的两面**：
 *   - 需求方（甲方）发起诉求：只说**期望**——要一笔钱回来 / 要对方返工 / 两者都要 / 只反馈问题。
 *     钱从哪出（他自己付过的部分原路退，还是从开发者的接单保证金扣划赔付）由平台认定，他不用挑，
 *     也挑不了；
 *   - 开发者（乙方）只有「接受诉求」或「不接受，转平台裁决」两个动作（由调用方用 `canOpenCase`
 *     关掉发起表单）：资金出口只通向需求方，他自己立案没有能落地的诉求。
 * 解除合作只在**结单之后**开放，而结单的触发点就是尾款分账成功，所以退款面对的是「钱已分账出账」这个
 * 常态：渠道支持按原分账份额退款（退款对象 + `div_members`），退款照常原路退回；退不动（分账在途、
 * 渠道拒）时转人工，不会去动开发者的接单保证金。
 * 入口守卫里还包含解除合作窗口：窗口状态由服务端在案件列表响应里给出（`windowOpen`），
 * 窗口关闭后不再渲染发起表单，避免用户填完表单一律被后端 409 拒绝；前端不自己拿时间戳
 * 比大小，真正的判定仍在服务层。
 *
 * 拆分（R047）：数据与动作在 `useAfterSalesCase`，展示派生在 `useAfterSalesView`，纯文案与算式在
 * `shared/afterSalesView.ts`，三块事实表与动作区在 `components/aftersales/`。本组件只剩
 * 「哪一块该出现」的编排与发起表单本身。
 */
import type { AfterSalesRespondAction } from '@/api/afterSales'
import AfterSalesCaseActions from '@/components/aftersales/AfterSalesCaseActions.vue'
import AfterSalesCaseFacts from '@/components/aftersales/AfterSalesCaseFacts.vue'
import AfterSalesConcludedFacts from '@/components/aftersales/AfterSalesConcludedFacts.vue'
import { useAfterSalesCase } from '@/composables/useAfterSalesCase'
import { useAfterSalesView } from '@/composables/useAfterSalesView'

const props = defineProps<{
  visible: boolean
  token: string | null
  currentUsername: string
  requirementId: string
  requirementTitle: string
  /** 当前登录人是否是本需求的需求方（甲方）：只有甲方能发起解除合作。 */
  canOpenCase: boolean
  /**
   * 需求预算（元）：主张金额的上限。
   *
   * 预算就是这笔单子的价（合同总价由它快照），主张「拿回」的钱不该超过它——后端
   * `open_case` 会以 400 拒收超预算的主张，这里先把上限摆在输入框上，别让用户填完才被拒。
   * 拿不到（老接口/未加载完）时传 null，不限制，仍由后端兜底。
   */
  requirementBudget?: number | null
}>()

const emit = defineEmits<{ close: [] }>()

/** 数据与动作层：案件列表、窗口状态、发起 / 表态 / 撤回、表单字段与「有请求在途」。 */
const caseState = useAfterSalesCase(props, () => emit('close'))
const {
  expectsMoney,
  expectsRework,
  description,
  claimAmount,
  submitting,
  casesLoading,
  respondingId,
  withdrawingId,
  busy,
  submit,
  respond,
  withdraw,
  close,
} = caseState

/** 展示派生层：在办案件 / 上次收口的案件、窗口与入口守卫、各动作的可用性。 */
const {
  currentCase,
  lastConcludedCase,
  lastConcludedAt,
  statusTip,
  statusDetail,
  canSubmitCase,
  canRespond,
  canComplete,
  canReportUnfulfilled,
  canWithdraw,
  claimAmountField,
  concludedWithFunds,
  caseConcludedTip,
  windowClosed,
  windowClosedTip,
} = useAfterSalesView(props, caseState)

/** 动作区只管「点了什么」，具体打哪一条案件由这一层补上（在办案件为空时整块不渲染）。 */
function respondCurrentCase(action: AfterSalesRespondAction) {
  if (currentCase.value) {
    void respond(currentCase.value, action)
  }
}

function withdrawCurrentCase() {
  if (currentCase.value) {
    void withdraw(currentCase.value)
  }
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

      <template v-else-if="currentCase">
        <AfterSalesCaseFacts :record="currentCase" />

        <!-- 状态说明只留一句「现在到哪一步、要做什么」，分支细节收进折叠区，避免整段文字糊住按钮。 -->
        <p v-if="statusTip" class="tip">{{ statusTip }}</p>
        <p v-else-if="currentCase.status === 'manual_required'" class="tip">
          资金执行遇到问题，已转人工客服处理。客服会尽快跟进，进展会同步到需求会话里。
        </p>
        <details v-if="statusDetail" class="after-sales-modal__rules">
          <summary>点开看流程细节</summary>
          <p>{{ statusDetail }}</p>
        </details>

        <AfterSalesCaseActions
          :record="currentCase"
          :can-respond="canRespond"
          :can-complete="canComplete"
          :can-report-unfulfilled="canReportUnfulfilled"
          :can-withdraw="canWithdraw"
          :responding-id="respondingId"
          :withdrawing-id="withdrawingId"
          @respond="respondCurrentCase"
          @withdraw="withdrawCurrentCase"
        />
      </template>

      <template v-else>
        <!-- 上一次解除合作的结论：案件只有一条，收口后的这一条就是上次的结果，双方都看得到。
             解除合作不记录轮次，再次提交会复用同一条案件并覆盖上次的诉求，平台侧也查不到历史，
             因此这里只出这一条结论，不堆历史列表，否则每次解除合作都会堆成一条「历史解除合作案件」。
             「已撤回」不进这块：那是发起人自己收手，没有结论可摆。 -->
        <AfterSalesConcludedFacts
          v-if="lastConcludedCase"
          :record="lastConcludedCase"
          :concluded-at="lastConcludedAt"
        />

        <template v-if="canSubmitCase">
          <fieldset class="after-sales-modal__expectations">
            <legend>你想要什么（可多选）</legend>
            <label class="after-sales-modal__expectation">
              <input v-model="expectsMoney" type="checkbox" />
              <span>
                <strong>要一笔钱回来</strong>
                <small
                  >退多少、从哪儿退由平台认定：先退你自己付过的部分，不够再由平台从对方保证金里赔</small
                >
              </span>
            </label>
            <label class="after-sales-modal__expectation">
              <input v-model="expectsRework" type="checkbox" />
              <span>
                <strong>要求返工 / 补交付</strong>
                <small>可以与「要钱」同时选：先返工，做不到再按上面的金额处理</small>
              </span>
            </label>
            <p v-if="!expectsMoney && !expectsRework" class="tip">
              两个都不选就是只反馈问题：平台会记录在案，但不会有资金动作。
            </p>
          </fieldset>

          <label v-if="expectsMoney" class="pay-line after-sales-modal__field">
            <strong>{{ claimAmountField.label }}</strong>
            <input
              v-model="claimAmount"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              :max="requirementBudget ?? undefined"
              :placeholder="claimAmountField.placeholder"
            />
          </label>

          <label class="pay-line after-sales-modal__field">
            <strong>问题描述</strong>
            <textarea
              v-model="description"
              rows="5"
              maxlength="2000"
              placeholder="请写明时间、问题现象、与对方沟通的结果和你的诉求"
            ></textarea>
          </label>
        </template>

        <p v-else-if="canOpenCase && concludedWithFunds" class="tip">
          {{ caseConcludedTip }}
        </p>

        <p v-else-if="canOpenCase && windowClosed" class="tip">
          {{ windowClosedTip }}
        </p>

        <template v-else>
          <p class="tip">
            解除合作由需求方（甲方）发起，你这边只用于查看诉求并表态：接受即按诉求执行，不接受由平台裁决。
          </p>
          <details class="after-sales-modal__rules">
            <summary>点开看你能做什么</summary>
            <ul>
              <li>
                接受即按对方诉求执行：要钱的按主张金额执行 —— 先原路退还他付过的部分（结单后尾款
                已分账，渠道按原分账份额退回，所以通常等于从你的分账收入里扣回），不够的部分才从你
                仍冻结的接单保证金扣划赔付；要返工的你得真的把活补上，等他验收。
                不认可就走「不接受，转平台裁决」，由客服认定责任方与金额。
              </li>
              <li>
                需求方点了「确认已落实」即结案；返工类诉求若你认为已做到、对方却报「未落实」，案件会转客服裁决。
              </li>
              <li>结单后如需反映其它问题，请走工单中心联系平台。</li>
            </ul>
          </details>
          <!-- P23：乙方没有自助立案入口，这里把「该走哪条路」写成可点的出口，别只留一句话。 -->
          <p class="tip">
            你是乙方：结单后平台<strong>不开放</strong>自助立案（资金出口只通向需求方）。如遇对方拖欠、或需要平台介入，
            请到
            <router-link to="/workbench/tickets">工单中心</router-link> 提交工单，由客服跟进处理。
          </p>
        </template>
      </template>

      <div class="actions">
        <button class="ghost" type="button" :disabled="busy" @click="close">关闭</button>
        <button
          v-if="canSubmitCase && !currentCase && !casesLoading"
          class="ghost primary"
          type="button"
          :disabled="submitting"
          @click="submit"
        >
          {{ submitting ? '提交中...' : '提交解除合作申请' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped src="./after-sales-modal.css"></style>
