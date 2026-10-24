<script setup lang="ts">
import { TIcon, TInput, TOption, TPagination, TSelect, Search } from 'ui_73info'
import type { ConversationHistoryDisclosure } from '@/shared/conversations'
import type { MessageFilter, MessageThread } from '@/shared/messagesThreads'
import { toneChipClass } from '@/shared/messagesThreads'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import MessagesHistoryVoteNotice from '@/components/messages/MessagesHistoryVoteNotice.vue'

/**
 * 开发者工作台的消息中心：历史沟通公开待办提示条 + 会话卡。
 *
 * 骨架、工具栏、列表与空态全部走统一层 dev-base.css 的 `.dev-*`（读数条 → 提示条 → 内容卡 →
 * 工具栏 → `.dev-stack-list`），与其余菜单页同一形态；这里只负责把行排成「主区 + 行尾 + 操作」
 * 三段，并把打开会话、清空筛选、表决这三件事 emit 出去。
 */
defineProps<{
  threads: MessageThread[]
  /** 筛选后的条数（工具栏提示与分页器总数都用它） */
  filteredCount: number
  /** 未筛选的总条数：只用于「筛选出 N / M 条」里的 M */
  allCount: number
  loading: boolean
  hasFilters: boolean
  emptyTitle: string
  votes: ConversationHistoryDisclosure[]
  votingId: number | null
}>()

const filter = defineModel<MessageFilter>('filter', { required: true })
const keyword = defineModel<string>('keyword', { required: true })
const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

const emit = defineEmits<{
  open: [thread: MessageThread]
  reset: []
  vote: [item: ConversationHistoryDisclosure, decision: 'approved' | 'rejected']
}>()
</script>

<template>
  <MessagesHistoryVoteNotice
    :items="votes"
    :voting-id="votingId"
    @vote="(item, decision) => emit('vote', item, decision)"
  />

  <section class="dev-surface-card">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">会话列表</h3>
      </div>
    </div>

    <div class="dev-toolbar">
      <TSelect v-model="filter" class="dev-toolbar__field" aria-label="消息筛选">
        <TOption label="全部" value="all" />
        <TOption label="已开启" value="active" />
        <TOption label="待同步" value="pending" />
      </TSelect>
      <TInput
        v-model="keyword"
        clearable
        class="dev-toolbar__search"
        placeholder="搜索需求编号、标题、对方或消息"
        aria-label="搜索消息"
      >
        <template #prefix>
          <TIcon>
            <Search />
          </TIcon>
        </template>
      </TInput>
      <div class="dev-toolbar__actions">
        <span v-if="hasFilters" class="dev-toolbar__hint">
          筛选出 {{ filteredCount }} / {{ allCount }} 条
        </span>
      </div>
    </div>

    <p v-if="loading" class="dev-empty-state">消息加载中…</p>

    <div v-else-if="filteredCount === 0" class="dev-empty-state">
      <strong class="dev-messages__empty-title">{{ emptyTitle }}</strong>
      <div v-if="hasFilters" class="dev-list-actions dev-messages__empty-actions">
        <button class="dev-btn dev-btn--ghost" type="button" @click="emit('reset')">
          清空筛选
        </button>
      </div>
    </div>

    <ul v-else class="dev-stack-list">
      <li
        v-for="item in threads"
        :key="item.key"
        class="dev-stack-item dev-messages__thread"
        :class="{ 'dev-messages__thread--pending': item.kind === 'pending' }"
        role="button"
        tabindex="0"
        @click="emit('open', item)"
        @keydown.enter.prevent="emit('open', item)"
      >
        <div class="dev-messages__thread-main">
          <div class="dev-messages__thread-head">
            <strong class="dev-stack-item__title dev-messages__thread-title">{{
              item.title
            }}</strong>
            <span
              v-if="item.unreadCount > 0"
              class="dev-messages__thread-unread"
              :title="`${item.unreadCount} 条未读消息`"
              >{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</span
            >
            <span class="dev-chip" :class="toneChipClass(item.tone)">{{ item.statusLabel }}</span>
          </div>
          <div class="dev-stack-item__meta dev-messages__thread-sub">
            {{ item.requirementId }} · {{ item.modeLabel }}
          </div>
          <p class="dev-messages__thread-desc">{{ item.description }}</p>
        </div>
        <div class="dev-messages__thread-side">
          <span>{{ item.partnerLabel }}</span>
          <time>{{ item.lastLabel }}</time>
        </div>
        <span class="dev-btn dev-btn--primary dev-messages__thread-action">{{
          item.actionLabel
        }}</span>
      </li>
    </ul>

    <!-- 表尾走统一层的 .dev-pager（与我的接单、收益钱包、需求大厅同一形态） -->
    <div v-if="!loading && filteredCount > 0" class="dev-pager">
      <div class="dev-pager__count">
        <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
          <TOption
            v-for="size in LIST_PAGE_SIZES"
            :key="size"
            :label="`${size} 条/页`"
            :value="size"
          />
        </TSelect>
      </div>
      <TPagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="filteredCount"
        :pager-count="5"
        background
        aria-label="会话分页"
      />
    </div>
  </section>
</template>
