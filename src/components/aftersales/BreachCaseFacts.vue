<script setup lang="ts">
import type { AfterSalesCaseDetail, RequirementBreachCaseItem } from '@/api/afterSales'
import { formatFenAsCny } from '@/shared/money'

/**
 * 解除合作案件的**只读事实表**：三个弹窗（需求方 / 开发者 / 会话工具条）共用这一份。
 *
 * 每一行都能在契约里指到出处：
 * - `RequirementBreachCaseItemResponse`（案号 / 类型 / 状态 / 轮到谁 / 立案人 / 对方 / 诉求金额 / 立案时间）；
 * - `CaseDetailResponse`（诉求说明 / 表态流水 / 裁决 / 结案与协商一致时间），拿不到就整块不出。
 *
 * 金额只认 `*_fen`（整数分），元值只作展示；时间串由后端排好东八区，直接显示。
 * 这里不出现「赔付上限」「诉求缺口」「窗口关闭时间」这类读数——契约里没有那些字段。
 */
defineProps<{
  record: RequirementBreachCaseItem
  /** 案件详情（表态流水与裁决）：只在拿到时展示。 */
  detail?: AfterSalesCaseDetail | null
}>()
</script>

<template>
  <dl class="breach-facts">
    <div>
      <dt>案件编号</dt>
      <dd>{{ record.case_no }}</dd>
    </div>
    <div>
      <dt>案件类型</dt>
      <dd>{{ record.kind_label }}</dd>
    </div>
    <div>
      <dt>当前状态</dt>
      <dd>{{ record.status_label }}</dd>
    </div>
    <div>
      <dt>当前流程</dt>
      <dd>{{ record.turn_label }}</dd>
    </div>
    <div>
      <dt>立案人</dt>
      <dd>{{ record.filed_by }}</dd>
    </div>
    <div>
      <dt>对方当事人</dt>
      <dd>{{ record.respondent ?? '—' }}</dd>
    </div>
    <div>
      <dt>诉求金额</dt>
      <dd>{{ formatFenAsCny(record.claim_amount_fen) }} 元</dd>
    </div>
    <div>
      <dt>立案时间</dt>
      <dd>{{ record.opened_at }}</dd>
    </div>

    <div v-if="detail" class="breach-facts__wide">
      <dt>诉求说明</dt>
      <dd>{{ detail.claim_note || '—' }}</dd>
    </div>
    <div v-if="detail?.mutual_agreed_time">
      <dt>协商一致时间</dt>
      <dd>{{ detail.mutual_agreed_time }}</dd>
    </div>
    <div v-if="detail?.closed_time">
      <dt>结案时间</dt>
      <dd>{{ detail.closed_time }}</dd>
    </div>
    <div v-if="detail?.handled_by">
      <dt>平台处置人</dt>
      <dd>{{ detail.handled_by }}</dd>
    </div>
    <div v-if="detail?.handled_time">
      <dt>平台处置时间</dt>
      <dd>{{ detail.handled_time }}</dd>
    </div>

    <div v-if="detail?.verdict" class="breach-facts__wide">
      <dt>裁决</dt>
      <dd>
        {{ detail.verdict.resolution_label }}
        · 退还 {{ formatFenAsCny(detail.verdict.refund_fen) }} 元 · 扣划
        {{ formatFenAsCny(detail.verdict.forfeit_fen) }} 元
        <template v-if="detail.verdict.note"> · {{ detail.verdict.note }}</template>
      </dd>
    </div>

    <div v-if="detail?.statements.length" class="breach-facts__wide">
      <dt>表态流水</dt>
      <dd>
        <ul class="breach-facts__statements">
          <li v-for="item in detail.statements" :key="`${item.created_time}-${item.author}`">
            <span class="breach-facts__meta"
              >{{ item.created_time }} · {{ item.author }}（{{ item.role_label }}）{{
                item.action_label
              }}</span
            >
            <span>{{ item.body }}</span>
          </li>
        </ul>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.breach-facts {
  display: grid;
  gap: 6px 12px;
  margin: 0;
  font-size: 13px;
}

.breach-facts > div {
  display: grid;
  grid-template-columns: 6em 1fr;
  gap: 8px;
}

.breach-facts__wide {
  grid-column: 1 / -1;
}

.breach-facts dt {
  color: var(--dev-muted);
}

.breach-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.breach-facts__statements {
  margin: 0;
  padding-left: 1em;
  display: grid;
  gap: 4px;
}

.breach-facts__meta {
  display: block;
  color: var(--dev-muted);
  font-size: 12px;
}
</style>
