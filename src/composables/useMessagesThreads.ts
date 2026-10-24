import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { RequirementConversation } from '@/shared/conversations'
import type { RequirementItem } from '@/api/requirements'
import { useClientPagination } from '@/composables/useClientPagination'
import {
  buildConversationThread,
  buildPendingThread,
  hasBoundResource,
  isRecent,
  messagesEmptyTitle,
  type MessageFilter,
  type MessageThread,
} from '@/shared/messagesThreads'

/**
 * 会话列表的「行」这一层：两份原始数据（会话 + 需求）→ 列表行 → 筛选 / 搜索 / 客户端分页。
 *
 * 两处容易搞混的口径都在这里定死：
 * - 「已开启会话」只认 `status === 'open'` 的会话记录；
 * - 「待同步会话」是已接取、绑过资源、没结单、且本地还没有会话记录的需求（打开后才建会话）。
 *
 * 筛选与关键词的 state 也留在这里：换筛选或关键词必须回第 1 页，两件事写在一处才不会漏。
 */
export function useMessagesThreads(options: {
  conversations: Ref<RequirementConversation[]>
  requirements: Ref<RequirementItem[]>
  username: ComputedRef<string>
}) {
  const activeFilter = ref<MessageFilter>('all')
  const searchKeyword = ref('')

  const requirementById = computed(() =>
    Object.fromEntries(options.requirements.value.map((item) => [item.requirement_id, item])),
  )
  const conversationRequirementIds = computed(
    () => new Set(options.conversations.value.map((item) => item.requirement_id)),
  )
  const activeConversations = computed(() =>
    options.conversations.value.filter((item) => item.status === 'open'),
  )
  const readyRequirements = computed(() =>
    options.requirements.value.filter(
      (item) => hasBoundResource(item) && item.status !== 'completed',
    ),
  )
  /** 已接取、但本地还没拿到会话记录——打开后才建会话，列表里单独一组「会话待开启」。 */
  const pendingRequirements = computed(() =>
    readyRequirements.value.filter(
      (item) => !conversationRequirementIds.value.has(item.requirement_id),
    ),
  )
  const conversationThreads = computed<MessageThread[]>(() =>
    activeConversations.value.map((item) =>
      buildConversationThread(item, {
        requirementById: requirementById.value,
        username: options.username.value,
      }),
    ),
  )
  const pendingThreads = computed<MessageThread[]>(() =>
    pendingRequirements.value.map(buildPendingThread),
  )
  const allThreads = computed<MessageThread[]>(() =>
    [...conversationThreads.value, ...pendingThreads.value].sort(
      (left, right) => right.sortTime - left.sortTime,
    ),
  )
  const filteredThreads = computed(() => {
    const normalizedKeyword = searchKeyword.value.trim().toLowerCase()
    const matchesKeyword = (item: MessageThread) => {
      if (!normalizedKeyword) {
        return true
      }

      return [
        item.requirementId,
        item.title,
        item.statusLabel,
        item.modeLabel,
        item.partnerLabel,
        item.lastLabel,
        item.description,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword)
    }

    if (activeFilter.value === 'active') {
      return conversationThreads.value.filter(matchesKeyword)
    }
    if (activeFilter.value === 'pending') {
      return pendingThreads.value.filter(matchesKeyword)
    }
    return allThreads.value.filter(matchesKeyword)
  })

  /* 表尾分页：会话一次取回全部、筛选与搜索都在前端做，所以这里是客户端切片（与资源项目、
     我的接单同一套）。换筛选或关键词要回第 1 页，否则会停在一个已经不存在的页码上。 */
  const {
    page,
    pageSize,
    total: filteredTotal,
    paged: pagedThreads,
    resetPage,
  } = useClientPagination(filteredThreads)

  watch([activeFilter, searchKeyword], resetPage)

  const recentConversationCount = computed(
    () =>
      activeConversations.value.filter((item) => isRecent(item.last_message_at ?? item.updated_at))
        .length,
  )

  /** 工具栏右侧的「筛选出 N / M 条」只在搜索或筛选生效时出现，与其余菜单页同一口径 */
  const hasActiveThreadFilters = computed(
    () => searchKeyword.value.trim() !== '' || activeFilter.value !== 'all',
  )
  const threadEmptyTitle = computed(() =>
    messagesEmptyTitle(searchKeyword.value, activeFilter.value),
  )

  function resetThreadFilters() {
    searchKeyword.value = ''
    activeFilter.value = 'all'
  }

  return {
    filter: activeFilter,
    keyword: searchKeyword,
    activeConversationCount: computed(() => activeConversations.value.length),
    pendingThreadCount: computed(() => pendingThreads.value.length),
    recentConversationCount,
    threads: pagedThreads,
    filteredCount: filteredTotal,
    /** 整份会话行（未筛选、未分页）：路由 query 要在这上面找会话，工具栏的 M 也取它的长度 */
    allThreads,
    allCount: computed(() => allThreads.value.length),
    page,
    pageSize,
    hasActiveThreadFilters,
    threadEmptyTitle,
    resetThreadFilters,
  }
}
