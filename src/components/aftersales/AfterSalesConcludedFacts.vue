<script setup lang="ts">
import type { AfterSalesCase } from '@/api/afterSales'
import {
  executedFunds,
  executedFundsFen,
  expectationText,
  moneyFromFen,
  pendingFunds,
  statusText,
} from '@/shared/afterSalesView'
import { formatCnDateTime } from '@/shared/requirementDisplay'

/**
 * 解除合作「上次收口」的结论表（R047 从 `components/AfterSalesModal.vue` 拆出）。
 *
 * 案件只有一条，收口后的这一条就是上次的结果，双方都看得到。解除合作不记录轮次，再次提交会复用
 * 同一条案件并覆盖上次的诉求，平台侧也查不到历史，因此这里只出这一条结论、不堆历史列表。
 * 「已撤回」不进这块：那是发起人自己收手，没有结论可摆（筛选在 `useAfterSalesView`）。
 */
defineProps<{
  record: AfterSalesCase
  /** 收口时间：优先后端给的结案时间，兜底最后更新时间；空串表示拿不到。 */
  concludedAt: string
}>()
</script>

<template>
  <dl class="after-sales-modal__facts">
    <div>
      <dt>上次解除合作</dt>
      <dd>{{ statusText(record.status) }}</dd>
    </div>
    <div>
      <dt>收口时间</dt>
      <dd>{{ concludedAt ? formatCnDateTime(concludedAt) : '—' }}</dd>
    </div>
    <div>
      <dt>诉求</dt>
      <dd>{{ expectationText(record) }}</dd>
    </div>
    <div v-if="record.expectsMoney">
      <dt>主张金额</dt>
      <dd>{{ record.claimAmountCny }} 元</dd>
    </div>
    <div v-if="record.requiresRework" class="is-wide">
      <dt>返工认定</dt>
      <dd>本次认定要求对方返工 / 补交付</dd>
    </div>
    <div class="is-wide">
      <dt>诉求说明</dt>
      <dd>{{ record.description }}</dd>
    </div>
    <div v-if="record.resolutionNote" class="is-wide">
      <dt>处理说明</dt>
      <dd>{{ record.resolutionNote }}</dd>
    </div>
    <div v-if="executedFunds(record).length" class="is-wide">
      <dt>已执行资金</dt>
      <dd>{{ executedFunds(record).join(' / ') }}</dd>
    </div>
    <div v-if="pendingFunds(record).length" class="is-wide">
      <dt>本次认定（尚未执行）</dt>
      <dd>{{ pendingFunds(record).join(' / ') }}</dd>
    </div>
    <div v-if="executedFundsFen(record) > 0 && record.shortfallFen > 0" class="is-wide">
      <dt>诉求差额</dt>
      <dd>
        诉求
        {{ record.claimAmountCny }}
        元，受可退部分与赔付上限（冻结保证金与需求预算取小）限制，本次共执行
        {{ moneyFromFen(executedFundsFen(record)) }} 元，差额
        <strong>{{ record.shortfallCny }} 元</strong>
      </dd>
    </div>
  </dl>
</template>
