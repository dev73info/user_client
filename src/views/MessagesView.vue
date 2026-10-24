<script setup lang="ts">
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import MessagesOverviewStrip from '@/components/messages/MessagesOverviewStrip.vue'
import MessagesDevPanel from '@/components/messages/MessagesDevPanel.vue'
import MessagesPortalPanel from '@/components/messages/MessagesPortalPanel.vue'
import { useMessagesPage } from '@/composables/useMessagesPage'
import '@/styles/messages.css'

/**
 * 消息中心（三个入口共用：独立 /messages、用户工作台、开发者工作台）。
 *
 * 页面只剩四段结构：顶部读数条 / 内嵌会话区 / 开发者会话卡 / 门户会话卡。
 * 取数、实时订阅、打开会话（写 `?requirement_id=` 路由 query）、筛选分页都在
 * `useMessagesPage` 与它下面的 `useMessagesThreads` / `useMessagesHistoryVotes` 里；
 * 区块组件只接收展示值、通过 emit 把动作递上来，不直接碰 router / 消息 / 接口。
 *
 * 打开会话时由 `RequirementConversationModal` 以内嵌形态（display-mode="inline"）顶上整页，
 * 它内部的行为不在本页；本页只负责把 requirement-id / title / api-mode 传对。
 */
const {
  isDevWorkbench,
  loading,
  filter,
  keyword,
  threads,
  filteredCount,
  allCount,
  page,
  pageSize,
  activeConversationCount,
  pendingThreadCount,
  recentConversationCount,
  hasActiveThreadFilters,
  threadEmptyTitle,
  activeRequirementId,
  activeTitle,
  token,
  username,
  pendingHistoryVotes,
  historyVotingId,
  respondHistoryDisclosure,
  refresh,
  openThread,
  closeConversation,
  applyConversationDetail,
  resetThreadFilters,
} = useMessagesPage()
</script>

<template>
  <main
    :class="isDevWorkbench ? 'dev-page' : 'page-shell custom-page-shell profile-page messages-page'"
  >
    <!-- 顶部读数条：页面级刷新只留这一个入口（读数条右侧 __action 槽），卡片头不再重复给一颗 -->
    <WorkbenchBarSlot>
      <MessagesOverviewStrip
        v-if="!activeRequirementId"
        :dev="isDevWorkbench"
        :loading="loading"
        :conversation-count="activeConversationCount"
        :pending-count="pendingThreadCount"
        :recent-count="recentConversationCount"
        @refresh="refresh"
      />
    </WorkbenchBarSlot>

    <RequirementConversationModal
      v-if="activeRequirementId"
      display-mode="inline"
      :visible="true"
      :token="token"
      :api-mode="isDevWorkbench ? 'dev' : 'user'"
      :current-username="username"
      :requirement-id="activeRequirementId"
      :title="activeTitle"
      @updated="applyConversationDetail"
      @close="closeConversation"
    />

    <!-- 开发者工作台：提示条 + 内容卡，与其余菜单页同一形态（读数条 → 提示条 → 内容卡） -->
    <MessagesDevPanel
      v-else-if="isDevWorkbench"
      v-model:filter="filter"
      v-model:keyword="keyword"
      v-model:page="page"
      v-model:page-size="pageSize"
      :threads="threads"
      :filtered-count="filteredCount"
      :all-count="allCount"
      :loading="loading"
      :has-filters="hasActiveThreadFilters"
      :empty-title="threadEmptyTitle"
      :votes="pendingHistoryVotes"
      :voting-id="historyVotingId"
      @open="openThread"
      @reset="resetThreadFilters"
      @vote="respondHistoryDisclosure"
    />

    <!-- 门户 / 独立入口：申请面板 + 会话卡（.wb-* 那一套） -->
    <MessagesPortalPanel
      v-else
      v-model:filter="filter"
      v-model:keyword="keyword"
      v-model:page="page"
      v-model:page-size="pageSize"
      :threads="threads"
      :filtered-count="filteredCount"
      :all-count="allCount"
      :loading="loading"
      :has-filters="hasActiveThreadFilters"
      :empty-title="threadEmptyTitle"
      :votes="pendingHistoryVotes"
      :voting-id="historyVotingId"
      @open="openThread"
      @reset="resetThreadFilters"
      @vote="respondHistoryDisclosure"
    />
  </main>
</template>
