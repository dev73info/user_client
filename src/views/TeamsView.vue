<script setup lang="ts">
/**
 * 「我的团队」列表（开发者工作台 `/workbench/teams`）。
 *
 * 这一页只负责排版与组合：
 * - 团队列表、排序、工具条筛选、创建 / 解散 / 退出、跳转详情 → `useTeams`；
 * - 收到的邀请（取数 / 接受 / 拒绝）→ `useTeamInvitations`（接完把团队列表重拉一遍）；
 * - 顶部读数条留在页面（`WorkbenchBarSlot` 里）：我的团队 / 我创建的 / 待处理邀请 + 刷新；
 * - 邀请卡 → `TeamInvitationList`；团队卡（工具条 + 空态 + 列表）→ `TeamListCard`，
 *   单行 → `TeamCardItem`；创建弹窗 → `TeamCreateDialog`；
 * - 排序、筛选、邀请时间等纯函数 → `@/shared/teamDisplay`。
 */
import { TButton, TIcon, Refresh } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import TeamCreateDialog from '@/components/team/TeamCreateDialog.vue'
import TeamInvitationList from '@/components/team/TeamInvitationList.vue'
import TeamListCard from '@/components/team/TeamListCard.vue'
import { useTeamInvitations } from '@/composables/useTeamInvitations'
import { useTeams } from '@/composables/useTeams'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const {
  teams,
  loading,
  ownedCount,
  filteredTeams,
  filters,
  loadTeams,
  showCreateModal,
  createName,
  createDesc,
  creating,
  openCreateModal,
  handleCreate,
  deletingId,
  handleDelete,
  handleLeave,
  goDetail,
} = useTeams()

/* 接受邀请后要重新拉一遍团队列表：与原来 `await loadTeams()` 同一口径。 */
const {
  invitations,
  invitationsLoading,
  processingInvitationId,
  loadInvitations,
  handleAcceptInvitation,
  handleRejectInvitation,
} = useTeamInvitations({ reloadTeams: loadTeams })

/** 读数条上的刷新：团队与邀请一起重取，按钮的转圈等两边都回来。 */
async function reloadAll() {
  await Promise.all([loadTeams(), loadInvitations()])
}
</script>

<template>
  <div class="dev-page dev-teams">
    <WorkbenchBarSlot>
      <div class="dev-meta-strip">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">我的团队</span>
          <span class="dev-meta-strip__value">{{ teams.length }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">我创建的</span>
          <span class="dev-meta-strip__value">{{ ownedCount }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">待处理邀请</span>
          <span class="dev-meta-strip__value">{{ invitations.length }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton
            icon-only
            aria-label="刷新团队与邀请"
            :loading="loading || invitationsLoading"
            @click="reloadAll"
          >
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <TeamInvitationList
      v-if="invitations.length"
      :invitations="invitations"
      :processing-id="processingInvitationId"
      @accept="handleAcceptInvitation"
      @reject="handleRejectInvitation"
    />

    <TeamListCard
      v-model:keyword="filters.keyword"
      v-model:scope="filters.scope"
      :teams="teams"
      :filtered-teams="filteredTeams"
      :loading="loading"
      :deleting-id="deletingId"
      :current-username="auth.username"
      @create="openCreateModal"
      @open="goDetail"
      @delete="handleDelete"
      @leave="handleLeave"
    />

    <TeamCreateDialog
      v-model:open="showCreateModal"
      v-model:name="createName"
      v-model:desc="createDesc"
      :creating="creating"
      @submit="handleCreate"
    />
  </div>
</template>
