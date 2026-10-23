<script setup lang="ts">
/**
 * 「我的团队」里的一行：头像 + 团队名 / 简介 / 成员与所有者，右侧是解散（所有者）或退出。
 *
 * 点整行进团队详情；右侧按钮 `@click.stop`，不连带跳转。
 * 组件只做展示与事件上报——解散 / 退出由页面（`useTeams`）处理，自己不取数。
 */
import { TIcon, UserFilled } from 'ui_73info'

import { apiUrl } from '@/api/http'
import type { TeamResponse } from '@/api/team'

defineProps<{
  team: TeamResponse
  isOwner: boolean
  deleting: boolean
}>()

const emit = defineEmits<{
  (e: 'open', teamId: number): void
  (e: 'delete', team: TeamResponse): void
  (e: 'leave', team: TeamResponse): void
}>()
</script>

<template>
  <article class="dev-stack-item dev-teams__card" @click="emit('open', team.team_id)">
    <div class="dev-teams__card-main">
      <span class="dev-teams__avatar">
        <img v-if="team.avatar_url" :src="apiUrl(team.avatar_url)" :alt="team.name" />
        <TIcon v-else>
          <UserFilled />
        </TIcon>
      </span>
      <div class="dev-teams__card-body">
        <div class="dev-stack-item__title">{{ team.name }}</div>
        <div class="dev-stack-item__meta">{{ team.description || '暂无团队简介' }}</div>
        <div class="dev-teams__card-meta">
          <span>{{ team.member_count }} 名成员</span>
          <span>所有者 {{ team.owner_username }}</span>
        </div>
      </div>
    </div>
    <div class="dev-teams__item-actions" @click.stop>
      <button
        v-if="isOwner"
        class="dev-btn dev-btn--danger"
        type="button"
        :disabled="deleting"
        @click="emit('delete', team)"
      >
        {{ deleting ? '解散中...' : '解散' }}
      </button>
      <button
        v-else
        class="dev-btn dev-btn--ghost"
        type="button"
        :disabled="deleting"
        @click="emit('leave', team)"
      >
        {{ deleting ? '退出中...' : '退出' }}
      </button>
    </div>
  </article>
</template>

<style scoped>
/* 本页原先自带一套视觉（渐变主按钮、22px 圆角、手写弹窗与 var(--73-border) 描边），
   与开发者工作台其余菜单页不是一个体系。现在改为统一层：顶部信息条 .dev-meta-strip、
   卡片头 .dev-card-head、列表项 .dev-stack-item、按钮 .dev-btn*、弹窗 TDialog。
   这里只保留本页特有的排版。 */
.dev-teams__item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.dev-teams__card {
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.dev-teams__card:hover {
  border-color: var(--wb-accent-line);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--dev-ink) 10%, transparent);
}

.dev-teams__card-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.dev-teams__card-body {
  min-width: 0;
}

.dev-teams__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border-radius: var(--dev-radius-inner);
  background: var(--wb-accent-soft);
  color: var(--dev-blue);
  font-size: 22px;
  overflow: hidden;
}

.dev-teams__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dev-teams__card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--dev-muted);
}

/* 触屏档：整行改成上下两块（信息在上、动作在下），按钮等分一行并抬高到 44px 可点区。 */
@media (max-width: 640px) {
  .dev-teams__card {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .dev-teams__item-actions .dev-btn {
    flex: 1 1 0;
    min-height: 44px;
    height: auto;
  }
}
</style>
