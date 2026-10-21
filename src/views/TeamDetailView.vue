<script setup lang="ts">
/**
 * 团队详情（开发者工作台 `/dev/teams/:teamId`）。
 *
 * 这一页只负责排版与组合：
 * - 取数、邀请、成员动作、退出 / 解散、编辑资料与换头像 → `useTeamDetail`；
 * - 顶部读数条 → `TeamDetailSummaryStrip`；
 * - 团队资料（含编辑表单）→ `TeamProfileCard` / `TeamProfileForm`；
 * - 成员列表与行内动作 → `TeamMemberListCard`；
 * - 角色文案、卡头元信息、头像首字 → `@/shared/teamDisplay`。
 */
import TeamDetailSummaryStrip from '@/components/team/TeamDetailSummaryStrip.vue'
import TeamMemberListCard from '@/components/team/TeamMemberListCard.vue'
import TeamProfileCard from '@/components/team/TeamProfileCard.vue'
import { useTeamDetail } from '@/composables/useTeamDetail'

const {
  team,
  loading,
  isOwner,
  isAdmin,
  canManageTeam,
  canLeaveTeam,
  myRoleLabel,
  loadTeam,
  inviting,
  inviteUsername,
  showInviteInput,
  openInvite,
  cancelInvite,
  handleInvite,
  removingUsername,
  handleRemove,
  handleRoleToggle,
  handleTransferOwner,
  goMemberProfile,
  handleLeave,
  handleDelete,
  editingName,
  saving,
  startEdit,
  cancelEdit,
  saveEdit,
  avatarUploading,
  handleAvatarFile,
} = useTeamDetail()
</script>

<template>
  <div class="dev-page dev-team-detail">
    <!-- 顶部读数条：与其余菜单页同一条形态（读数在左、刷新在右）。
         这一页原来直接从一块裸的 hero 区块开始，没有读数横条，切菜单时整页骨架都换了。 -->
    <TeamDetailSummaryStrip
      :loading="loading"
      :member-count="team?.members.length ?? 0"
      :my-role-label="myRoleLabel"
      :owner-username="team?.owner_username"
      @refresh="loadTeam"
    />

    <p v-if="loading" class="dev-empty-state">团队加载中…</p>
    <p v-else-if="!team" class="dev-empty-state">团队不存在，或你已不在该团队中</p>

    <template v-else>
      <!-- 团队资料：卡片头报名字与简介，头像与编辑表单在卡片体内 -->
      <TeamProfileCard
        :team="team"
        :is-owner="isOwner"
        :can-leave="canLeaveTeam"
        :can-manage-team="canManageTeam"
        :editing="editingName"
        :saving="saving"
        :avatar-uploading="avatarUploading"
        @start-edit="startEdit"
        @delete="handleDelete"
        @leave="handleLeave"
        @avatar-file="handleAvatarFile"
        @save="saveEdit"
        @cancel="cancelEdit"
      />

      <!-- 成员列表：与「我的团队」的列表项同一形态（.dev-stack-list / .dev-stack-item） -->
      <TeamMemberListCard
        v-model:invite-username="inviteUsername"
        :members="team.members"
        :is-owner="isOwner"
        :is-admin="isAdmin"
        :invite-visible="showInviteInput"
        :inviting="inviting"
        :removing-username="removingUsername"
        @open-invite="openInvite"
        @cancel-invite="cancelInvite"
        @invite="handleInvite"
        @open-profile="goMemberProfile"
        @transfer-owner="handleTransferOwner"
        @role-toggle="handleRoleToggle"
        @remove="handleRemove"
      />
    </template>
  </div>
</template>

<style scoped>
/* 成员行的动作组在窄屏要换行。这一条原本和 640 档写在一起，现在 640 档随
   `TeamMemberListCard` 走了（`min-height: 44px` 那组就是），780 这一档留在页面上：
   780 不是标准化允许的档位（640 / 900 / 1180），而检查脚本按「文件」记存量违规——
   把它搬进新组件会被算成一条新增违规。等这一档收进标准档位时整条搬进组件即可。 */
/* R047 断点收敛：原档位 780px → 640px */
@media (max-width: 640px) {
  .dev-team-detail :deep(.dev-team-detail__member-actions) {
    flex-wrap: wrap;
  }
}
</style>
