<script setup lang="ts">
/**
 * 需求大厅右侧栏：大厅概览读数 + 最近交付。
 *
 * 从 `views/RequirementHallView.vue` 抽出来，两张 `.portal-page__aside-card` 一起搬：
 * 页面里的 `<aside class="portal-page__aside">` 仍留在视图上（它是整页的两栏骨架），
 * 这里只出两张卡本身，模板与样式逐段照搬，`@media 640` 随它作用的卡走。
 *
 * 星级与评论预览的判定在 `@/shared/requirementDisplay`（纯函数，有单测）。
 */
import type { RecentDeal } from '@/api/requirements'
import {
  dealCommentPreview,
  dealStarClass,
  formatCnDateTime as formatTimeLabel,
  formatCny as formatMoney,
} from '@/shared/requirementDisplay'

defineProps<{
  /** 三格读数：可浏览需求 / 已完成需求 / 好评率（口径见 `requirementHallStats`） */
  stats: Array<{ label: string; value: string }>
  /** 最近交付：概览还没回来时是空列表，卡片里出空态 */
  deals: RecentDeal[]
}>()
</script>

<template>
  <section class="portal-page__aside-card requirement-hall__overview-card">
    <div class="portal-page__aside-head">
      <h3>大厅概览</h3>
    </div>
    <ul class="portal-page__timeline requirement-hall__stats">
      <li
        v-for="item in stats"
        :key="item.label"
        class="portal-page__timeline-item requirement-hall__stat-item"
      >
        <div class="requirement-hall__stat-main">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </li>
    </ul>
  </section>

  <section class="portal-page__aside-card requirement-hall__recent-card">
    <div class="portal-page__aside-head">
      <h3>最近交付</h3>
    </div>
    <ul v-if="deals.length" class="portal-page__list requirement-hall__deal-list">
      <li
        v-for="deal in deals"
        :key="deal.payment_id"
        class="portal-page__list-item requirement-hall__deal-item"
      >
        <strong class="requirement-hall__deal-title">{{ deal.title }}</strong>
        <div class="requirement-hall__deal-foot">
          <span class="requirement-hall__deal-meta"
            >{{ formatMoney(deal.amount_cny) }} · {{ formatTimeLabel(deal.paid_at) }}</span
          >
          <div
            v-if="deal.comment_rating != null"
            class="requirement-hall__deal-rating"
            :aria-label="`客户评分 ${Number(deal.comment_rating).toFixed(1)} 分`"
          >
            <span class="requirement-hall__deal-stars" aria-hidden="true">
              <span
                v-for="star in 5"
                :key="star"
                class="requirement-hall__deal-star"
                :class="dealStarClass(deal.comment_rating, star)"
                >★</span
              >
            </span>
            <strong>{{ Number(deal.comment_rating).toFixed(1) }}</strong>
            <span class="requirement-hall__deal-rating-unit">分</span>
          </div>
          <span v-else class="requirement-hall__deal-rating requirement-hall__deal-rating--empty"
            >暂无评分</span
          >
        </div>
        <p v-if="dealCommentPreview(deal.comment_text)" class="requirement-hall__deal-comment">
          {{ dealCommentPreview(deal.comment_text) }}
        </p>
      </li>
    </ul>
    <p v-else class="portal-page__empty requirement-hall__empty-delivery">暂无最近交付记录。</p>
  </section>
</template>

<style scoped>
.requirement-hall__stats .portal-page__timeline-item strong {
  font-size: 20px;
}

.requirement-hall__overview-card,
.requirement-hall__recent-card {
  overflow: hidden;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--73-surface-strong) 98%, transparent),
    color-mix(in srgb, var(--73-surface-strong) 94%, transparent)
  );
}

.requirement-hall__overview-card .portal-page__aside-head,
.requirement-hall__recent-card .portal-page__aside-head {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--73-border) 82%, transparent);
}

.requirement-hall__overview-card .portal-page__aside-head h3,
.requirement-hall__recent-card .portal-page__aside-head h3 {
  font-size: 20px;
  line-height: 1.3;
}

.requirement-hall__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.portal-page--nav .requirement-hall__stats .requirement-hall__stat-item {
  display: flex;
  min-height: 0;
  padding: 12px;
  border-radius: 14px;
  border-color: color-mix(in srgb, var(--73-accent-soft) 90%, transparent);
  background: color-mix(in srgb, var(--73-surface-strong) 78%, transparent);
  box-shadow: none;
  backdrop-filter: none;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
}

.requirement-hall__stat-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.requirement-hall__stat-main strong {
  font-size: 22px;
  line-height: 1.1;
  letter-spacing: 0;
}

.requirement-hall__stat-main span {
  color: var(--73-ink-soft);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}

.requirement-hall__deal-list {
  gap: 0;
}

.requirement-hall__deal-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--73-ink-placeholder) 18%, transparent);
}

.requirement-hall__deal-item:first-child {
  padding-top: 2px;
}

.requirement-hall__deal-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.requirement-hall__deal-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  color: var(--73-ink);
  font-size: 14px;
  font-weight: 800;
  line-height: 1.45;
}

.requirement-hall__deal-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.requirement-hall__deal-meta {
  min-width: 0;
  color: var(--73-ink-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.requirement-hall__deal-rating {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--73-warning) 22%, transparent);
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--73-warning-soft) 95%, transparent),
    color-mix(in srgb, var(--73-warning-soft) 55%, transparent)
  );
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--73-surface-strong) 65%, transparent);
  color: var(--73-warning);
}

.requirement-hall__deal-rating--empty {
  border-color: color-mix(in srgb, var(--73-ink-placeholder) 28%, transparent);
  background: color-mix(in srgb, var(--73-surface-strong) 90%, transparent);
  box-shadow: none;
  color: var(--73-ink-placeholder);
  font-size: 11px;
  font-weight: 700;
}

.requirement-hall__deal-stars {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  letter-spacing: -0.04em;
}

.requirement-hall__deal-star {
  display: inline-flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
  color: var(--73-border);
  font-size: 12px;
  line-height: 1;
}

.requirement-hall__deal-star.is-full {
  color: var(--73-warning);
}

.requirement-hall__deal-star.is-half {
  color: transparent;
  background: linear-gradient(90deg, var(--73-warning) 50%, var(--73-border) 50%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.requirement-hall__deal-rating > strong {
  margin-left: 2px;
  color: var(--73-warning-text);
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.requirement-hall__deal-rating-unit {
  color: var(--73-warning);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.requirement-hall__deal-comment {
  margin: 0;
  padding: 6px 10px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  border-left: 2px solid color-mix(in srgb, var(--73-ink-placeholder) 45%, transparent);
  border-radius: 0 10px 10px 0;
  background: color-mix(in srgb, var(--73-surface-strong) 90%, transparent);
  color: var(--73-ink-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.requirement-hall__empty-delivery.portal-page__empty {
  margin: 0;
  padding: 14px 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--73-surface-strong) 78%, transparent);
  color: var(--73-ink-muted);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.6;
}

@media (max-width: 640px) {
  .portal-page--nav .requirement-hall__overview-card,
  .portal-page--nav .requirement-hall__recent-card {
    padding: 14px 16px;
    border-radius: 16px;
  }

  .requirement-hall__overview-card .portal-page__aside-head,
  .requirement-hall__recent-card .portal-page__aside-head {
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .requirement-hall__overview-card .portal-page__aside-head h3,
  .requirement-hall__recent-card .portal-page__aside-head h3 {
    font-size: 18px;
  }

  .portal-page--nav .requirement-hall__stats .requirement-hall__stat-item {
    padding: 10px;
    border-radius: 12px;
  }

  .requirement-hall__stat-main strong {
    font-size: 19px;
  }

  .requirement-hall__stat-main span {
    font-size: 11px;
  }
}
</style>
