<script setup lang="ts">
/**
 * 成员列表卡：卡头给「邀请成员」，卡内逐行是成员。
 *
 * 与「我的团队」的列表项同一形态（.dev-stack-list / .dev-stack-item）；行内动作只有所有者看得到。
 * 组件只做展示与事件上报——邀请、改角色、移出、转移所有权都由页面（`useTeamDetail`）处理，
 * 自己不取数。
 */
import { TButton, TIcon, TInput, Plus } from 'ui_73info'

import { apiUrl } from '@/api/http'
import type { TeamMemberResponse } from '@/api/team'
import { teamAvatarInitial, teamRoleLabel, teamRoleToggleLabel } from '@/shared/teamDisplay'

defineProps<{
  members: TeamMemberResponse[]
  isOwner: boolean
  isAdmin: boolean
  inviteVisible: boolean
  inviting: boolean
  removingUsername: string | null
}>()

const emit = defineEmits<{
  (e: 'open-invite'): void
  (e: 'cancel-invite'): void
  (e: 'invite'): void
  (e: 'open-profile', username: string): void
  (e: 'transfer-owner', member: TeamMemberResponse): void
  (e: 'role-toggle', member: TeamMemberResponse): void
  (e: 'remove', member: TeamMemberResponse): void
}>()

/** 邀请输入框里的用户名（`v-model:invite-username` 绑到页面的 `inviteUsername`）。 */
const inviteUsername = defineModel<string>('inviteUsername', { required: true })
</script>

<template>
  <section class="dev-surface-card">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">成员</h3>
      </div>
      <div class="dev-card-head__actions">
        <button
          v-if="isAdmin && !inviteVisible"
          type="button"
          class="dev-btn dev-btn--primary"
          @click="emit('open-invite')"
        >
          <TIcon>
            <Plus />
          </TIcon>
          <span>邀请成员</span>
        </button>
      </div>
    </div>

    <div v-if="inviteVisible" class="dev-toolbar dev-team-detail__invite">
      <TInput
        v-model="inviteUsername"
        class="dev-toolbar__search"
        :maxlength="64"
        placeholder="输入用户名"
        aria-label="要邀请的用户名"
        @enter="emit('invite')"
      />
      <div class="dev-toolbar__actions">
        <TButton variant="solid" tone="accent" :loading="inviting" @click="emit('invite')">
          发送邀请
        </TButton>
        <TButton @click="emit('cancel-invite')">取消</TButton>
      </div>
    </div>

    <ul class="dev-stack-list">
      <li v-for="member in members" :key="member.username" class="dev-stack-item">
        <div class="dev-team-detail__member-main">
          <span
            class="dev-team-detail__member-avatar"
            role="button"
            tabindex="0"
            :aria-label="`查看 ${member.username} 的主页`"
            @click="emit('open-profile', member.username)"
            @keydown.enter="emit('open-profile', member.username)"
          >
            <img v-if="member.avatar_url" :src="apiUrl(member.avatar_url)" :alt="member.username" />
            <span v-else>{{ teamAvatarInitial(member.username) }}</span>
          </span>
          <div class="dev-team-detail__member-body">
            <button
              type="button"
              class="dev-team-detail__member-name"
              @click="emit('open-profile', member.username)"
            >
              {{ member.username }}
            </button>
            <div class="dev-stack-item__meta">{{ teamRoleLabel(member.role) }}</div>
          </div>
        </div>

        <div v-if="isOwner && member.role !== 'owner'" class="dev-team-detail__member-actions">
          <button
            type="button"
            class="dev-btn dev-btn--ghost"
            @click="emit('transfer-owner', member)"
          >
            设为所有者
          </button>
          <button type="button" class="dev-btn dev-btn--ghost" @click="emit('role-toggle', member)">
            {{ teamRoleToggleLabel(member.role) }}
          </button>
          <button
            type="button"
            class="dev-btn dev-btn--danger"
            :disabled="removingUsername === member.username"
            @click="emit('remove', member)"
          >
            {{ removingUsername === member.username ? '移除中...' : '移除' }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* 邀请行复用 .dev-toolbar：输入框走 .dev-toolbar__search，按钮走 TButton 的
   `variant="solid" tone="accent"` / 默认 outline。同高（36px）同圆角（10px）由
   TButton 与 TInput 自己按 `--73-control-height` / `--73-radius-control` 给出，
   与其余页面的筛选行本来就一致；这里只把输入框基宽从 240px 放宽到 280px。
   （原来按钮上挂的 `.dev-toolbar__primary` / `__ghost` 只见效于 `.el-button`，
   换成 TButton 后已失效，故一并去掉。） */
.dev-team-detail__invite .dev-toolbar__search {
  flex: 1 1 280px;
  max-width: none;
}

.dev-team-detail__member-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.dev-team-detail__member-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--wb-accent-soft);
  color: var(--dev-blue);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.dev-team-detail__member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dev-team-detail__member-body {
  min-width: 0;
}

.dev-team-detail__member-name {
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  color: var(--dev-ink);
  cursor: pointer;
  text-align: left;
}

.dev-team-detail__member-name:hover {
  color: var(--dev-blue);
}

.dev-team-detail__member-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* 触屏档：行内动作等分一行、抬高到 44px 可点区。
   （另一条 780 档 `flex-wrap` 留在页面上——见 `views/TeamDetailView.vue` 的说明。） */
@media (max-width: 640px) {
  .dev-team-detail__member-actions .dev-btn {
    flex: 1 1 0;
    min-height: 44px;
    height: auto;
  }
}
</style>
