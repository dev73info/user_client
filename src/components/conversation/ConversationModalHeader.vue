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
  realtimeStatusLabel: string
  lastMessageLabel: string
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
      <!-- 副信息一行：对方 · 实时状态 · 最近动静。原来「实时同步中」「最近 9/29 15:30」
           各占一枚同色胶囊，挨在一起看着像两个并列的标签；现在合成一行浅灰正文，
           实时状态交给前面的小圆点，头部从三行收到两行。 -->
      <p class="conversation-modal__identity-meta">
        <span class="conversation-modal__peer">{{ peerLabel }}</span>
        <span
          class="conversation-modal__live"
          :class="`conversation-modal__live--${realtimeStatus}`"
          :title="realtimeError"
        >
          {{ realtimeStatusLabel }}
        </span>
        <span class="conversation-modal__recent">{{ lastMessageLabel }}</span>
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
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.conversation-modal__header h3 {
  margin: 0;
  color: #0f172a;
  /* 标题字号只此一处：原来基础是 20px、内嵌形态覆写成 18px、身份块又覆写成 16px，
     同一颗标题在两种形态下三种大小，后两条还互相盖。两种形态一律 18px，
     触屏档再小一档（见 .conversation-modal__identity h3 的媒体查询）。 */
  font-size: 18px;
}

/* 副信息的颜色；间距、字号与截断在 .conversation-modal__identity 那两处（两种形态一致） */
.conversation-modal__header p {
  color: #64748b;
}

/* 副信息一行：对方 · 实时状态 · 最近动静。段间用一个间隔点分开，不给每段套胶囊——
   三枚同色胶囊并排会读成「三个标签」，其中时间本来就不是标签。 */
.conversation-modal__identity-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  font-size: 12px;
}

/* 段间不留「· ●」两个点挨着：实时状态前面那颗彩色圆点本身就是分隔，
   所以只在它后面补一个间隔点，把「最近 …」与前面分开。 */
.conversation-modal__identity-meta > .conversation-modal__live::after {
  content: '·';
  margin-left: 6px;
  color: #cbd5e1;
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
  background: #94a3b8;
  flex: 0 0 auto;
}

.conversation-modal__live--connected::before {
  background: #16a34a;
}

.conversation-modal__live--connecting::before {
  background: #2563eb;
}

.conversation-modal__live--error::before {
  background: #d97706;
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
  color: #0f172a;
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
  color: #64748b;
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
  color: #475569;
  font-size: 18px;
}

.conversation-modal__icon-btn:hover:not(:disabled) {
  background: #eef6ff;
  color: #1d4ed8;
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

  .conversation-modal__identity h3 {
    font-size: 15px;
  }

  /* 触屏档：时间隐掉，副信息只留「对方 · 实时状态」；上一段末尾的间隔点也要一起收，
     否则行尾吊着一个点 */
  .conversation-modal__recent {
    display: none;
  }

  .conversation-modal__identity-meta > .conversation-modal__live::after {
    content: none;
  }

  .conversation-modal__header {
    min-height: 62px;
    flex-direction: column;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    padding: 8px 10px;
  }
}

.conversation-modal__header {
  border-bottom-color: rgba(216, 228, 244, 0.95);
  background: rgba(255, 255, 255, 0.96);
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
  border-color: rgba(79, 140, 255, 0.9);
  color: #1f4ad1;
}
</style>

<style scoped src="./conversation-header-workbench-bar.css"></style>

<style scoped src="./conversation-shared.css"></style>
