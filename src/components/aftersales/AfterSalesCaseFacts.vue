<script setup lang="ts">
import type { AfterSalesCase } from '@/api/afterSales'
import {
  decisionText,
  executedFunds,
  executedFundsFen,
  expectationText,
  moneyFromFen,
  pendingFunds,
  statusText,
} from '@/shared/afterSalesView'

/**
 * 解除合作「在办案件」的事实表（R047 从 `components/AfterSalesModal.vue` 拆出）。
 *
 * 纯展示：一行一件事（编号 / 状态 / 发起人 / 诉求 / 双方表态 / 返工认定 / 处理说明），
 * 末尾按「已执行 / 认定但未执行 / 诉求差额」三行摆资金。
 *
 * 认定 ≠ 执行：赔付腿失败时案件行上已经写着认定额度，钱却一分没动（实测），所以未执行的那几笔
 * 单独一行并写清「尚未执行」，别让人以为钱已经付出去了。诉求差额只认带渠道单号的**已执行**那几笔，
 * 拿认定额度算会把没执行的钱也算成「已执行」。
 */
defineProps<{ record: AfterSalesCase }>()
</script>

<template>
  <dl class="after-sales-modal__facts">
    <div class="is-wide">
      <dt>案件编号</dt>
      <dd>{{ record.caseNo }}</dd>
    </div>
    <div>
      <dt>当前状态</dt>
      <dd>{{ statusText(record.status) }}</dd>
    </div>
    <div>
      <dt>发起人</dt>
      <dd>{{ record.openedBy }}</dd>
    </div>
    <div>
      <dt>诉求</dt>
      <dd>{{ expectationText(record) }}</dd>
    </div>
    <div v-if="record.expectsMoney">
      <dt>主张金额</dt>
      <dd>{{ record.claimAmountCny }} 元</dd>
    </div>
    <div class="is-wide">
      <dt>诉求说明</dt>
      <dd>{{ record.description }}</dd>
    </div>
    <div>
      <dt>需求方表态</dt>
      <dd>{{ decisionText(record.customerDecision) }}</dd>
    </div>
    <div>
      <dt>开发者表态</dt>
      <dd>{{ decisionText(record.developerDecision) }}</dd>
    </div>
    <div v-if="record.requiresRework" class="is-wide">
      <dt>返工认定</dt>
      <dd>本次认定要求对方返工 / 补交付，等发起人验收</dd>
    </div>
    <div v-if="record.resolutionNote" class="is-wide">
      <dt>处理说明</dt>
      <dd>{{ record.resolutionNote }}</dd>
    </div>
    <div v-if="executedFunds(record).length" class="is-wide">
      <dt>已执行资金</dt>
      <dd>{{ executedFunds(record).join(' / ') }}</dd>
    </div>
    <!-- 认定 ≠ 执行：赔付腿失败时案件行上已经写着认定额度，钱却一分没动（实测）。
               单独摆一行并写清「尚未执行」，别让人以为钱已经付出去了。 -->
    <div v-if="pendingFunds(record).length" class="is-wide">
      <dt>本次认定（尚未执行）</dt>
      <dd>
        {{ pendingFunds(record).join(' / ') }}
        <template v-if="record.status === 'manual_required'">
          ——渠道尚未受理，案件已转人工，落地后自动结案。
        </template>
      </dd>
    </div>
    <!-- 诉求金额被两个上限截断时把差额直接摆出来：否则「实赔 200」看起来像「诉求 500 全赔了」。
               条件与算式都只认**已执行**的那几笔（带渠道单号）：裁决还没落地时只是「诉求未决」，
               不是「被上限截断」；拿认定额度算会把没执行的钱也算成「已执行」。 -->
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
