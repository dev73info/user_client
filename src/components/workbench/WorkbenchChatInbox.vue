<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Search, TIcon } from 'ui_73info'

import type { MessageThread } from '@/shared/messagesThreads'

const props = defineProps<{
  threads: MessageThread[]
  selectedRequirementId: string
  loading: boolean
  unreadCount: number
}>()

const keyword = defineModel<string>('keyword', { required: true })

const emit = defineEmits<{
  select: [thread: MessageThread]
  compose: []
}>()

const countLabel = computed(() =>
  props.unreadCount > 0
    ? `${props.threads.length} 个会话 · ${props.unreadCount} 条未读`
    : `${props.threads.length} 个会话`,
)

/** 头像取对方名的首字（「开发者：bob」取 bob）；未开启会话没有对方，退回需求标题首字。 */
function avatarText(thread: MessageThread) {
  const partner = thread.kind === 'conversation' ? thread.partnerLabel.replace(/^.*?：/, '') : ''
  const source = partner.trim() || thread.title
  return Array.from(source)[0]?.toUpperCase() || '聊'
}

function avatarTone(thread: MessageThread) {
  let hash = 0
  for (const character of thread.key) {
    hash = (hash * 31 + character.charCodeAt(0)) % 5
  }
  return `workbench-inbox__avatar--tone-${hash}`
}

function formatTime(thread: MessageThread) {
  if (!thread.sortTime) {
    return ''
  }

  const value = new Date(thread.sortTime)
  if (Number.isNaN(value.getTime())) {
    return ''
  }

  const now = new Date()
  if (value.toDateString() === now.toDateString()) {
    return value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (value.getFullYear() === now.getFullYear()) {
    return value.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  }
  return value.toLocaleDateString('zh-CN', { year: '2-digit', month: 'numeric', day: 'numeric' })
}
</script>

<template>
  <section class="workbench-inbox" aria-label="会话列表">
    <header class="workbench-inbox__header">
      <div>
        <h1>消息</h1>
        <p>{{ countLabel }}</p>
      </div>
      <button
        class="workbench-inbox__compose"
        type="button"
        aria-label="发起会话"
        title="发起会话"
        @click="emit('compose')"
      >
        <TIcon :size="21">
          <Plus />
        </TIcon>
      </button>
    </header>

    <label class="workbench-inbox__search">
      <TIcon :size="18">
        <Search />
      </TIcon>
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索聊天记录、联系人..."
        aria-label="搜索聊天记录、联系人"
      />
    </label>

    <div class="workbench-inbox__list">
      <p v-if="loading && threads.length === 0" class="workbench-inbox__state">消息加载中...</p>
      <p v-else-if="threads.length === 0" class="workbench-inbox__state">
        {{ keyword.trim() ? '没有匹配的会话' : '暂无会话' }}
      </p>

      <template v-else>
        <button
          v-for="thread in threads"
          :key="thread.key"
          class="workbench-inbox__row"
          :class="{
            'is-active': thread.requirementId === selectedRequirementId,
            'has-unread': thread.unreadCount > 0,
          }"
          type="button"
          :aria-current="thread.requirementId === selectedRequirementId ? 'true' : undefined"
          @click="emit('select', thread)"
        >
          <span class="workbench-inbox__avatar" :class="avatarTone(thread)">
            {{ avatarText(thread) }}
            <i aria-hidden="true" />
          </span>

          <span class="workbench-inbox__body">
            <span class="workbench-inbox__title-row">
              <strong>{{ thread.title }}</strong>
              <time>{{ formatTime(thread) }}</time>
            </span>
            <!-- 只有真会话才报对方是谁；「会话待开启」那一行的状态已经写在状态胶囊里，不再重复一行 -->
            <span v-if="thread.kind === 'conversation'" class="workbench-inbox__meta">
              {{ thread.partnerLabel }}
            </span>
            <span class="workbench-inbox__preview">{{ thread.description }}</span>
          </span>

          <em v-if="thread.unreadCount > 0" class="workbench-inbox__unread">
            {{ thread.unreadCount > 99 ? '99+' : thread.unreadCount }}
          </em>
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped src="./workbench-chat-inbox.css"></style>
<style scoped src="./workbench-chat-inbox-responsive.css"></style>
