<script setup lang="ts">
import type { NotificationCard, NotificationKind } from '@/shared/notifications'
import { ChatDotRound, Clock, Promotion, Service, Switch, TButton, TIcon, Warning } from 'ui_73info'

/**
 * 一条系统通知（`<li class="wb-item">` 那一层）。
 *
 * 五类来源在后端字段与可做的动作上都不同，但卡片形状统一：左侧类别图标 + 中间标题与正文行 +
 * 右侧时间与动作。类别色由 `--nc-accent` 决定（色条、图标底、类别徽标共用同一支颜色），
 * 这个变量由页面根元素上的 `--nc-*` 令牌提供，组件自己不带色值。
 *
 * 只有公告整块可点（进社区帖详情），其余卡片的点击留给动作按钮：`postId` 有值才挂
 * `role="button"` / `tabindex`，否则键盘焦点会停在一个点不出反应的卡片上。
 */
const props = defineProps<{
  card: NotificationCard
  /** 正在投票的公开申请 id：非空时投票按钮整体禁用 */
  votingId: number | null
  /** 正在处理的过户 id：非空时过户按钮整体禁用 */
  respondingTransferId: number | null
}>()

const emit = defineEmits<{
  vote: [decision: 'approved' | 'rejected']
  respond: [accepted: boolean]
  cancel: []
  open: []
}>()

/** 每个类别一个图标，配色由卡片的 `--nc-accent` 决定。 */
function kindIcon(kind: NotificationKind) {
  switch (kind) {
    case 'comment-warning':
      return Warning
    case 'history-disclosure':
      return ChatDotRound
    case 'resource-transfer':
      return Switch
    case 'after-sales':
      return Service
    case 'announcement':
      return Promotion
  }
}

/** 公告卡片整块可点，其余卡片只在动作按钮上响应。 */
function openIfClickable() {
  if (props.card.postId != null) {
    emit('open')
  }
}
</script>

<template>
  <li
    class="wb-item notifications-card"
    :class="[`notifications-card--${card.kind}`, { 'wb-item--clickable': card.postId != null }]"
    :role="card.postId != null ? 'button' : undefined"
    :tabindex="card.postId != null ? 0 : undefined"
    @click="openIfClickable"
    @keydown.enter.prevent="openIfClickable"
  >
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
      <div v-else-if="card.transferAction === 'respond'" class="notifications-card__actions">
        <TButton
          variant="outline"
          :disabled="respondingTransferId !== null"
          @click.stop="emit('respond', false)"
        >
          拒绝
        </TButton>
        <TButton
          variant="solid"
          tone="accent"
          :disabled="respondingTransferId !== null"
          @click.stop="emit('respond', true)"
        >
          同意接收
        </TButton>
      </div>
      <TButton
        v-else-if="card.transferAction === 'cancel'"
        variant="outline"
        :disabled="respondingTransferId !== null"
        @click.stop="emit('cancel')"
      >
        撤销申请
      </TButton>
      <TButton v-else-if="card.postId != null" variant="outline" @click.stop="emit('open')">
        查看公告
      </TButton>
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

.notifications-card--comment-warning {
  --nc-accent: var(--nc-accent-comment-warning);
}

.notifications-card--history-disclosure {
  --nc-accent: var(--nc-accent-history-disclosure);
}

.notifications-card--resource-transfer {
  --nc-accent: var(--nc-accent-resource-transfer);
}

.notifications-card--after-sales {
  --nc-accent: var(--nc-accent-after-sales);
}

.notifications-card--announcement {
  --nc-accent: var(--nc-accent-announcement);
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
