<script setup lang="ts">
import {
  TButton,
  TIcon,
  TInput,
  TOption,
  TPagination,
  TSelect,
  RefreshLeft,
  Search,
} from 'ui_73info'
import type { ConversationHistoryDisclosure } from '@/shared/conversations'
import type { MessageFilter, MessageThread } from '@/shared/messagesThreads'
import { toneBadgeClass } from '@/shared/messagesThreads'
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import MessagesHistoryDisclosurePanel from '@/components/messages/MessagesHistoryDisclosurePanel.vue'

/**
 * 门户侧的消息中心：历史沟通公开申请面板 + 会话卡。
 *
 * 版式走统一层 portal-workbench.css 的 `.wb-*`（卡头 / 工具栏 / 列表 / 空态 / 徽标 / 分页），
 * 与「我的需求」「系统通知」是同一套；这里只把行排成「主区（标题 + 编号 + 预览）+
 * 右列（状态 → 对方 → 时间）」，并把打开会话、清空筛选、表决三件事 emit 出去。
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
  <section class="wallet-section">
    <div class="wb-card-head">
      <div class="wb-card-head__title-block">
        <h3 class="wb-card-head__title">会话列表</h3>
      </div>
    </div>

    <div class="wb-toolbar">
      <TSelect v-model="filter" class="wb-toolbar__field" aria-label="消息筛选">
        <TOption label="全部" value="all" />
        <TOption label="已开启" value="active" />
        <TOption label="待同步" value="pending" />
      </TSelect>
      <TInput
        v-model="keyword"
        clearable
        class="wb-toolbar__search"
        placeholder="搜索需求标题、编号、对方或消息"
        aria-label="搜索消息"
      >
        <template #prefix>
          <TIcon>
            <Search />
          </TIcon>
        </template>
      </TInput>
      <div class="wb-toolbar__actions">
        <span v-if="hasFilters" class="wb-toolbar__hint">
          筛选出 {{ filteredCount }} / {{ allCount }} 条
        </span>
        <TButton variant="outline" v-if="hasFilters" @click="emit('reset')">
          <TIcon>
            <RefreshLeft />
          </TIcon>
          <span>重置</span>
        </TButton>
      </div>
    </div>

    <MessagesHistoryDisclosurePanel
      :items="votes"
      :voting-id="votingId"
      @vote="(item, decision) => emit('vote', item, decision)"
    />

    <p v-if="loading" class="wb-empty" role="status">消息加载中…</p>
    <div v-else-if="filteredCount === 0 && votes.length === 0" class="wb-empty">
      <span class="wb-empty__title">{{ emptyTitle }}</span>
      <div v-if="hasFilters" class="wb-empty__actions">
        <TButton variant="outline" @click="emit('reset')">
          <TIcon>
            <RefreshLeft />
          </TIcon>
          <span>清除筛选</span>
        </TButton>
      </div>
    </div>
    <ul v-else class="wb-list" aria-label="会话列表">
      <li
        v-for="item in threads"
        :key="item.key"
        class="wb-item wb-item--clickable messages-thread-row"
        role="button"
        tabindex="0"
        @click="emit('open', item)"
        @keydown.enter.prevent="emit('open', item)"
      >
        <div class="wb-item__main">
          <span class="messages-thread-row__head">
            <strong class="wb-item__title">{{ item.title }}</strong>
            <em
              v-if="item.unreadCount > 0"
              class="messages-thread-row__unread"
              :title="`${item.unreadCount} 条未读消息`"
              >{{ item.unreadCount > 99 ? '99+' : item.unreadCount }}</em
            >
          </span>
          <span class="wb-item__meta">{{ item.requirementId }} · {{ item.modeLabel }}</span>
          <span class="wb-item__meta messages-thread-row__preview">{{ item.description }}</span>
        </div>
        <div class="wb-item__side">
          <span :class="toneBadgeClass(item.tone)">{{ item.statusLabel }}</span>
          <span class="wb-item__meta messages-thread-row__partner">{{ item.partnerLabel }}</span>
          <span class="wb-item__meta messages-thread-row__time">{{ item.lastLabel }}</span>
        </div>
      </li>
    </ul>

    <!-- 表尾走统一层的 .wb-pager（与我的需求、系统通知同一形态） -->
    <div v-if="!loading && filteredCount > 0" class="wb-pager">
      <div class="wb-pager__count">
        <TSelect v-model="pageSize" class="wb-pager__size" aria-label="每页会话数">
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
