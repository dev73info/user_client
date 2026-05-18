<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  createTeam,
  listMyTeams,
  deleteTeam,
  leaveTeam,
  type TeamResponse,
} from '@/api/team'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const auth = useAuthStore()
const { showToast } = useToast()

const teams = ref<TeamResponse[]>([])
const loading = ref(false)
const showCreateModal = ref(false)
const createName = ref('')
const createDesc = ref('')
const creating = ref(false)
const deletingId = ref<number | null>(null)

const sortedTeams = computed(() =>
  [...teams.value].sort((a, b) => b.team_id - a.team_id),
)

async function loadTeams() {
  loading.value = true
  try {
    const token = auth.token?.trim() ? auth.token : null
    if (!token) {
      showToast('请先登录', 'warning')
      return
    }
    teams.value = await listMyTeams(token)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载团队失败', 'warning')
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  const name = createName.value.trim()
  if (!name) {
    showToast('请输入团队名称', 'warning')
    return
  }
  const token = auth.token?.trim()
  if (!token) return
  creating.value = true
  try {
    const team = await createTeam(token, {
      name,
      description: createDesc.value.trim(),
    })
    showCreateModal.value = false
    createName.value = ''
    createDesc.value = ''
    teams.value.unshift(team)
    showToast('团队创建成功')
    router.push({ name: 'workbench-team-detail', params: { teamId: team.team_id } })
  } catch (e) {
    showToast(e instanceof Error ? e.message : '创建失败', 'warning')
  } finally {
    creating.value = false
  }
}

async function handleDelete(team: TeamResponse) {
  if (!confirm(`确定要解散「${team.name}」吗？此操作不可撤销。`)) return
  const token = auth.token?.trim()
  if (!token) return
  deletingId.value = team.team_id
  try {
    await deleteTeam(token, team.team_id)
    teams.value = teams.value.filter((t) => t.team_id !== team.team_id)
    showToast('团队已解散')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '解散失败', 'warning')
  } finally {
    deletingId.value = null
  }
}

async function handleLeave(team: TeamResponse) {
  if (!confirm(`确定要退出「${team.name}」吗？`)) return
  const token = auth.token?.trim()
  if (!token) return
  deletingId.value = team.team_id
  try {
    await leaveTeam(token, team.team_id)
    teams.value = teams.value.filter((t) => t.team_id !== team.team_id)
    showToast('已退出团队')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '退出失败', 'warning')
  } finally {
    deletingId.value = null
  }
}

function goDetail(teamId: number) {
  router.push({ name: 'workbench-team-detail', params: { teamId } })
}

onMounted(() => {
  loadTeams()
})
</script>

<template>
  <main class="teams-page">
    <section class="teams-page__card">
      <header class="teams-page__head">
        <div>
          <h1>我的团队</h1>
          <p v-if="teams.length">共 {{ teams.length }} 个团队</p>
          <p v-else>查看和管理你的团队</p>
        </div>
        <button class="teams-page__create-btn" type="button" @click="showCreateModal = true">
          + 创建团队
        </button>
      </header>

      <section v-if="loading" class="teams-page__empty">
        <p>加载中...</p>
      </section>

      <section v-else-if="sortedTeams.length === 0" class="teams-page__empty">
        <div class="teams-page__empty-icon">👥</div>
        <h2>还没有团队</h2>
        <p>创建或加入一个团队，与伙伴一起协作</p>
        <button class="teams-page__create-btn teams-page__create-btn--large" type="button"
          @click="showCreateModal = true">
          + 创建团队
        </button>
      </section>

      <section v-else class="teams-list">
        <article v-for="team in sortedTeams" :key="team.team_id" class="team-card" @click="goDetail(team.team_id)">
          <div class="team-card__avatar">
            <img v-if="team.avatar_url" :src="team.avatar_url" :alt="team.name" />
            <span v-else>👥</span>
          </div>
          <div class="team-card__body">
            <h3>{{ team.name }}</h3>
            <p v-if="team.description">{{ team.description }}</p>
            <div class="team-card__meta">
              <span>{{ team.member_count }} 名成员</span>
              <span>所有者 {{ team.owner_username }}</span>
            </div>
          </div>
          <div class="team-card__actions" @click.stop>
            <button v-if="team.owner_username === auth.username"
              class="team-card__action-btn team-card__action-btn--danger" type="button"
              :disabled="deletingId === team.team_id" @click="handleDelete(team)">
              {{ deletingId === team.team_id ? '解散中...' : '解散' }}
            </button>
            <button v-else class="team-card__action-btn" type="button" :disabled="deletingId === team.team_id"
              @click="handleLeave(team)">
              {{ deletingId === team.team_id ? '退出中...' : '退出' }}
            </button>
          </div>
        </article>
      </section>
    </section>

    <Teleport to="body">
      <div v-if="showCreateModal" class="teams-modal-backdrop" @click.self="showCreateModal = false">
        <div class="teams-modal">
          <h2>创建团队</h2>
          <label class="teams-modal__field">
            <span>团队名称 <em>*</em></span>
            <input v-model="createName" type="text" maxlength="64" placeholder="输入团队名称" @keydown.enter="handleCreate" />
          </label>
          <label class="teams-modal__field">
            <span>团队简介</span>
            <textarea v-model="createDesc" rows="3" maxlength="200" placeholder="简单描述团队的目的（可选）"></textarea>
          </label>
          <div class="teams-modal__actions">
            <button class="teams-modal__btn teams-modal__btn--ghost" type="button"
              @click="showCreateModal = false">取消</button>
            <button class="teams-modal__btn teams-modal__btn--primary" type="button" :disabled="creating"
              @click="handleCreate">
              {{ creating ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.teams-page {
  max-width: 1024px;
  margin: 32px auto 56px;
  padding: 0 20px;
}

.teams-page__card {
  display: grid;
  gap: 24px;
  padding: 28px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 34px rgba(76, 103, 172, 0.08);
}

.teams-page__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.teams-page__head h1 {
  margin: 0 0 4px;
  font-size: 22px;
  color: #0f172a;
}

.teams-page__head p {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

.teams-page__create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: box-shadow 160ms ease, transform 160ms ease;
  white-space: nowrap;
}

.teams-page__create-btn:hover {
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.24);
  transform: translateY(-1px);
}

.teams-page__empty {
  display: grid;
  place-items: center;
  gap: 12px;
  padding: 64px 24px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  text-align: center;
}

.teams-page__empty-icon {
  font-size: 56px;
  line-height: 1;
}

.teams-page__empty h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.teams-page__empty p {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

.teams-page__create-btn--large {
  margin-top: 4px;
  padding: 12px 28px;
  font-size: 15px;
}

.teams-list {
  display: grid;
  gap: 12px;
}

.team-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 16px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.team-card:hover {
  border-color: rgba(147, 197, 253, 0.6);
  box-shadow: 0 4px 16px rgba(76, 103, 172, 0.06);
}

.team-card__avatar {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, #eef2ff, #dbeafe);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
  overflow: hidden;
}

.team-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.team-card__body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 4px;
}

.team-card__body h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-card__body p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-card__meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.team-card__actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.team-card__action-btn {
  padding: 6px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.team-card__action-btn:hover:not(:disabled) {
  background: #f8fafc;
  color: #334155;
}

.team-card__action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.team-card__action-btn--danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #dc2626;
  border-color: #fecaca;
}

.teams-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.3);
  backdrop-filter: blur(4px);
}

.teams-modal {
  width: min(480px, calc(100% - 48px));
  padding: 28px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.15);
  display: grid;
  gap: 20px;
}

.teams-modal h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.teams-modal__field {
  display: grid;
  gap: 6px;
}

.teams-modal__field span {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.teams-modal__field em {
  font-style: normal;
  color: #ef4444;
}

.teams-modal__field input,
.teams-modal__field textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font: inherit;
  font-size: 14px;
  color: #0f172a;
  outline: none;
  transition: border-color 160ms ease;
  box-sizing: border-box;
}

.teams-modal__field input:focus,
.teams-modal__field textarea:focus {
  border-color: #4f8cff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.teams-modal__field textarea {
  resize: vertical;
  min-height: 60px;
}

.teams-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.teams-modal__btn {
  padding: 10px 22px;
  border: 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 120ms ease, opacity 120ms ease;
}

.teams-modal__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.teams-modal__btn--primary {
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
}

.teams-modal__btn--ghost {
  background: #f1f5f9;
  color: #475569;
}

.teams-modal__btn--ghost:hover {
  background: #e2e8f0;
}
</style>
