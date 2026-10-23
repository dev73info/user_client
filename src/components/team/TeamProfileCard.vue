<script setup lang="ts">
/**
 * 团队资料卡：卡头报名字与简介，卡片体内是头像与编辑表单。
 *
 * 组件只做展示与事件上报：编辑、解散、退出、换头像、保存都由页面（`useTeamDetail`）处理，
 * 自己不取数。表单另拆 `TeamProfileForm`，让它的模型按打开那一刻的资料初始化。
 */
import { ref } from 'vue'
import { TIcon, EditPen } from 'ui_73info'

import { apiUrl } from '@/api/http'
import type { TeamDetailResponse } from '@/api/team'
import TeamProfileForm from '@/components/team/TeamProfileForm.vue'
import type { TeamProfileInput } from '@/composables/useTeamDetail'
import { teamAvatarEditLabel, teamAvatarInitial, teamMemberMetaLabel } from '@/shared/teamDisplay'

const props = defineProps<{
  team: TeamDetailResponse
  isOwner: boolean
  /** 非所有者才给「退出团队」（所有者走解散） */
  canLeave: boolean
  canManageTeam: boolean
  editing: boolean
  saving: boolean
  avatarUploading: boolean
}>()

const emit = defineEmits<{
  (e: 'start-edit'): void
  (e: 'delete'): void
  (e: 'leave'): void
  (e: 'avatar-file', file: File): void
  (e: 'save', payload: TeamProfileInput): void
  (e: 'cancel'): void
}>()

/** 头像用的隐藏文件输入框：按钮在头像上，真正的 input 只留 ref。 */
const avatarInput = ref<HTMLInputElement | null>(null)

function triggerAvatarSelect() {
  if (!props.canManageTeam) return
  avatarInput.value?.click()
}

function handleAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  // 选完立刻清空 value，否则同一张图连选两次不会再触发 change（上传结果由页面回写）
  input.value = ''
  if (!file) return
  emit('avatar-file', file)
}
</script>

<template>
  <section class="dev-surface-card">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">{{ team.name }}</h3>
        <p class="dev-section-desc">{{ team.description || '暂无团队简介' }}</p>
        <p class="dev-team-detail__meta">
          {{ teamMemberMetaLabel(team.members.length, team.owner_username) }}
        </p>
      </div>
      <div class="dev-card-head__actions">
        <button
          v-if="isOwner && !editing"
          type="button"
          class="dev-btn dev-btn--ghost"
          @click="emit('start-edit')"
        >
          <TIcon>
            <EditPen />
          </TIcon>
          <span>编辑资料</span>
        </button>
        <button
          v-if="isOwner && !editing"
          type="button"
          class="dev-btn dev-btn--danger"
          @click="emit('delete')"
        >
          解散团队
        </button>
        <button
          v-else-if="canLeave && !editing"
          type="button"
          class="dev-btn dev-btn--danger"
          @click="emit('leave')"
        >
          退出团队
        </button>
      </div>
    </div>

    <div class="dev-team-detail__profile">
      <div class="dev-team-detail__avatar">
        <img v-if="team.avatar_url" :src="apiUrl(team.avatar_url)" :alt="team.name" />
        <span v-else>{{ teamAvatarInitial(team.name) }}</span>
        <input
          ref="avatarInput"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          class="dev-team-detail__avatar-input"
          @change="handleAvatarFileChange"
        />
        <button
          v-if="canManageTeam"
          type="button"
          class="dev-team-detail__avatar-edit"
          :disabled="avatarUploading"
          @click="triggerAvatarSelect"
        >
          {{ teamAvatarEditLabel(avatarUploading) }}
        </button>
      </div>

      <TeamProfileForm
        v-if="editing"
        :initial-name="team.name"
        :initial-description="team.description"
        :saving="saving"
        @submit="emit('save', $event)"
        @cancel="emit('cancel')"
      />
    </div>
  </section>
</template>

<style scoped>
/* 本页原先自带一套视觉（16px 圆角的 var(--73-surface-strong) 卡 + var(--73-border) 描边、靛蓝渐变主按钮、var(--73-accent) 管理员紫、
   var(--73-warning) 所有者橙、999px 头像圆），现在全部改为统一层：卡片 .dev-surface-card、卡片头
   .dev-card-head、按钮 .dev-btn*。这里只保留本页特有的排版与头像圆。 */
.dev-team-detail__meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--dev-muted);
}

.dev-team-detail__profile {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
}

.dev-team-detail__avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  flex: 0 0 88px;
  overflow: hidden;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--wb-accent-soft);
  color: var(--dev-blue);
  font-size: 34px;
  font-weight: 700;
}

.dev-team-detail__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dev-team-detail__avatar-input {
  display: none;
}

/* 头像上的「更换头像」压在图片下沿，用墨色半透明底保证在任意头像上都读得清 */
.dev-team-detail__avatar-edit {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 4px 0;
  border: 0;
  background: color-mix(in srgb, var(--dev-ink) 62%, transparent);
  color: var(--dev-surface-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.dev-team-detail__avatar-edit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
