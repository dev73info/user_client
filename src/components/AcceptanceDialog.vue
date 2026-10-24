<script setup lang="ts">
/**
 * 验收弹窗（担保模式）：需求方在「开发中」与「待付尾款」两个阶段都能提交验收结论。
 *
 * 需求详情抽屉与会话工具条共用这一份表单。两处入口的可见条件、提交接口与通过后的后续动作
 * 必须完全一致，否则很容易出现「会话里给了按钮、后端却一定拒绝」这种只能报错的入口。
 */
import { ref, watch } from 'vue'

import type { AdapayAcceptanceResult } from '@/api/adapay'
import {
  listRequirementAcceptances,
  submitRequirementAcceptance,
  type RequirementAcceptanceHistoryItem,
} from '@/api/requirements'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { TMessage } from 'ui_73info'

const props = defineProps<{
  visible: boolean
  token: string | null
  requirementId: string
  requirementTitle: string
}>()

const emit = defineEmits<{
  close: []
  /** 已提交一条验收留档（通过 / 不通过都会触发），调用方据此刷新需求状态。 */
  submitted: [result: AdapayAcceptanceResult]
}>()

const result = ref<AdapayAcceptanceResult>('passed')
const note = ref('')
const submitting = ref(false)
const records = ref<RequirementAcceptanceHistoryItem[]>([])
const recordsLoading = ref(false)

/** 每次打开都回到「验收通过 + 空说明」，并重新拉一遍历史留档。 */
watch(
  () => props.visible,
  (open) => {
    if (!open) {
      return
    }
    result.value = 'passed'
    note.value = ''
    records.value = []
    void loadRecords()
  },
)

async function loadRecords() {
  if (!props.token || !props.requirementId) {
    return
  }

  recordsLoading.value = true
  try {
    // 契约 AcceptanceListResponse 的 history：每次验收的历史（含打回），按时间倒序。
    const list = await listRequirementAcceptances(props.token, props.requirementId)
    records.value = list.history ?? []
  } catch (error) {
    // 历史留档只是辅助信息，取不到不挡本次验收。
    TMessage.error(error instanceof Error ? error.message : '加载验收记录失败')
  } finally {
    recordsLoading.value = false
  }
}

function requestClose() {
  if (!submitting.value) {
    emit('close')
  }
}

async function submit() {
  if (!props.token || !props.requirementId) {
    return
  }
  // 不通过必须写明原因（后端同样要求），否则开发者不知道该整改什么。
  if (result.value === 'rejected' && !note.value.trim()) {
    TMessage.warning('验收不通过时请写明需要整改的问题')
    return
  }

  submitting.value = true
  try {
    const outcome = await submitRequirementAcceptance(
      props.token,
      props.requirementId,
      result.value,
      note.value.trim(),
    )
    const rejected = result.value === 'rejected'
    // 打回成功的响应里带整改截止时间；详情响应里暂时还没有这个字段（后端在补），
    // 所以只在这一次提示里展示「整改截止」，刷新后不显示倒计时。
    const dueAt = outcome.remediation_due_at ? formatCnDateTime(outcome.remediation_due_at) : ''
    TMessage.success(
      rejected
        ? dueAt
          ? `已打回，开发者会收到整改通知（整改截止 ${dueAt}）`
          : '已记下验收结论，开发者会收到整改通知'
        : '验收已通过，请继续支付尾款',
    )
    emit('submitted', result.value)
    emit('close')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '提交验收结果失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!-- 验收弹窗要压在「需求详情」抽屉之上，所以必须 `Teleport` 到 body。
       为什么不能只调 z-index：抽屉自己 teleport 到 body 且 z-index 1300，而页面内容整棵
       都在 `.app-shell`（`isolation: isolate`，自成层叠上下文）里——`.app-shell` 在根层叠
       上下文里的层级由自己的 z-index 决定，子元素不管调多高都翻不出去，
       光改 z-index 会一直输给抽屉。teleport 到 body 后两者同层，再按 z-index 比大小。 -->
  <Teleport to="body">
    <div v-if="visible" class="modal-wrap acceptance-modal-wrap" @click.self="requestClose">
      <section class="pay-modal acceptance-modal" aria-label="验收弹窗">
        <h3>验收交付</h3>
        <p class="pay-line"><strong>需求标题：</strong>{{ requirementTitle }}</p>
        <p class="pay-line"><strong>需求编号：</strong>{{ requirementId }}</p>

        <div class="acceptance-modal__choice" role="group" aria-label="验收结论">
          <button
            class="acceptance-modal__choice-btn"
            :class="{ 'is-active': result === 'passed' }"
            type="button"
            @click="result = 'passed'"
          >
            验收通过
            <small>推进到待付尾款，随后可继续支付尾款</small>
          </button>
          <button
            class="acceptance-modal__choice-btn"
            :class="{ 'is-active': result === 'rejected' }"
            type="button"
            @click="result = 'rejected'"
          >
            验收不通过
            <small>只留档并通知开发者整改，需求留在开发中</small>
          </button>
        </div>

        <label class="pay-line acceptance-modal__field">
          <strong>验收说明</strong>
          <textarea
            v-model="note"
            rows="4"
            maxlength="1000"
            :placeholder="
              result === 'rejected'
                ? '请写明需要整改的问题，开发者会收到整改通知'
                : '可选：记录本次验收的范围与结论'
            "
          ></textarea>
        </label>

        <p class="tip">
          验收可以反复提交：不通过会留档并通知开发者整改。「开发中」阶段状态不变；
          若需求已进入「待付尾款」，不通过会把需求退回「开发中」并挡住宿尾款，
          开发者整改后需重新验收通过才能继续付款。验收通过后进入待付尾款，
          付清尾款还要等渠道分账完成才正式结单，之后进入解除合作窗口。
        </p>

        <div class="acceptance-modal__history">
          <div class="acceptance-modal__history-head">
            <strong>历史验收记录</strong>
            <span v-if="records.length">共 {{ records.length }} 条</span>
          </div>
          <p v-if="recordsLoading" class="acceptance-modal__empty">正在加载验收记录…</p>
          <p v-else-if="records.length === 0" class="acceptance-modal__empty">暂无验收记录</p>
          <ul v-else class="acceptance-modal__records">
            <li v-for="record in records" :key="record.id">
              <div class="acceptance-modal__record-head">
                <strong :class="record.result === 'passed' ? 'is-passed' : 'is-rejected'">
                  {{ record.result === 'passed' ? '验收通过' : '验收不通过' }}
                </strong>
                <time>{{ formatCnDateTime(record.recorded_at) }}</time>
              </div>
              <p v-if="record.note">{{ record.note }}</p>
              <small>提交人：{{ record.actor }}</small>
            </li>
          </ul>
        </div>

        <div class="actions">
          <button class="ghost" type="button" :disabled="submitting" @click="requestClose">
            取消
          </button>
          <button class="ghost primary" type="button" :disabled="submitting" @click="submit">
            {{ submitting ? '提交中...' : '提交验收结论' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* 验收弹窗是从「需求详情」抽屉里点开的，要压在抽屉（z-index 1300）之上：
   它在模板里 teleport 到 body，这里单独抬一层。`.modal-wrap` 默认只有 80。 */
.modal-wrap.acceptance-modal-wrap {
  z-index: 1400;
}

/* 验收弹窗比默认 pay-modal 长，限高内滚，避免小屏撑出屏幕 */
.pay-modal.acceptance-modal {
  width: min(600px, 100%);
  max-height: calc(100vh - 36px);
  overflow-y: auto;
}

/* 验收弹窗：结论选择（通过 / 不通过） */
.pay-modal .acceptance-modal__choice {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0 14px;
}

.pay-modal .acceptance-modal__choice-btn {
  display: grid;
  gap: 4px;
  min-height: 64px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--73-accent-soft) 95%, transparent);
  border-radius: 14px;
  background: var(--73-surface-strong);
  color: var(--73-ink-soft);
  font-size: 14px;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.pay-modal .acceptance-modal__choice-btn small {
  color: var(--73-ink-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.pay-modal .acceptance-modal__choice-btn.is-active {
  border-color: color-mix(in srgb, var(--73-accent) 62%, transparent);
  background: color-mix(in srgb, var(--73-accent-soft) 96%, transparent);
  color: var(--73-accent);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--73-accent) 10%, transparent);
}

.pay-modal .acceptance-modal__field {
  display: grid;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 14px;
}

.pay-modal .acceptance-modal__field > strong {
  color: var(--73-ink-muted);
  font-size: 13px;
  font-weight: 700;
}

/* 验收弹窗：历史留档列表 */
.pay-modal .acceptance-modal__history {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--73-border) 95%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--73-surface-strong) 72%, transparent);
}

.pay-modal .acceptance-modal__history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--73-ink);
  font-size: 13px;
  font-weight: 800;
}

.pay-modal .acceptance-modal__history-head span,
.pay-modal .acceptance-modal__history-head time {
  color: var(--73-ink-muted);
  font-size: 12px;
  font-weight: 600;
}

.pay-modal .acceptance-modal__empty {
  margin: 10px 0 0;
  color: var(--73-ink-muted);
  font-size: 13px;
}

.pay-modal .acceptance-modal__records {
  display: grid;
  gap: 10px;
  max-height: 220px;
  margin: 10px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.pay-modal .acceptance-modal__records > li {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--73-border) 95%, transparent);
  border-radius: 12px;
  background: var(--73-surface-strong);
}

.pay-modal .acceptance-modal__record-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.pay-modal .acceptance-modal__records p {
  margin: 0;
  color: var(--73-ink-soft);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.pay-modal .acceptance-modal__records small {
  color: var(--73-ink-placeholder);
  font-size: 12px;
}

.pay-modal .acceptance-modal__record-head strong.is-passed {
  color: var(--73-success);
}

.pay-modal .acceptance-modal__record-head strong.is-rejected {
  color: var(--73-danger);
}

@media (max-width: 640px) {
  /* 小屏下验收结论竖排，避免两个选项挤成窄条 */
  .pay-modal .acceptance-modal__choice {
    grid-template-columns: 1fr;
  }

  .pay-modal .acceptance-modal__records {
    max-height: none;
  }
}
</style>
