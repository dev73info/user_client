<script setup lang="ts">
/**
 * 需求大厅右侧栏：大厅概览读数 + 最近交付。
 *
 * 结构对齐 Stitch 源码「需求大厅（精密工程轻色工作台）」：
 * 概览卡是 2×2 指标格 + 资金存管说明；最近交付按「标题 + 金额 / 时间 + 评分」排。
 * 读数与评分口径仍在 `@/shared/requirementDisplay`（纯函数，有单测）。
 */
import type { RecentDeal } from '@/api/requirements'
import {
  formatCnDateTime as formatTimeLabel,
  formatCny as formatMoney,
} from '@/shared/requirementDisplay'

/**
 * 指标值的颜色口径与设计稿一致：可浏览蓝、已完成绿、好评率琥珀、累计成交墨色。
 * 只影响取色，标签与数值仍来自 `requirementHallStats` 的真实统计。
 */
function statTone(label: string): string {
  if (label === '可浏览需求') return 'accent'
  if (label === '已完成需求') return 'success'
  if (label === '好评率') return 'warning'
  return 'ink'
}

defineProps<{
  /** 四格读数：可浏览需求 / 已完成需求 / 好评率 / 累计成交（口径见 `requirementHallStats`） */
  stats: Array<{ label: string; value: string }>
  /** 最近交付：概览还没回来时是空列表，卡片里出空态 */
  deals: RecentDeal[]
}>()
</script>

<template>
  <section class="portal-page__aside-card requirement-hall__overview-card">
    <div class="portal-page__aside-head">
      <div class="requirement-hall__aside-title">
        <span class="requirement-hall__aside-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </span>
        <h3>大厅概览</h3>
      </div>
      <span class="requirement-hall__live">
        <span class="requirement-hall__live-dot" aria-hidden="true"></span>
        实时
      </span>
    </div>

    <div class="requirement-hall__stats-grid">
      <div
        v-for="item in stats"
        :key="item.label"
        class="requirement-hall__stat-tile"
        :class="'requirement-hall__stat-tile--' + statTone(item.label)"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>

    <div class="requirement-hall__escrow">
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3 4 6v6c0 4.4 3.4 7.8 8 9 4.6-1.2 8-4.6 8-9V6Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      <span>全流程资金存管与司法链存证</span>
    </div>
  </section>

  <section class="portal-page__aside-card requirement-hall__recent-card">
    <div class="portal-page__aside-head">
      <div class="requirement-hall__aside-title">
        <span class="requirement-hall__aside-icon requirement-hall__aside-icon--muted" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 11.5 11 13.5 15.5 9" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <h3>最近交付</h3>
      </div>
      <span class="requirement-hall__aside-hint">30天记录</span>
    </div>

    <ul v-if="deals.length" class="portal-page__list requirement-hall__deal-list">
      <li
        v-for="deal in deals"
        :key="deal.payment_id"
        class="portal-page__list-item requirement-hall__deal-item"
      >
        <div class="requirement-hall__deal-top">
          <strong class="requirement-hall__deal-title">{{ deal.title }}</strong>
          <span class="requirement-hall__deal-amount">{{ formatMoney(deal.amount_cny) }}</span>
        </div>
        <div class="requirement-hall__deal-foot">
          <span class="requirement-hall__deal-meta">{{ formatTimeLabel(deal.paid_at) }}</span>
          <span
            v-if="deal.comment_rating"
            class="requirement-hall__deal-rating"
            :aria-label="`客户评分 ${Number(deal.comment_rating).toFixed(1)} 分`"
          >
            <span aria-hidden="true">★</span>
            {{ Number(deal.comment_rating).toFixed(1) }}
          </span>
          <span v-else class="requirement-hall__deal-rating requirement-hall__deal-rating--empty"
            >暂无评价</span
          >
        </div>
      </li>
    </ul>
    <p v-else class="portal-page__empty requirement-hall__empty-delivery">暂无最近交付记录。</p>
  </section>
</template>

<style scoped>
.requirement-hall__aside-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.requirement-hall__aside-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--73-accent-line);
  border-radius: 4px;
  background: var(--73-accent-soft);
  color: var(--73-accent);
}

.requirement-hall__aside-icon--muted {
  border-color: var(--73-border);
  background: var(--73-inset);
  color: var(--73-ink-muted);
}

.requirement-hall__live {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--73-success-line);
  border-radius: 4px;
  background: var(--73-success-soft);
  color: var(--73-success-text);
  font-size: 10px;
  font-weight: 500;
}

.requirement-hall__live-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--73-radius-pill);
  background: var(--73-success);
}

.requirement-hall__stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}

.requirement-hall__stat-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--73-border);
  border-radius: 8px;
  background: var(--73-bg);
}

.requirement-hall__stat-tile span {
  color: var(--73-ink-muted);
  font-size: 11px;
}

.requirement-hall__stat-tile strong {
  overflow: hidden;
  color: var(--73-ink);
  font-family: var(--73-font-family-mono);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.requirement-hall__escrow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--73-border-soft);
  color: var(--73-ink-soft);
  font-size: 12px;
}

.requirement-hall__escrow svg {
  color: var(--73-accent);
}

.requirement-hall__aside-hint {
  color: var(--73-ink-muted);
  font-size: 11px;
}

.requirement-hall__deal-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.requirement-hall__deal-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 0;
  border-top: 1px solid var(--73-border-soft);
}

.requirement-hall__deal-item:first-child {
  padding-top: 0;
  border-top: 0;
}

.requirement-hall__deal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.requirement-hall__deal-title {
  overflow: hidden;
  color: var(--73-ink);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.requirement-hall__deal-amount {
  flex-shrink: 0;
  color: var(--73-ink);
  font-family: var(--73-font-family-mono);
  font-size: 12px;
  font-weight: 600;
}

.requirement-hall__deal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--73-ink-muted);
  font-size: 11px;
}

.requirement-hall__deal-rating {
  color: var(--73-warning-text);
  font-weight: 500;
}

.requirement-hall__deal-rating--empty {
  color: var(--73-ink-muted);
  font-weight: 400;
}

.requirement-hall__deal-comment {
  margin: 0;
  overflow: hidden;
  color: var(--73-ink-muted);
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
