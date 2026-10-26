<script setup lang="ts">
import type { NotificationCard, NotificationKind } from '@/shared/notifications'
import { ChatDotRound, Clock, Service, Warning, TButton, TIcon } from 'ui_73info'

/**
 * 一条系统通知（`<li class="wb-item">` 那一层）。
 *
 * 三类来源在后端字段与可做的动作上都不同，但卡片形状统一：左侧类别图标 + 中间标题与正文行 +
 * 右侧时间与动作。类别色由 `--nc-accent` 决定（色条、图标底、类别徽标共用同一支颜色），
 * 这个变量由页面根元素上的 `--nc-*` 令牌提供，组件自己不带色值。
 *
 * 卡片的点击只留给动作按钮，不再整块可点。
 */
defineProps<{
  card: NotificationCard
  /** 正在投票的公开申请 id：非空时投票按钮整体禁用 */
  votingId: number | null
}>()

const emit = defineEmits<{
  vote: [decision: 'approved' | 'rejected']
}>()

/** 每个类别一个图标，配色由卡片的 `--nc-accent` 决定。 */
function kindIcon(kind: NotificationKind) {
  switch (kind) {
    case 'history-disclosure':
      return ChatDotRound
    case 'after-sales':
      return Service
    case 'comment-warning':
      return Warning
  }
}
</script>

<template>
  <li class="wb-item notifications-card" :class="`notifications-card--${card.kind}`">
    <span class="notifications-card__icon">
      <TIcon :icon="kindIcon(card.kind)" />
    </span>
    <div class="wb-item__main notifications-card__main">
      <div class="notifications-card__head">
        <strong class="wb-item__title">{{ card.title }}</strong>
        <span class="notifications-kind">{{ card.kindLabel }}</span>
      </div>
      <span
        v-for="(line, index) in card.body"
        :key="`body-${index}`"
        class="wb-item__meta notifications-card__line"
      >
        {{ line }}
      </span>
      <span v-if="card.voteHint" class="wb-item__meta notifications-card__line">
        {{ card.voteHint }}
      </span>
    </div>
    <div class="wb-item__side">
      <span class="wb-item__meta notifications-card__meta">
        <TIcon :icon="Clock" />
        {{ card.meta }}
      </span>
      <div v-if="card.canVote" class="notifications-card__actions">
        <TButton
          variant="outline"
          :disabled="votingId !== null"
          @click.stop="emit('vote', 'rejected')"
        >
          拒绝
        </TButton>
        <TButton
          variant="solid"
          tone="accent"
          :disabled="votingId !== null"
          @click.stop="emit('vote', 'approved')"
        >
          同意公开
        </TButton>
      </div>
    </div>
  </li>
</template>

<style scoped>
/* 类别色：色条、图标底、徽标共用。色值在页面根元素的 --nc-* 令牌里，这一层只做映射 */
.notifications-card {
  --nc-accent: var(--nc-accent-default);
  position: relative;
  align-items: flex-start;
  overflow: hidden;
  padding-left: 22px;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.notifications-card--history-disclosure {
  --nc-accent: var(--nc-accent-history-disclosure);
}

.notifications-card--after-sales {
  --nc-accent: var(--nc-accent-after-sales);
}

.notifications-card--comment-warning {
  --nc-accent: var(--nc-accent-comment-warning);
}

/* 左侧 3px 类别色条：不增加一列布局，只做视觉锚点，扫列表时先按颜色分出类别 */
.notifications-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--nc-accent);
  opacity: 0.8;
}

.notifications-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border: 1px solid color-mix(in srgb, var(--nc-accent) 16%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--nc-accent) 9%, var(--nc-surface));
  color: var(--nc-accent);
  font-size: 18px;
}

/* 正文可能有两三行（公开申请有说明行 + 投票进度行），行与行贴紧一点 */
.notifications-card__main {
  display: grid;
  flex: 1 1 auto;
  gap: 5px;
  min-width: 0;
}

.notifications-card__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

/* 类别徽标取卡片自己的类别色，与左侧图标、色条是同一支颜色 */
.notifications-kind {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--nc-accent) 20%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--nc-accent) 8%, var(--nc-surface));
  color: var(--nc-accent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.notifications-card__line {
  margin: 0;
  color: var(--nc-text-sub);
  font-size: 13px;
  line-height: 1.65;
}

/* 时间行：小号灰字 + 时钟图标，不再跟正文抢视觉重量 */
.notifications-card__meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  margin-top: 0;
  color: var(--nc-text-sub);
  font-size: 12px;
  line-height: 1.5;
}

.notifications-card__actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 640px) {
  /* 触屏档：图标与正文一行，时间与动作落到下一行；按钮平分整行，触摸目标 ≥44px */
  .notifications-card {
    flex-wrap: wrap;
    padding-left: 20px;
  }

  .notifications-card__meta {
    justify-content: flex-start;
  }

  .notifications-card__actions :deep(.t73-button) {
    flex: 1;
    min-height: 44px;
  }
}
</style>
