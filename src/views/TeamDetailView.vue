<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getTeamDetail,
  inviteMember,
  removeMember,
  updateMemberRole,
  leaveTeam,
  deleteTeam,
  updateTeam,
  type TeamDetailResponse,
  type TeamMemberResponse,
} from '@/api/team'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const team = ref<TeamDetailResponse | null>(null)
const loading = ref(false)
const inviting = ref(false)
const inviteUsername = ref('')
const showInviteInput = ref(false)
const removingUsername = ref<string | null>(null)
const editingName = ref(false)
const editName = ref('')
const editDesc = ref('')
const saving = ref(false)

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

async function loadTeam() {
  const token = auth.token?.trim()
  if (!token || !teamId.value) return
  loading.value = true
  try {
    team.value = await getTeamDetail(token, teamId.value)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载团队失败', 'warning')
    router.push({ name: 'workbench-teams' })
  } finally {
    loading.value = false
  }
}

async function handleInvite() {
  const username = inviteUsername.value.trim()
  if (!username) {
    showToast('请输入用户名', 'warning')
    return
  }
  const token = auth.token?.trim()
  if (!token) return
  inviting.value = true
  try {
    await inviteMember(token, teamId.value, { username })
    inviteUsername.value = ''
    showInviteInput.value = false
    showToast('邀请已发送')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '邀请失败', 'warning')
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
    showToast('成员已移除')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '移除失败', 'warning')
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
    showToast('角色已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败', 'warning')
  }
}

async function handleLeave() {
  if (!confirm('确定要退出该团队吗？')) return
  const token = auth.token?.trim()
  if (!token) return
  try {
    await leaveTeam(token, teamId.value)
    showToast('已退出团队')
    router.push({ name: 'workbench-teams' })
  } catch (e) {
    showToast(e instanceof Error ? e.message : '退出失败', 'warning')
  }
}

async function handleDelete() {
  if (!confirm('确定要解散该团队吗？此操作不可撤销。')) return
  const token = auth.token?.trim()
  if (!token) return
  try {
    await deleteTeam(token, teamId.value)
    showToast('团队已解散')
    router.push({ name: 'workbench-teams' })
  } catch (e) {
    showToast(e instanceof Error ? e.message : '解散失败', 'warning')
  }
}

function startEdit() {
  if (!team.value) return
  editName.value = team.value.name
  editDesc.value = team.value.description
  editingName.value = true
}

async function saveEdit() {
  if (!editName.value.trim()) {
    showToast('团队名称不能为空', 'warning')
    return
  }
  const token = auth.token?.trim()
  if (!token) return
  saving.value = true
  try {
    const updated = await updateTeam(token, teamId.value, {
      name: editName.value.trim(),
      description: editDesc.value.trim(),
    })
    if (team.value) {
      team.value.name = updated.name
      team.value.description = updated.description
    }
    editingName.value = false
    showToast('团队信息已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败', 'warning')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadTeam()
})
</script>

<template>
  <main class="page-shell team-detail-page">
    <header class="team-detail-page__back">
      <button type="button" @click="router.push({ name: 'workbench-teams' })">
        ‹ 返回团队列表
      </button>
    </header>

    <section v-if="loading" class="team-detail-page__empty">
      <p>加载中...</p>
    </section>

    <template v-else-if="team">
      <section class="team-detail-hero">
        <div class="team-detail-hero__info">
          <template v-if="editingName">
            <div class="team-detail-hero__edit">
              <input v-model="editName" type="text" maxlength="64" class="team-detail-hero__edit-name"
                @keydown.enter="saveEdit" />
              <textarea v-model="editDesc" rows="2" maxlength="200" class="team-detail-hero__edit-desc"
                placeholder="团队简介（可选）"></textarea>
              <div class="team-detail-hero__edit-actions">
                <button type="button" class="team-detail-hero__save-btn" :disabled="saving" @click="saveEdit">
                  {{ saving ? '保存中...' : '保存' }}
                </button>
                <button type="button" class="team-detail-hero__cancel-btn" @click="editingName = false">
                  取消
                </button>
              </div>
            </div>
          </template>
          <template v-else>
            <h1>{{ team.name }}</h1>
            <p v-if="team.description">{{ team.description }}</p>
            <div class="team-detail-hero__meta">
              <span>{{ team.members.length }} 名成员</span>
              <span>所有者 {{ team.owner_username }}</span>
            </div>
          </template>
        </div>
        <div class="team-detail-hero__actions">
          <button v-if="isOwner && !editingName" type="button" class="team-detail-hero__action-btn" @click="startEdit">
            编辑
          </button>
          <button v-if="isOwner && !editingName" type="button"
            class="team-detail-hero__action-btn team-detail-hero__action-btn--danger" @click="handleDelete">
            解散团队
          </button>
          <button v-if="myRole && myRole.role !== 'owner' && !editingName" type="button"
            class="team-detail-hero__action-btn team-detail-hero__action-btn--danger" @click="handleLeave">
            退出团队
          </button>
        </div>
      </section>

      <section class="team-detail-members">
        <div class="team-detail-members__head">
          <h2>成员 ({{ team.members.length }})</h2>
          <button v-if="isAdmin && !showInviteInput" type="button" class="team-detail-members__invite-btn"
            @click="showInviteInput = true">
            + 邀请成员
          </button>
        </div>

        <div v-if="showInviteInput" class="team-detail-members__invite-row">
          <input v-model="inviteUsername" type="text" placeholder="输入用户名" maxlength="64"
            @keydown.enter="handleInvite" />
          <button type="button" :disabled="inviting" @click="handleInvite">
            {{ inviting ? '邀请中...' : '发送邀请' }}
          </button>
          <button type="button" class="team-detail-members__cancel-btn" @click="showInviteInput = false">
            取消
          </button>
        </div>

        <div class="team-detail-members__list">
          <div v-for="member in team.members" :key="member.username" class="team-detail-members__item">
            <div class="team-detail-members__item-avatar">{{ member.username.charAt(0).toUpperCase() }}</div>
            <div class="team-detail-members__item-body">
              <strong>{{ member.username }}</strong>
              <span :class="{ admin: member.role === 'admin', owner: member.role === 'owner' }">
                {{ member.role === 'owner' ? '所有者' : member.role === 'admin' ? '管理员' : '成员' }}
              </span>
            </div>
            <div v-if="isOwner && member.role !== 'owner'" class="team-detail-members__item-actions">
              <button type="button" @click="handleRoleToggle(member)">
                {{ member.role === 'admin' ? '降为成员' : '升为管理' }}
              </button>
              <button type="button" class="danger" :disabled="removingUsername === member.username"
                @click="handleRemove(member)">
                {{ removingUsername === member.username ? '移除中...' : '移除' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.team-detail-page {
  display: grid;
  gap: 20px;
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
}

.team-detail-page__back button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  color: #475569;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.team-detail-page__back button:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #0f172a;
}

.team-detail-page__back button:hover {
  color: #2563eb;
}

.team-detail-page__empty {
  padding: 64px 24px;
  text-align: center;
  color: #64748b;
}

.team-detail-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
}

.team-detail-hero__info {
  flex: 1;
  min-width: 0;
}

.team-detail-hero__info h1 {
  margin: 0 0 6px;
  font-size: 22px;
  color: #0f172a;
  word-break: break-all;
}

.team-detail-hero__info>p {
  margin: 0 0 10px;
  color: #64748b;
  font-size: 14px;
}

.team-detail-hero__meta {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #94a3b8;
}

.team-detail-hero__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.team-detail-hero__action-btn {
  padding: 8px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.team-detail-hero__action-btn:hover {
  background: #f8fafc;
}

.team-detail-hero__action-btn--danger {
  color: #ef4444;
  border-color: #fecaca;
}

.team-detail-hero__action-btn--danger:hover {
  background: #fef2f2;
}

.team-detail-hero__edit {
  display: grid;
  gap: 10px;
}

.team-detail-hero__edit-name {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  outline: none;
}

.team-detail-hero__edit-name:focus {
  border-color: #4f8cff;
}

.team-detail-hero__edit-desc {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  color: #0f172a;
  outline: none;
  resize: vertical;
}

.team-detail-hero__edit-desc:focus {
  border-color: #4f8cff;
}

.team-detail-hero__edit-actions {
  display: flex;
  gap: 8px;
}

.team-detail-hero__save-btn {
  padding: 8px 18px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.team-detail-hero__save-btn:disabled {
  opacity: 0.6;
}

.team-detail-hero__cancel-btn {
  padding: 8px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.team-detail-members {
  padding: 24px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
}

.team-detail-members__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.team-detail-members__head h2 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.team-detail-members__invite-btn {
  padding: 7px 16px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.team-detail-members__invite-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  flex-wrap: wrap;
}

.team-detail-members__invite-row input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  outline: none;
}

.team-detail-members__invite-row input:focus {
  border-color: #4f8cff;
}

.team-detail-members__invite-row button {
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.team-detail-members__invite-row button:disabled {
  opacity: 0.6;
}

.team-detail-members__cancel-btn {
  padding: 8px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff !important;
  color: #64748b !important;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.team-detail-members__list {
  display: grid;
  gap: 8px;
}

.team-detail-members__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
  background: #fafbfc;
}

.team-detail-members__item-avatar {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: linear-gradient(135deg, #6366f1, #818cf8);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.team-detail-members__item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.team-detail-members__item-body strong {
  font-size: 14px;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-detail-members__item-body span {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

.team-detail-members__item-body span.admin {
  color: #8b5cf6;
}

.team-detail-members__item-body span.owner {
  color: #f59e0b;
}

.team-detail-members__item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.team-detail-members__item-actions button {
  padding: 5px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.team-detail-members__item-actions button:hover:not(:disabled) {
  background: #f8fafc;
}

.team-detail-members__item-actions button.danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #dc2626;
  border-color: #fecaca;
}

.team-detail-members__item-actions button:disabled {
  opacity: 0.6;
}
</style>
