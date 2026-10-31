<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Plus, Search, TIcon } from 'ui_73info'

import type { MessageThread } from '@/shared/messagesThreads'

defineProps<{
  threads: MessageThread[]
  selectedRequirementId: string
  loading: boolean
}>()

const keyword = defineModel<string>('keyword', { required: true })

const emit = defineEmits<{
  select: [thread: MessageThread]
  compose: []
  pin: [thread: MessageThread, pinned: boolean]
  remove: [thread: MessageThread]
}>()

const LONG_PRESS_MS = 500
const LONG_PRESS_MOVE_PX = 8
const MENU_WIDTH = 132
const MENU_HEIGHT = 92
/** 刚弹出菜单的这段时间里忽略点击：长按松手的那一下会落在菜单上。 */
const MENU_OPEN_GUARD_MS = 300

const menuThread = ref<MessageThread | null>(null)
const menuX = ref(0)
const menuY = ref(0)
let menuOpenedAt = 0
let menuOpenedByLongPress = false
let longPressTimer: number | null = null
let longPressStart = { x: 0, y: 0 }
let suppressNextClick = false

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

function clampMenuPosition(x: number, y: number) {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8)),
  }
}

function openThreadMenu(thread: MessageThread, x: number, y: number, byLongPress = false) {
  const position = clampMenuPosition(x, y)
  menuThread.value = thread
  menuX.value = position.x
  menuY.value = position.y
  menuOpenedAt = Date.now()
  menuOpenedByLongPress = byLongPress
}

function closeThreadMenu() {
  menuThread.value = null
  menuOpenedByLongPress = false
}

function clearLongPress() {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function onRowPointerDown(thread: MessageThread, event: PointerEvent) {
  // 每次新的按下都清掉上一次长按留下的点击抑制，避免它误吞下一次正常点击
  suppressNextClick = false
  if (event.pointerType === 'mouse') {
    return
  }

  clearLongPress()
  longPressStart = { x: event.clientX, y: event.clientY }
  longPressTimer = window.setTimeout(() => {
    longPressTimer = null
    suppressNextClick = true
    // 菜单弹在手指上方，避免松手那一下点到菜单；守卫仍然兜住「菜单压在手指下面」的边角
    openThreadMenu(thread, longPressStart.x, longPressStart.y - MENU_HEIGHT - 12, true)
  }, LONG_PRESS_MS)
}

function onRowPointerMove(event: PointerEvent) {
  if (longPressTimer === null) {
    return
  }

  const distance = Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y)
  if (distance > LONG_PRESS_MOVE_PX) {
    clearLongPress()
  }
}

function onRowClick(thread: MessageThread) {
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }

  emit('select', thread)
}

function togglePin() {
  const thread = menuThread.value
  if (!thread || isMenuOpeningFromLongPress()) {
    return
  }

  emit('pin', thread, !thread.pinned)
  closeThreadMenu()
}

function removeSelectedThread() {
  const thread = menuThread.value
  if (!thread || isMenuOpeningFromLongPress()) {
    return
  }

  emit('remove', thread)
  closeThreadMenu()
}

/** 长按松手可能触发一次落在菜单上的点击；只有这一下需要忽略，右键打开的菜单立即可点。 */
function isMenuOpeningFromLongPress() {
  return menuOpenedByLongPress && Date.now() - menuOpenedAt < MENU_OPEN_GUARD_MS
}

function onWindowPointerDown(event: PointerEvent) {
  if (!menuThread.value) {
    return
  }

  const target = event.target as Element | null
  if (target?.closest('.workbench-inbox__menu')) {
    return
  }
  closeThreadMenu()
}

function onWindowKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeThreadMenu()
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDown, true)
  window.addEventListener('keydown', onWindowKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown, true)
  window.removeEventListener('keydown', onWindowKeyDown)
  clearLongPress()
})
</script>

<template>
  <section class="workbench-inbox" aria-label="会话列表">
    <header class="workbench-inbox__header">
      <div>
        <h1>消息</h1>
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

    <div class="workbench-inbox__list" @scroll.passive="closeThreadMenu">
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
            'is-pinned': thread.pinned,
          }"
          type="button"
          :aria-current="thread.requirementId === selectedRequirementId ? 'true' : undefined"
          @click="onRowClick(thread)"
          @contextmenu.prevent="openThreadMenu(thread, $event.clientX, $event.clientY)"
          @pointerdown="onRowPointerDown(thread, $event)"
          @pointermove="onRowPointerMove"
          @pointerup="clearLongPress"
          @pointercancel="clearLongPress"
          @pointerleave="clearLongPress"
        >
          <span class="workbench-inbox__avatar" :class="avatarTone(thread)">
            {{ avatarText(thread) }}
            <i aria-hidden="true" />
          </span>

          <span class="workbench-inbox__body">
            <span class="workbench-inbox__title-row">
              <strong>{{ thread.title }}</strong>
              <span v-if="thread.pinned" class="workbench-inbox__pin">置顶</span>
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

    <Teleport to="body">
      <div
        v-if="menuThread"
        class="workbench-inbox__menu"
        role="menu"
        :style="{ left: `${menuX}px`, top: `${menuY}px` }"
        @contextmenu.prevent
      >
        <button type="button" role="menuitem" @click="togglePin">
          {{ menuThread.pinned ? '取消置顶' : '置顶' }}
        </button>
        <button
          type="button"
          role="menuitem"
          class="workbench-inbox__menu-danger"
          @click="removeSelectedThread"
        >
          删除
        </button>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="./workbench-chat-inbox.css"></style>
<style scoped src="./workbench-chat-inbox-menu.css"></style>
<style scoped src="./workbench-chat-inbox-responsive.css"></style>
