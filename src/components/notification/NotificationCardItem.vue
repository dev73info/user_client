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
 * 右侧时间与动作。卡片表面与其余工作台列表行共用 `.wb-item`，类别色只落在
 * 小图标与 `.wb-badge` 类别标签上，不再给整张卡铺类别色底。
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

type NotificationTone = 'accent' | 'success' | 'warning' | 'danger'

/**
 * 类别色：需求 / 资金 / 系统按筛选桶取统一徽标 tone；
 * 售后、评论警告与争议保持警示语义；历史沟通公开申请沿用主色。
 */
function toneOf(card: NotificationCard): NotificationTone {
  if (card.source === 'history-disclosure') {
    return 'accent'
  }
  if (card.source === 'after-sales' || card.source === 'comment-warning') {
    return 'danger'
  }
  const event = card.event ?? ''
  if (event.startsWith('dispute_') || event.startsWith('comment_')) {
    return 'danger'
  }
  if (card.kind === 'payment') {
    return 'success'
  }
  if (card.kind === 'system') {
    return 'warning'
  }
  return 'accent'
}

function badgeToneClass(card: NotificationCard): string {
  return `wb-badge--${toneOf(card)}`
}

function iconToneClass(card: NotificationCard): string {
  return `notifications-card__icon--${toneOf(card)}`
}

const isUnread = computed(() => props.card.read === false)
const markable = computed(() => isUnread.value && Boolean(props.card.notificationId))

/** 合并卡可能带多个单号：只要正在标记的单号落在这张卡上，就显示 loading。 */
const marking = computed(
  () =>
    Boolean(props.markingId) &&
    (props.markingId === props.card.notificationId ||
      (props.card.notificationIds ?? []).includes(props.markingId!)),
)
</script>

<template>
  <li class="wb-item notifications-card" :class="{ 'is-unread': isUnread }">
    <div class="notifications-card__body">
      <span class="notifications-card__icon" :class="iconToneClass(card)">
        <TIcon :icon="icon" />
      </span>
      <div class="wb-item__main notifications-card__main">
        <div class="wb-item__title-row">
          <strong class="wb-item__title">{{ card.title }}</strong>
          <span class="wb-badge" :class="badgeToneClass(card)">{{ card.kindLabel }}</span>
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
    </div>
    <div class="wb-item__side notifications-card__side">
      <span class="wb-item__meta notifications-card__meta">
        <TIcon :icon="Clock" />
        {{ card.meta }}
      </span>
      <div v-if="card.canVote || card.link || markable" class="notifications-card__actions">
        <TButton v-if="markable" variant="text" :loading="marking" @click.stop="emit('read')">
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
.notifications-card {
  align-items: flex-start;
  gap: 14px;
}

/* 图标与正文作为一个整体参与外层 .wb-item 的左右分栏；触屏档外层竖排时两者仍保持一行。 */
.notifications-card__body {
  display: flex;
  align-items: flex-start;
  flex: 1 1 auto;
  gap: 14px;
  min-width: 0;
}

.notifications-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 1px solid var(--wb-line);
  border-radius: var(--wb-radius-control);
  background: var(--wb-tag-bg);
  color: var(--profile-text-sub, var(--73-ink-muted));
  font-size: 18px;
}

.notifications-card__icon--accent {
  border-color: var(--wb-accent-line);
  background: var(--wb-accent-soft);
  color: var(--wb-accent);
}

.notifications-card__icon--success {
  border-color: color-mix(in srgb, var(--73-success) 30%, transparent);
  background: var(--profile-success-soft, color-mix(in srgb, var(--73-success) 12%, transparent));
  color: var(--profile-success-text, var(--73-success));
}

.notifications-card__icon--warning {
  border-color: color-mix(in srgb, var(--73-warning) 30%, transparent);
  background: var(--profile-warning-soft, color-mix(in srgb, var(--73-warning) 14%, transparent));
  color: var(--profile-warning-text, var(--73-warning-text));
}

.notifications-card__icon--danger {
  border-color: color-mix(in srgb, var(--73-danger) 30%, transparent);
  background: var(--profile-danger-soft, color-mix(in srgb, var(--73-danger) 12%, transparent));
  color: var(--profile-danger-text, var(--73-danger));
}

.notifications-card__main {
  flex: 1 1 auto;
  min-width: 0;
}

/* 未读小标：实心圆点 + 两个字；颜色用工作台主色，不跟着类别换色。 */
.notifications-unread {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--wb-accent);
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
  background: var(--wb-accent);
}

.notifications-card__line {
  margin: 0;
  color: var(--profile-text-sub, var(--73-ink-muted));
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

/* 右侧时间与动作：桌面竖排、右对齐；≤640 由统一层把整张卡改成竖排，这里只把侧栏横向铺开。 */
.notifications-card__side {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 8px;
}

/* 时间行：小号灰字 + 时钟图标，不再跟正文抢视觉重量 */
.notifications-card__meta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  margin-top: 0;
  color: var(--profile-text-sub, var(--73-ink-muted));
  font-size: 12px;
  line-height: 1.5;
  white-space: normal;
}

.notifications-card__actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 640px) {
  /* 触屏档：外层 .wb-item 已竖排；图标与正文保持一行，时间与动作铺满下一行，按钮平分整行。 */
  .notifications-card {
    gap: 10px;
  }

  .notifications-card__body {
    gap: 12px;
    width: 100%;
  }

  .notifications-card__side {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
  }

  .notifications-card__meta {
    justify-content: flex-start;
  }

  .notifications-card__actions {
    flex: 1 1 100%;
    width: 100%;
  }

  .notifications-card__actions :deep(.t73-button) {
    flex: 1 1 0;
    min-height: 44px;
  }
}
</style>
