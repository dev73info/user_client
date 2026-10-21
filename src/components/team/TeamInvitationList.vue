<script setup lang="ts">
/**
 * 收到的邀请卡：有邀请时才由页面挂出来，逐条是「拒绝 / 接受」。
 *
 * 与「我的团队」的列表项同一形态（`.dev-stack-list` / `.dev-stack-item`）；
 * 组件只做展示与事件上报——接受 / 拒绝由页面（`useTeamInvitations`）处理，自己不取数。
 */
import type { TeamInvitationResponse } from '@/api/team'
import { formatTeamInvitationTime } from '@/shared/teamDisplay'

defineProps<{
  invitations: TeamInvitationResponse[]
  processingId: number | null
}>()

const emit = defineEmits<{
  (e: 'accept', invitation: TeamInvitationResponse): void
  (e: 'reject', invitation: TeamInvitationResponse): void
}>()
</script>

<template>
  <section class="dev-surface-card dev-teams__invitations">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">收到的邀请</h3>
        <p class="dev-section-desc">{{ invitations.length }} 条待处理，接受后即加入该团队。</p>
      </div>
    </div>

    <ul class="dev-stack-list">
      <li v-for="inv in invitations" :key="inv.id" class="dev-stack-item">
        <div>
          <div class="dev-stack-item__title">{{ inv.team_name }}</div>
          <div class="dev-stack-item__meta">
            由 {{ inv.inviter_username }} 邀请 · {{ formatTeamInvitationTime(inv.created_at) }}
          </div>
        </div>
        <div class="dev-teams__item-actions">
          <button
            class="dev-btn dev-btn--ghost"
            type="button"
            :disabled="processingId === inv.id"
            @click="emit('reject', inv)"
          >
            拒绝
          </button>
          <button
            class="dev-btn dev-btn--primary"
            type="button"
            :disabled="processingId === inv.id"
            @click="emit('accept', inv)"
          >
            {{ processingId === inv.id ? '处理中...' : '接受' }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* 行内动作：卡片（`TeamCardItem`）与本组件同一套排版，各自带一份——
   两个组件是各自的 scope，同一份规则写两遍比在页面上用 :deep 打洞更好读。 */
.dev-teams__item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* 触屏档：两个按钮等分一行、抬高到 44px 可点区。 */
@media (max-width: 640px) {
  .dev-teams__item-actions .dev-btn {
    flex: 1 1 0;
    min-height: 44px;
    height: auto;
  }
}
</style>
