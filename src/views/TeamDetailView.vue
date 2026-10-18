<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'
// 顶部读数条的刷新按钮与卡片头的图标都要显式 import：
// 模板里直接写 <Refresh /> / <Plus /> 而没 import 时，Vue 会把它们当未知元素渲染成空的
// <refresh> / <plus>，按钮还在、图标空白，与其余菜单页的按钮不是一个样子。
import { TButton, TForm, TFormItem, TIcon, TInput, TLoading, EditPen, Plus, Refresh, TMessage } from 'ui_73info'

import {
  getTeamDetail,
  inviteMember,
  removeMember,
  updateMemberRole,
  leaveTeam,
  deleteTeam,
  updateTeam,
  uploadTeamAvatar,
  transferTeamOwner,
  type TeamDetailResponse,
  type TeamMemberResponse,
} from '@/api/team'
import { useAuthStore } from '@/stores/auth'
import { apiUrl } from '@/api/http'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const team = ref<TeamDetailResponse | null>(null)
const loading = ref(false)
const inviting = ref(false)
const inviteUsername = ref('')
const showInviteInput = ref(false)
const removingUsername = ref<string | null>(null)
const editingName = ref(false)
/**
 * 编辑表单的模型对象。
 *
 * 原来这里是两个独立的 `editName` / `editDesc` ref，改用 `TForm` 后要收成一个对象：
 * `TFormItem` 靠 `prop` 从 `TForm` 的 `model` 上取值校验，没有模型对象就没有字段可校验。
 * 这一页的两个字段目前不挂规则（只标「团队名称」必填星号），但模型对象是 `TForm` 的
 * 必填参数，与其传一个只读的投影，不如让表单直接持有它要校验的那份数据。
 */
const editForm = reactive({ name: '', description: '' })
const saving = ref(false)
const avatarUploading = ref(false)
const avatarFileInput = ref<HTMLInputElement | null>(null)

const teamId = computed(() => Number(route.params.teamId))

const isOwner = computed(() => team.value?.owner_username === auth.username)
const isAdmin = computed(() => {
  if (!team.value) return false
  return team.value.members.some(
    (m) => m.username === auth.username && (m.role === 'admin' || m.role === 'owner'),
  )
})
const myRole = computed(() => {
  if (!team.value) return null
  return team.value.members.find((m) => m.username === auth.username) ?? null
})
const canManageTeam = computed(() => isOwner.value || isAdmin.value)

/* 成员角色文案与 .dev-stack-item__title / __meta 一起用：
   角色只作为次级信息出现，配色只走 --dev-muted，不再给管理员/所有者单独上紫与橙——
   开发者体系里只有蓝（进行中）、青（已完成）、金（金额与提示）三支强调色，
   角色不在其中，多出来的两支色相是这一页与其余菜单页最明显的色差来源。 */
function roleLabel(role: string): string {
  if (role === 'owner') return '所有者'
  if (role === 'admin') return '管理员'
  return '成员'
}

const myRoleLabel = computed(() => (myRole.value ? roleLabel(myRole.value.role) : '—'))

async function loadTeam() {
  const token = auth.token?.trim()
  if (!token || !teamId.value) return
  loading.value = true
  try {
    team.value = await getTeamDetail(token, teamId.value)
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '加载团队失败')
    router.push({ name: 'workbench-teams' })
  } finally {
    loading.value = false
  }
}

async function handleInvite() {
  const username = inviteUsername.value.trim()
  if (!username) {
    TMessage.warning('请输入用户名')
    return
  }
  const token = auth.token?.trim()
  if (!token) return
  inviting.value = true
  try {
    await inviteMember(token, teamId.value, { username })
    inviteUsername.value = ''
    showInviteInput.value = false
    TMessage.info('邀请已发送')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '邀请失败')
  } finally {
    inviting.value = false
  }
}

async function handleRemove(member: TeamMemberResponse) {
  if (!confirm(`确定要移除「${member.username}」吗？`)) return
  const token = auth.token?.trim()
  if (!token) return
  removingUsername.value = member.username
  try {
    await removeMember(token, teamId.value, member.username)
    if (team.value) {
      team.value.members = team.value.members.filter((m) => m.username !== member.username)
    }
    TMessage.info('成员已移除')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '移除失败')
  } finally {
    removingUsername.value = null
  }
}

async function handleRoleToggle(member: TeamMemberResponse) {
  const newRole = member.role === 'admin' ? 'member' : 'admin'
  const token = auth.token?.trim()
  if (!token) return
  try {
    await updateMemberRole(token, teamId.value, member.username, { role: newRole })
    if (team.value) {
      const m = team.value.members.find((m) => m.username === member.username)
      if (m) m.role = newRole
    }
    TMessage.info('角色已更新')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '更新失败')
  }
}

async function handleTransferOwner(member: TeamMemberResponse) {
  if (!team.value) return
  if (!confirm(`确定要将「${team.value.name}」的所有权转移给「${member.username}」吗？`)) return
  const token = auth.token?.trim()
  if (!token) return
  try {
    const updated = await transferTeamOwner(token, teamId.value, member.username)
    if (team.value) {
      team.value.owner_username = updated.owner_username
      team.value.members = team.value.members.map((m) => {
        if (m.username === member.username) return { ...m, role: 'owner' }
        if (m.username === auth.username) return { ...m, role: 'admin' }
        return m
      })
    }
    TMessage.info('所有权已转移')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '转移失败')
  }
}

async function handleLeave() {
  if (!confirm('确定要退出该团队吗？')) return
  const token = auth.token?.trim()
  if (!token) return
  try {
    await leaveTeam(token, teamId.value)
    TMessage.info('已退出团队')
    router.push({ name: 'workbench-teams' })
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '退出失败')
  }
}

async function handleDelete() {
  if (!confirm('确定要解散该团队吗？此操作不可撤销。')) return
  const token = auth.token?.trim()
  if (!token) return
  try {
    await deleteTeam(token, teamId.value)
    TMessage.info('团队已解散')
    router.push({ name: 'workbench-teams' })
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '解散失败')
  }
}

function startEdit() {
  if (!team.value) return
  editForm.name = team.value.name
  editForm.description = team.value.description
  editingName.value = true
}

async function saveEdit() {
  if (!editForm.name.trim()) {
    TMessage.warning('团队名称不能为空')
    return
  }
  const token = auth.token?.trim()
  if (!token) return
  saving.value = true
  try {
    const updated = await updateTeam(token, teamId.value, {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
    })
    if (team.value) {
      team.value.name = updated.name
      team.value.description = updated.description
    }
    editingName.value = false
    TMessage.info('团队信息已更新')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '更新失败')
  } finally {
    saving.value = false
  }
}

function goMemberProfile(username: string) {
  router.push({ name: 'dev-profile', params: { username } })
}

function triggerAvatarSelect() {
  if (!canManageTeam.value) return
  avatarFileInput.value?.click()
}

async function handleAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) return
  const token = auth.token?.trim()
  if (!token) return
  avatarUploading.value = true
  try {
    const updated = await uploadTeamAvatar(token, teamId.value, file)
    if (team.value) {
      team.value.avatar_url = updated.avatar_url
    }
    TMessage.info('头像已更新')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '上传头像失败')
  } finally {
    avatarUploading.value = false
    input.value = ''
  }
}

onMounted(() => {
  loadTeam()
})
</script>

<template>
  <div class="dev-page dev-team-detail">
    <!-- 顶部读数条：与其余菜单页同一条形态（读数在左、刷新在右）。
         这一页原来直接从一块裸的 hero 区块开始，没有读数横条，切菜单时整页骨架都换了。 -->
    <WorkbenchBarSlot>
      <TLoading tag="div" class="dev-meta-strip" :loading="loading">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">团队成员</span>
          <span class="dev-meta-strip__value">{{ team?.members.length ?? 0 }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">我的角色</span>
          <span class="dev-meta-strip__value">{{ myRoleLabel }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">所有者</span>
          <span class="dev-meta-strip__value">{{ team?.owner_username || '—' }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton icon-only :loading="loading" aria-label="刷新团队详情" @click="loadTeam">
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </TLoading>
    </WorkbenchBarSlot>

    <p v-if="loading" class="dev-empty-state">团队加载中…</p>
    <p v-else-if="!team" class="dev-empty-state">团队不存在，或你已不在该团队中</p>

    <template v-else>
      <!-- 团队资料：卡片头报名字与简介，头像与编辑表单在卡片体内 -->
      <section class="dev-surface-card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">{{ team.name }}</h3>
            <p class="dev-section-desc">{{ team.description || '暂无团队简介' }}</p>
            <p class="dev-team-detail__meta">
              {{ team.members.length }} 名成员 · 所有者 {{ team.owner_username }}
            </p>
          </div>
          <div class="dev-card-head__actions">
            <button
              v-if="isOwner && !editingName"
              type="button"
              class="dev-btn dev-btn--ghost"
              @click="startEdit"
            >
              <TIcon>
                <EditPen />
              </TIcon>
              <span>编辑资料</span>
            </button>
            <button
              v-if="isOwner && !editingName"
              type="button"
              class="dev-btn dev-btn--danger"
              @click="handleDelete"
            >
              解散团队
            </button>
            <button
              v-else-if="myRole && myRole.role !== 'owner' && !editingName"
              type="button"
              class="dev-btn dev-btn--danger"
              @click="handleLeave"
            >
              退出团队
            </button>
          </div>
        </div>

        <div class="dev-team-detail__profile">
          <div class="dev-team-detail__avatar">
            <img v-if="team.avatar_url" :src="apiUrl(team.avatar_url)" :alt="team.name" />
            <span v-else>{{ team.name.charAt(0).toUpperCase() }}</span>
            <input
              ref="avatarFileInput"
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
              {{ avatarUploading ? '上传中...' : '更换头像' }}
            </button>
          </div>

          <TForm v-if="editingName" :model="editForm" class="dev-team-detail__form">
            <TFormItem label="团队名称" required>
              <TInput v-model="editForm.name" :maxlength="64" placeholder="输入团队名称" />
            </TFormItem>
            <TFormItem label="团队简介">
              <TInput
                v-model="editForm.description"
                type="textarea"
                :rows="3"
                :maxlength="200"
                show-count
                placeholder="简单描述团队的目的（可选）"
              />
            </TFormItem>
            <div class="dev-team-detail__form-actions">
              <button
                type="button"
                class="dev-btn dev-btn--primary"
                :disabled="saving"
                @click="saveEdit"
              >
                {{ saving ? '保存中...' : '保存' }}
              </button>
              <button type="button" class="dev-btn dev-btn--ghost" @click="editingName = false">
                取消
              </button>
            </div>
          </TForm>
        </div>
      </section>

      <!-- 成员列表：与「我的团队」的列表项同一形态（.dev-stack-list / .dev-stack-item） -->
      <section class="dev-surface-card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">成员</h3>
          </div>
          <div class="dev-card-head__actions">
            <button
              v-if="isAdmin && !showInviteInput"
              type="button"
              class="dev-btn dev-btn--primary"
              @click="showInviteInput = true"
            >
              <TIcon>
                <Plus />
              </TIcon>
              <span>邀请成员</span>
            </button>
          </div>
        </div>

        <div v-if="showInviteInput" class="dev-toolbar dev-team-detail__invite">
          <TInput
            v-model="inviteUsername"
            class="dev-toolbar__search"
            :maxlength="64"
            placeholder="输入用户名"
            aria-label="要邀请的用户名"
            @enter="handleInvite"
          />
          <div class="dev-toolbar__actions">
            <TButton variant="solid" tone="accent" :loading="inviting" @click="handleInvite">
              发送邀请
            </TButton>
            <TButton @click="showInviteInput = false">取消</TButton>
          </div>
        </div>

        <ul class="dev-stack-list">
          <li v-for="member in team.members" :key="member.username" class="dev-stack-item">
            <div class="dev-team-detail__member-main">
              <span
                class="dev-team-detail__member-avatar"
                role="button"
                tabindex="0"
                :aria-label="`查看 ${member.username} 的主页`"
                @click="goMemberProfile(member.username)"
                @keydown.enter="goMemberProfile(member.username)"
              >
                <img
                  v-if="member.avatar_url"
                  :src="apiUrl(member.avatar_url)"
                  :alt="member.username"
                />
                <span v-else>{{ member.username.charAt(0).toUpperCase() }}</span>
              </span>
              <div class="dev-team-detail__member-body">
                <button
                  type="button"
                  class="dev-team-detail__member-name"
                  @click="goMemberProfile(member.username)"
                >
                  {{ member.username }}
                </button>
                <div class="dev-stack-item__meta">{{ roleLabel(member.role) }}</div>
              </div>
            </div>

            <div v-if="isOwner && member.role !== 'owner'" class="dev-team-detail__member-actions">
              <button
                type="button"
                class="dev-btn dev-btn--ghost"
                @click="handleTransferOwner(member)"
              >
                设为所有者
              </button>
              <button
                type="button"
                class="dev-btn dev-btn--ghost"
                @click="handleRoleToggle(member)"
              >
                {{ member.role === 'admin' ? '降为成员' : '升为管理' }}
              </button>
              <button
                type="button"
                class="dev-btn dev-btn--danger"
                :disabled="removingUsername === member.username"
                @click="handleRemove(member)"
              >
                {{ removingUsername === member.username ? '移除中...' : '移除' }}
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* 本页原先自带一套视觉（16px 圆角的 #fff 卡 + #e5e7eb 描边、靛蓝渐变主按钮 #2563eb→#4f8cff、
   #8b5cf6 管理员紫、#f59e0b 所有者橙、999px 头像圆），与开发者工作台其余菜单页不是一个体系。
   现在全部改为统一层：容器 .dev-page、顶部读数条 .dev-meta-strip、卡片 .dev-surface-card、
   卡片头 .dev-card-head、列表 .dev-stack-list / .dev-stack-item、按钮 .dev-btn*。
   这里只保留本页特有的排版与头像圆。 */
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

.dev-team-detail__form {
  flex: 1 1 320px;
  min-width: 0;
}

.dev-team-detail__form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

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

@media (max-width: 780px) {
  .dev-team-detail__member-actions {
    flex-wrap: wrap;
  }
}

@media (max-width: 640px) {
  .dev-team-detail__member-actions .dev-btn {
    flex: 1 1 0;
    min-height: 44px;
    height: auto;
  }
}
</style>
