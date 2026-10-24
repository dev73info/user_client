<script setup lang="ts">
import { commentBodyText, starFill } from '@/shared/devMyRequirementCard'
import type { DevMyOrderRow } from '@/shared/devDelivery'

/**
 * 卡上的两行评价：对方给我的评价与我给对方的评价（各自 5 颗星 + 一句评语）。
 *
 * 只渲染：`item` 是页面归并好的那一行携带的需求单，两行都按「有评分才出」渲染；
 * 评语用 `commentBodyText` 过滤掉纯数字脏数据（评分/信用分误写入）。
 */
defineProps<{ item: DevMyOrderRow['item'] }>()
</script>

<template>
  <div
    v-if="item && (item.comment_rating != null || item.developer_comment_rating != null)"
    class="dev-requirement-card__comments"
  >
    <div v-if="item.comment_rating != null" class="dev-rating-row">
      <span class="dev-rating-row__label">对方评价</span>
      <span class="dev-rating-stars" :aria-label="`${item.comment_rating.toFixed(1)} 分`">
        <span
          v-for="n in 5"
          :key="`peer-${n}`"
          class="dev-rating-star"
          :class="`is-${starFill(item.comment_rating, n)}`"
          aria-hidden="true"
          >★</span
        >
      </span>
      <strong class="dev-rating-row__score">{{ item.comment_rating.toFixed(1) }}</strong>
      <span v-if="commentBodyText(item.comment_text)" class="dev-rating-row__text">
        {{ commentBodyText(item.comment_text) }}
      </span>
    </div>
    <div v-if="item.developer_comment_rating != null" class="dev-rating-row">
      <span class="dev-rating-row__label">我的评价</span>
      <span class="dev-rating-stars" :aria-label="`${item.developer_comment_rating.toFixed(1)} 分`">
        <span
          v-for="n in 5"
          :key="`mine-${n}`"
          class="dev-rating-star"
          :class="`is-${starFill(item.developer_comment_rating, n)}`"
          aria-hidden="true"
          >★</span
        >
      </span>
      <strong class="dev-rating-row__score">
        {{ item.developer_comment_rating.toFixed(1) }}
      </strong>
      <span v-if="commentBodyText(item.developer_comment_text)" class="dev-rating-row__text">
        {{ commentBodyText(item.developer_comment_text) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.dev-requirement-card__comments {
  display: grid;
  gap: 4px;
}

.dev-requirement-card__comments p {
  margin: 0;
}

.dev-rating-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
  color: var(--dev-ink);
  font-size: 12px;
  line-height: 1.4;
}

.dev-rating-row__label {
  flex: 0 0 auto;
  color: var(--dev-muted);
  font-weight: 700;
}

.dev-rating-stars {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

/* 实心 ★：ui_73info 的 Star 是空心描边，评分展示用不合适 */
.dev-rating-star {
  display: inline-block;
  width: 1em;
  height: 1em;
  color: color-mix(in srgb, var(--dev-muted) 38%, transparent);
  font-size: 14px;
  font-style: normal;
  line-height: 1;
}

.dev-rating-star.is-full {
  color: var(--dev-gold);
}

.dev-rating-star.is-half {
  background: linear-gradient(
    90deg,
    var(--dev-gold) 50%,
    color-mix(in srgb, var(--dev-muted) 38%, transparent) 50%
  );
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}

.dev-rating-row__score {
  flex: 0 0 auto;
  color: var(--dev-ink);
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.dev-rating-row__text {
  flex: 1 1 12rem;
  min-width: 0;
  color: var(--dev-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
