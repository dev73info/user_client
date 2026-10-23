<script setup lang="ts">
import { Bell, TButton, TIcon } from 'ui_73info'

import type { ConversationCardSide, ConversationCardMeta } from '@/shared/conversationCards'
import { formatMessageClock } from '@/shared/conversationTime'
import type { RequirementConversationMessage } from '@/shared/conversations'

/**
 * 时间线上的状态变化卡片（结单、验收、支付、交付……）。
 *
 * 从 `RequirementConversationModal.vue` 的时间线里整块搬出来。卡片上能摆哪颗按钮仍由
 * 父组件算好的 card 与工具条能力决定，这里只负责把点击往外 emit：
 * 支付 / 通用动作 / 去交付 / 验收四条路径各自回到原来的处理函数。
 */
defineProps<{
  card: ConversationCardMeta
  /** 卡片靠哪一侧：我方靠右、对方靠左、平台通知居中。 */
  cardSide?: ConversationCardSide
  createdAt?: string
  message?: RequirementConversationMessage
  /** 「下载交付产物」在飞：按钮显示加载态。 */
  downloadLoading: boolean
  canDeliver: boolean
  canAcceptDelivery: boolean
}>()

const emit = defineEmits<{
  payment: []
  action: [card: ConversationCardMeta, message?: RequirementConversationMessage]
  deliver: []
  accept: []
}>()
</script>

<template>
  <article class="conversation-card" :class="`conversation-card--${cardSide ?? 'system'}`">
    <div class="conversation-card__head">
      <TIcon class="conversation-card__icon">
        <Bell />
      </TIcon>
      <strong>{{ card.title }}</strong>
    </div>
    <p class="conversation-card__desc">{{ card.description }}</p>
    <div class="conversation-card__foot">
      <time :title="createdAt">{{ formatMessageClock(createdAt) }}</time>
      <div class="conversation-card__actions">
        <!-- 「支付定金 / 支付尾款」不跳需求列表：支付弹窗就在同一条会话底部
             的工具条上，按下去原地打开它。
             卡片侧的 `paymentAction` 已按需求当前状态裁定（待缴定金 / 待付尾款）；
             不再叠加 `actionCaps.canPay`——工具条加载合同签署状态偶发慢半拍时，
             会把「验收已通过」上该有的「支付尾款」整颗藏掉。弹窗与真正能否付
             仍归工具条管。 -->
        <TButton
          v-if="card.paymentAction"
          class="conversation-card__action"
          variant="solid"
          tone="accent"
          size="sm"
          @click="emit('payment')"
        >
          {{ card.actionLabel }}
        </TButton>
        <TButton
          v-else-if="card.actionLabel && !card.deliveryAction && !card.paymentAction"
          class="conversation-card__action"
          variant="solid"
          tone="accent"
          size="sm"
          :loading="downloadLoading && card.downloadDelivery"
          @click="emit('action', card, message)"
        >
          {{ card.actionLabel }}
        </TButton>
        <!-- 「去交付」不跳需求列表：交付弹窗就挂在同一条会话底部的工具条上，
             按下去原地打开它。能不能交付仍由工具条裁定（没绑资源项目、阶段不对都不给），
             条件不够时这张卡片就不摆按钮，不给出点了没反应的入口。 -->
        <TButton
          v-else-if="card.deliveryAction && canDeliver"
          class="conversation-card__action"
          variant="solid"
          tone="accent"
          size="sm"
          @click="emit('deliver')"
        >
          {{ card.actionLabel }}
        </TButton>
        <!-- 验收按钮摆在「下载交付产物」之后：这张卡片说的就是「请验收后支付尾款」，
             顺手就能做。能不能验收仍由工具条裁定（自管模式、合同未签、没有交付版本
             都不给），弹窗也归它管，避免两处各写一套条件。 -->
        <TButton
          v-if="card.acceptanceAction && canAcceptDelivery"
          class="conversation-card__action"
          variant="solid"
          tone="accent"
          size="sm"
          @click="emit('accept')"
        >
          验收
        </TButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* 状态变化卡片：靠哪一侧看这一步是谁做的（会话里的气泡也是这套左右口径）——
   我方发起靠右、对方发起靠左、纯平台通知（结单、客服裁决、超时兜底）居中。
   居中那一类见下面的 `--system`：它不摆卡片外框，只留一行居中的系统说明。
   卡片宽度小于消息列，auto 外边距才能在剩余空间里把它推到对应一侧。 */
.conversation-card {
  display: grid;
  gap: 6px;
  width: min(420px, 92%);
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--73-accent) 22%, transparent);
  border-radius: 12px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--73-accent-soft) 96%, transparent),
    color-mix(in srgb, var(--73-surface-strong) 98%, transparent)
  );
}

.conversation-card--other {
  margin-right: auto;
}

.conversation-card--mine {
  margin-left: auto;
}

/* 平台通知（居中那一类）不摆卡片：去掉边框、底色与圆角，只留居中说明，读起来是
   「系统在播报进度」，而不是某一方发来的一张卡片。带按钮的通知（如「去需求大厅」）
   按钮跟着文字一起居中，不因为去掉外框丢掉出口。 */
.conversation-card--system {
  width: min(520px, 100%);
  margin-right: auto;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  justify-items: center;
  text-align: center;
}

.conversation-card--system .conversation-card__head {
  justify-content: center;
  color: var(--73-ink-muted);
}

.conversation-card--system .conversation-card__desc {
  color: var(--73-ink-placeholder);
}

.conversation-card--system .conversation-card__foot {
  justify-content: center;
}

.conversation-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--73-accent);
  font-size: 13.5px;
}

.conversation-card__icon {
  font-size: 15px;
}

.conversation-card__desc {
  margin: 0;
  color: var(--73-ink-soft);
  font-size: 12.5px;
  line-height: 1.6;
  word-break: break-word;
}

.conversation-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.conversation-card__foot time {
  color: var(--73-ink-placeholder);
  font-size: 11.5px;
}

/* 卡片脚上的按钮组：时间在左、按钮在右，按钮之间的间距交给 gap。
   相邻间距原来还要清掉 Element Plus 给两个 el-button 叠的那层 margin-left，
   换成 TButton 之后组件本身不产生外边距，那条规则随之删掉。 */
.conversation-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.conversation-card .conversation-card__action {
  min-height: 32px;
}

@media (max-width: 640px) {
  .conversation-card {
    /* 手机上也要看得出卡片靠哪一侧：留出与气泡同一量级的对侧空档，
       满宽铺开会让「我方发起 / 对方发起 / 平台通知」三种摆法长得一模一样。 */
    width: calc(100% - 34px);
    padding: 10px 12px;
  }

  /* 平台通知没有卡片外框，也就不需要对侧空档：文字居中本身就是它的位置。 */
  .conversation-card--system {
    width: 100%;
    padding: 0;
  }

  /* 外观 32px，触摸目标靠伪元素上下各扩 6px 凑足 44px */
  .conversation-card .conversation-card__action {
    position: relative;
    min-height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
  }

  .conversation-card .conversation-card__action::after {
    content: '';
    position: absolute;
    inset: -6px 0;
  }
}
</style>
