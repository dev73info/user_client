<script setup lang="ts">
/**
 * 公开主页的「收到打赏」区块：累计现金 / 积分与最近留言。
 *
 * 只在开发者开启公开记录时由父级渲染（`showReceivedTips`）；文案口径来自 `@/shared/devTip`，
 * 组件本身不碰接口。
 */
import type { PublicTipMessage } from '@/api/publicProfile'
import { formatTipTime } from '@/shared/devProfile'
import { tipperDisplayLabel } from '@/shared/devTip'

defineProps<{
  cashText: string
  pointsText: string
  messages: PublicTipMessage[]
}>()
</script>

<template>
  <section class="dev-profile__tips">
    <div class="dev-profile__section-heading">
      <div>
        <h2 class="dev-profile__section-title">收到打赏</h2>
      </div>
      <span class="dev-profile__section-count">感谢每一份支持</span>
    </div>
    <div class="dev-profile__tips-summary">
      <div class="dev-profile__tips-stat">
        <strong>{{ cashText }}</strong>
        <span>累计现金</span>
      </div>
      <div class="dev-profile__tips-stat">
        <strong>{{ pointsText }}</strong>
        <span>累计积分</span>
      </div>
    </div>
    <ul v-if="messages.length" class="dev-profile__tips-list">
      <li v-for="(tip, index) in messages" :key="index" class="dev-profile__tips-item">
        <div class="dev-profile__tips-meta">
          <span class="dev-profile__tips-name">{{ tipperDisplayLabel(tip) }}</span>
          <span class="dev-profile__tips-time">{{ formatTipTime(tip.created_at) }}</span>
        </div>
        <p v-if="tip.message" class="dev-profile__tips-message">{{ tip.message }}</p>
      </li>
    </ul>
    <p v-else class="dev-profile__tips-empty">还没有收到留言</p>
  </section>
</template>

<style>
/* 收到打赏：累计 + 最近留言 */
.dev-profile__tips-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.dev-profile__tips-stat {
  display: grid;
  gap: 4px;
  padding: 18px 16px;
  border: 1px solid var(--dp-tip-border);
  border-radius: 12px;
  background: linear-gradient(135deg, var(--dp-tip-wash), var(--dp-tip-wash-2));
  text-align: center;
}

.dev-profile__tips-stat strong {
  color: var(--dp-tip-ink-strong);
  font-size: 24px;
  font-weight: 800;
}

.dev-profile__tips-stat span {
  color: var(--dp-tip-ink);
  font-size: 13px;
}

.dev-profile__tips-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dev-profile__tips-item {
  padding: 12px 14px;
  border: 1px solid var(--dp-border-soft);
  border-radius: 12px;
  background: var(--dp-white-94);
}

.dev-profile__tips-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.dev-profile__tips-name {
  color: var(--dp-ink);
  font-size: 13px;
  font-weight: 700;
}

.dev-profile__tips-time {
  color: var(--dp-text-faint);
  font-size: 12px;
}

.dev-profile__tips-message {
  margin: 0;
  color: var(--dp-ink-muted);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.dev-profile__tips-empty {
  margin: 0;
  padding: 24px 16px;
  border: 1px dashed var(--dp-border-muted-36);
  border-radius: 12px;
  text-align: center;
  color: var(--dp-text-faint);
  font-size: 14px;
}
</style>
