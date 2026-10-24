<script setup lang="ts">
import type { AfterSalesCaseDetail } from '@/api/afterSales'
import { formatFenAsCny } from '@/shared/money'

/**
 * 结单后「售后 / 解除合作」案件的只读事实表（契约 `CaseDetailResponse`）。
 *
 * 每一行都指向契约字段：案件编号 / 类型 / 状态 / 立案人 / 对方当事人 / 诉求金额（整数分）/
 * 诉求说明 / 表态流水 / 裁决（退还与扣划都是分）/ 结案与协商一致时间。
 *
 * 不出现「赔付上限」「诉求缺口」「解除合作窗口关闭时间」这类读数——契约里没有这些字段，
 * 前端也就没有依据去声称它们存在。
 */
defineProps<{ record: AfterSalesCaseDetail }>()
</script>

<template>
  <dl class="after-sales-facts">
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
      <dd>{{ record.created_time }}</dd>
    </div>
    <div>
      <dt>最近更新</dt>
      <dd>{{ record.updated_time }}</dd>
    </div>
    <div class="after-sales-facts__wide">
      <dt>诉求说明</dt>
      <dd>{{ record.claim_note || '—' }}</dd>
    </div>
    <div v-if="record.mutual_agreed_time">
      <dt>协商一致时间</dt>
      <dd>{{ record.mutual_agreed_time }}</dd>
    </div>
    <div v-if="record.closed_time">
      <dt>结案时间</dt>
      <dd>{{ record.closed_time }}</dd>
    </div>
    <div v-if="record.handled_by">
      <dt>平台处置人</dt>
      <dd>{{ record.handled_by }}</dd>
    </div>
    <div v-if="record.verdict" class="after-sales-facts__wide">
      <dt>裁决</dt>
      <dd>
        {{ record.verdict.resolution_label }}
        · 退还 {{ formatFenAsCny(record.verdict.refund_fen) }} 元 · 扣划
        {{ formatFenAsCny(record.verdict.forfeit_fen) }} 元
        <template v-if="record.verdict.note"> · {{ record.verdict.note }}</template>
      </dd>
    </div>
    <div v-if="record.statements.length" class="after-sales-facts__wide">
      <dt>表态流水</dt>
      <dd>
        <ul class="after-sales-facts__statements">
          <li v-for="item in record.statements" :key="`${item.created_time}-${item.author}`">
            <span class="after-sales-facts__meta">
              {{ item.created_time }} · {{ item.author }}（{{ item.role_label }}）{{
                item.action_label
              }}
            </span>
            <span>{{ item.body }}</span>
          </li>
        </ul>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.after-sales-facts {
  display: grid;
  gap: 6px 12px;
  margin: 0;
  font-size: 13px;
}

.after-sales-facts > div {
  display: grid;
  grid-template-columns: 6em 1fr;
  gap: 8px;
}

.after-sales-facts__wide {
  grid-column: 1 / -1;
}

.after-sales-facts dt {
  color: var(--dev-muted);
}

.after-sales-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.after-sales-facts__statements {
  margin: 0;
  padding-left: 1em;
  display: grid;
  gap: 4px;
}

.after-sales-facts__meta {
  display: block;
  color: var(--dev-muted);
  font-size: 12px;
}
</style>
