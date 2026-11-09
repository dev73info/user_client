<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  notificationEventIconKey,
  type NotificationCard,
  type NotificationIconKey,
} from '@/shared/notifications'
import {
  Bell,
  Box,
  ChatDotRound,
  Clock,
  Document,
  Money,
  Postcard,
  RefreshLeft,
  Service,
  TButton,
  TIcon,
  Tickets,
  Warning,
} from 'ui_73info'

/**
 * 一条系统通知（`<li class="wb-item">` 那一层）。
 *
 * 来源不同、字段不同，但卡片形状统一：左侧类别图标 + 中间标题与正文行 +
 * 右侧时间与动作。类别色由 `--nc-accent` 决定（色条、图标底、类别徽标共用同一支颜色），
 * 这个变量由页面根元素上的 `--nc-*` 令牌提供，组件自己不带色值。
 *
 * 收件箱来源按 event 换图标；本地三支沿用原来的三种图标。
 * 卡片的点击只留给动作按钮，不再整块可点。
 */
const props = defineProps<{
  card: NotificationCard
  /** 正在投票的公开申请 id：非空时投票按钮整体禁用 */
  votingId: number | null
  /** 正在标记已读的通知单号：对应卡片上的按钮显示 loading */
  markingId?: string | null
}>()

const emit = defineEmits<{
  vote: [decision: 'approved' | 'rejected']
  read: []
  open: []
}>()

/** 图标键 → 组件：收件箱按事件细分，本地三支按来源。 */
const ICONS: Record<NotificationIconKey, Component> = {
  'history-disclosure': ChatDotRound,
  'after-sales': Service,
  'comment-warning': Warning,
  requirement: Document,
  payment: Money,
  refund: RefreshLeft,
  invoice: Postcard,
  dispute: Service,
  comment: Warning,
  community: ChatDotRound,
  resource: Box,
  ticket: Tickets,
  support: Service,
  system: Bell,
}

const icon = computed<Component>(() => {
  if (props.card.source !== 'inbox') {
    return ICONS[props.card.source]
  }
  return ICONS[notificationEventIconKey(props.card.event, props.card.kind)]
})

/** 类别色：本地三支沿用原来的颜色；收件箱按筛选类别取色。 */
function accentClass(card: NotificationCard): string {
  if (card.source !== 'inbox') {
    return `notifications-card--${card.source}`
  }
  return `notifications-card--kind-${card.kind}`
}

const isUnread = computed(() => props.card.read === false)
const markable = computed(() => isUnread.value && Boolean(props.card.notificationId))
</script>

<template>
  <li class="wb-item notifications-card" :class="[accentClass(card), { 'is-unread': isUnread }]">
    <span class="notifications-card__icon">
      <TIcon :icon="icon" />
    </span>
    <div class="wb-item__main notifications-card__main">
      <div class="notifications-card__head">
        <strong class="wb-item__title">{{ card.title }}</strong>
        <span class="notifications-kind">{{ card.kindLabel }}</span>
        <span v-if="isUnread" class="notifications-unread" aria-label="未读">未读</span>
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
      <div v-if="card.canVote || card.link || markable" class="notifications-card__actions">
        <TButton
          v-if="markable"
          variant="text"
          :loading="markingId === card.notificationId"
          @click.stop="emit('read')"
        >
          标为已读
        </TButton>
        <TButton v-if="card.link" variant="outline" @click.stop="emit('open')"> 查看 </TButton>
        <template v-if="card.canVote">
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
        </template>
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

.notifications-card--kind-requirement {
  --nc-accent: var(--nc-accent-kind-requirement);
}

.notifications-card--kind-payment {
  --nc-accent: var(--nc-accent-kind-payment);
}

.notifications-card--kind-system {
  --nc-accent: var(--nc-accent-kind-system);
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

/* 未读：淡淡一层类别色底，扫列表时不用逐条找「未读」两个字 */
.notifications-card.is-unread {
  background: color-mix(in srgb, var(--nc-accent) 5%, var(--nc-surface));
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

/* 未读小标：实心圆点 + 两个字，颜色跟类别走 */
.notifications-unread {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--nc-accent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.notifications-unread::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nc-accent);
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
