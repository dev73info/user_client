<script setup lang="ts">
import { ArrowLeft, Document, Refresh, TIcon } from 'ui_73info'

import type { RealtimeStatus } from '@/composables/useRequirementConversationSession'

/**
 * 会话头：返回 · 头像 · 标题与副信息 · 详情 · 刷新。
 *
 * 从 `RequirementConversationModal.vue` 的模板里整块搬出来，行为不变：点返回、点详情都往外
 * emit，实时状态与「最近 …」的字样由父组件的派生文案传进来；内嵌形态下整块仍由
 * `WorkbenchBarSlot` 搬进工作台顶栏（那一层留在父组件，这里只管头本身）。
 */
defineProps<{
  closeActionLabel: string
  peerInitial: string
  conversationTitle: string
  peerLabel: string
  realtimeStatus: RealtimeStatus
  realtimeError: string
  /** 只有断线重连才有文案，正常时是空串（那一行就不渲染）。 */
  realtimeStatusLabel: string
  /** 需求详情抽屉是否已经打开（详情按钮的高亮与 aria-expanded）。 */
  detailOpen: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  close: []
  'toggle-detail': []
  refresh: []
}>()
</script>

<template>
  <header class="conversation-modal__header">
    <button
      class="conversation-modal__icon-btn conversation-modal__back"
      type="button"
      :aria-label="closeActionLabel"
      :title="closeActionLabel"
      @click="emit('close')"
    >
      <TIcon>
        <ArrowLeft />
      </TIcon>
    </button>

    <div class="conversation-modal__avatar" aria-hidden="true" @click="emit('toggle-detail')">
      {{ peerInitial }}
    </div>

    <!-- 点头像或标题区打开需求详情（移动端顶栏里不放详情按钮，只靠这里进入） -->
    <div
      class="conversation-modal__identity"
      role="button"
      tabindex="0"
      :aria-expanded="detailOpen"
      title="查看需求详情"
      @click="emit('toggle-detail')"
      @keydown.enter.prevent="emit('toggle-detail')"
      @keydown.space.prevent="emit('toggle-detail')"
    >
      <h3>{{ conversationTitle }}</h3>
      <!-- 副信息一行只报「对方是谁」。实时状态、最近一条消息都不放在这里：
           前者每几秒自己变色，后者「尚无消息」在空会话里等于什么都没说，
           两者叠在标题下面会一直抖动，也不让人更清楚这条会话是跟谁在谈。 -->
      <p class="conversation-modal__identity-meta">
        <span class="conversation-modal__peer">{{ peerLabel }}</span>
        <span
          v-if="realtimeStatusLabel"
          class="conversation-modal__live"
          :class="`conversation-modal__live--${realtimeStatus}`"
          :title="realtimeError"
        >
          {{ realtimeStatusLabel }}
        </span>
      </p>
    </div>

    <div class="conversation-modal__header-actions">
      <button
        class="conversation-modal__icon-btn"
        type="button"
        :class="{ 'is-active': detailOpen }"
        :aria-expanded="detailOpen"
        aria-label="需求详情"
        title="需求详情"
        @click="emit('toggle-detail')"
      >
        <TIcon>
          <Document />
        </TIcon>
      </button>
      <button
        class="conversation-modal__icon-btn"
        type="button"
        :disabled="loading"
        aria-label="刷新会话"
        title="刷新会话"
        @click="emit('refresh')"
      >
        <TIcon :spin="loading">
          <Refresh />
        </TIcon>
      </button>
    </div>
  </header>
</template>

<style scoped>
.conversation-modal__header {
  border-bottom: 1px solid color-mix(in srgb, var(--73-border) 90%, transparent);
}

.conversation-modal__header h3 {
  margin: 0;
  color: var(--73-ink);
  /* 标题字号只此一处：原来基础是 20px、内嵌形态覆写成 18px、身份块又覆写成 16px，
     同一颗标题在两种形态下三种大小，后两条还互相盖。两种形态一律 18px，
     触屏档再小一档（见 .conversation-modal__identity h3 的媒体查询）。 */
  font-size: 18px;
}

/* 副信息的颜色；间距、字号与截断在 .conversation-modal__identity 那两处（两种形态一致） */
.conversation-modal__header p {
  color: var(--73-ink-muted);
}

/* 副信息一行：对方（+ 断线时的实时状态）。原来段间还夹着一个「·」与「最近 …」，
   两段并排读成三个标签；现在只留对方，分隔点也一起删掉。 */
.conversation-modal__identity-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  font-size: 12px;
}

/* 一方名过长时自己省略，不要顶破标题栏 */
.conversation-modal__peer {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.conversation-modal__live::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--73-ink-placeholder);
  flex: 0 0 auto;
}

.conversation-modal__live--connected::before {
  background: var(--73-success);
}

.conversation-modal__live--connecting::before {
  background: var(--73-accent);
}

.conversation-modal__live--error::before {
  background: var(--73-warning);
}

.conversation-modal__header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

@media (max-width: 640px) {
  .conversation-modal__header-actions {
    width: 100%;
  }

  .conversation-modal__header-actions button {
    flex: 1;
  }
}

.conversation-modal-wrap--inline .conversation-modal__header {
  display: grid;
  align-items: center;
  padding: 10px 12px;
}

.conversation-modal__identity {
  min-width: 0;
}

.conversation-modal__identity h3 {
  margin: 0;
  overflow: hidden;
  color: var(--73-ink);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 副信息一行：排列与配色见 .conversation-modal__identity-meta。
   与标题的间距只此一处——原来基础层 6px、内嵌形态 4px、身份块 2px 三处互相盖，
   后一条写在前两条之上，改哪一处都不生效。*/
.conversation-modal__identity p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__avatar {
  width: 42px;
  height: 42px;
  font-size: 17px;
}

/* 「实时同步中 · 最近 …」那一行的胶囊底已去掉：副信息走身份块的字号与灰色（见
   .conversation-modal__identity-meta），不要在这里再补一层底色。 */

.conversation-modal__icon-btn {
  display: inline-grid;
  place-items: center;
  border: 0;
  cursor: pointer;
  transition:
    background 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.conversation-modal__icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: transparent;
  color: var(--73-ink-soft);
  font-size: 18px;
}

.conversation-modal__icon-btn:hover:not(:disabled) {
  background: var(--73-accent-soft);
  color: var(--73-accent);
}

.conversation-modal__icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* R047 断点收敛：原 820px → 640px（用户决定统一到 640） */
@media (max-width: 640px) {
  .conversation-modal__avatar {
    width: 38px;
    height: 38px;
  }

  /* 触屏档：标题与副信息都收一档，副信息只留对方 */
  .conversation-modal__identity h3 {
    font-size: 15px;
  }

  .conversation-modal__header {
    min-height: 62px;
    flex-direction: column;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    padding: 8px 10px;
  }
}

.conversation-modal__header {
  border-bottom-color: color-mix(in srgb, var(--73-accent-soft) 95%, transparent);
  background: color-mix(in srgb, var(--73-surface-strong) 96%, transparent);
  justify-content: space-between;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  min-height: 68px;
}

/* 副信息的配色见 .conversation-modal__identity-meta：一行灰字 + 彩色小圆点，不再铺胶囊底 */

.conversation-modal__header-actions .conversation-modal__icon-btn.is-active {
  border-color: color-mix(in srgb, var(--73-accent) 90%, transparent);
  color: var(--73-accent);
}
</style>

<style scoped src="./conversation-header-workbench-bar.css"></style>

<style scoped src="./conversation-shared.css"></style>
