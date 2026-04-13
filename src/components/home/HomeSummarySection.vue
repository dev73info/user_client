<script setup lang="ts">
import type { PropType } from 'vue'

type Metric = {
  label: string
  value: string
  hint: string
}

type PendingRequirementView = {
  id: string
  title: string
  statusLabel: string
  updatedAtLabel: string
}

type Deal = {
  paymentId: string
  requirementId: string
  amount: string
  at: string
}

defineProps({
  metrics: { type: Array as PropType<Metric[]>, default: () => [] },
  pendingRequirements: { type: Array as PropType<PendingRequirementView[]>, default: () => [] },
  latestDeals: { type: Array as PropType<Deal[]>, default: () => [] },
  homeRefreshLoading: { type: Boolean, default: false },
  canOpenPayment: { type: Function as PropType<(item: PendingRequirementView) => boolean>, required: true },
})

const emit = defineEmits<{
  (e: 'open-deposit', item: PendingRequirementView): void
  (e: 'publish'): void
  (e: 'refresh'): void
}>()
</script>

<template>
  <section class="metrics" aria-label="核心指标">
    <article v-for="item in metrics" :key="item.label" class="metric-card">
      <p class="metric-label">{{ item.label }}</p>
      <p class="metric-value">{{ item.value }}</p>
      <p class="metric-hint">{{ item.hint }}</p>
    </article>
  </section>

  <section class="panel" aria-label="待处理需求">
    <header class="panel-header">
      <h2>待处理需求</h2>
      <span>{{ pendingRequirements.length }} 条</span>
    </header>
    <ul v-if="pendingRequirements.length > 0" class="req-list">
      <li v-for="item in pendingRequirements" :key="item.id" class="req-row"
        :class="{ clickable: canOpenPayment(item) }" @click="canOpenPayment(item) && emit('open-deposit', item)">
        <div class="req-main">
          <strong>{{ item.title }}</strong>
          <span>{{ item.id }}</span>
        </div>
        <button class="status-chip" :class="{ clickable: canOpenPayment(item) }" :disabled="!canOpenPayment(item)"
          @click.stop="emit('open-deposit', item)">
          {{ item.statusLabel }}
        </button>
        <time>{{ item.updatedAtLabel }}</time>
      </li>
    </ul>
    <p v-else class="empty-placeholder">暂无待处理需求，点击“发布需求”开始创建。</p>
  </section>

  <section class="panel" aria-label="最近成交">
    <header class="panel-header">
      <h2>最近成交</h2>
      <span>近 3 笔</span>
    </header>
    <ul v-if="latestDeals.length > 0" class="deal-list">
      <li v-for="deal in latestDeals" :key="deal.paymentId" class="deal-row">
        <span>{{ deal.requirementId }}</span>
        <strong>{{ deal.amount }}</strong>
        <time>{{ deal.at }}</time>
      </li>
    </ul>
    <p v-else class="empty-placeholder">暂无最近成交记录。</p>
  </section>
</template>
