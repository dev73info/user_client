<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
// 图标必须显式 import 才会被解析：顶部读数条的刷新、卡片头的「创建团队」、
// 团队卡的默认头像（<UserFilled />）以及工具条里的搜索/重置。
// 模板里写了标签却没 import 时，Vue 会把它当未知元素渲染成空标签——按钮和头像框都在、里面是空的，
// 与其余菜单页同一颗图标不是一个样子。
import {
  acceptInvitation,
  createTeam,
  listMyTeams,
  deleteTeam,
  leaveTeam,
  listUserInvitations,
  rejectInvitation,
  type TeamInvitationResponse,
  type TeamResponse,
} from '@/api/team'
import { useAuthStore } from '@/stores/auth'
import { apiUrl } from '@/api/http'


import {
  TButton,
  TCard,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TMessage,
  TOption,
  TSelect,
  Plus,
  Refresh,
  Search,
  UserFilled,
} from 'ui_73info'

const router = useRouter()
const auth = useAuthStore()

const teams = ref<TeamResponse[]>([])
const loading = ref(false)
const showCreateModal = ref(false)
const createName = ref('')
const createDesc = ref('')
const creating = ref(false)
const deletingId = ref<number | null>(null)
const invitations = ref<TeamInvitationResponse[]>([])
const invitationsLoading = ref(false)
const processingInvitationId = ref<number | null>(null)

const sortedTeams = computed(() =>
  [...teams.value].sort((a, b) => b.team_id - a.team_id),
)

/** 顶部信息条的「我创建的」：所有者就是当前账号的团队数。 */
const ownedCount = computed(
  () => teams.value.filter((team) => team.owner_username === auth.username).length,
)

// 列表工具条：与其余菜单页同一套（筛选即时生效 + 搜索 + 重置）。
// 取值用空串表示「不筛选」，与 dev-resource-list / dev-my-requirements 的 filters 写法一致。
const filters = reactive({
  keyword: '',
  scope: '',
})

const hasActiveFilters = computed(() => Boolean(filters.keyword.trim()) || Boolean(filters.scope))

const filteredTeams = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return sortedTeams.value.filter((team) => {
    const isOwner = team.owner_username === auth.username

    if (filters.scope === 'owned' && !isOwner) {
      return false
    }

    if (filters.scope === 'joined' && isOwner) {
      return false
    }

    if (!keyword) {
      return true
    }

    return [team.name, team.description].some((value) => (value ?? '').toLowerCase().includes(keyword))
  })
})

async function reloadAll() {
  await Promise.all([loadTeams(), loadInvitations()])
}

async function loadTeams() {
  loading.value = true
  try {
    const token = auth.token?.trim() ? auth.token : null
    if (!token) {
      TMessage.warning('请先登录')
      return
    }
    teams.value = await listMyTeams(token)
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '加载团队失败')
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  const name = createName.value.trim()
  if (!name) {
    TMessage.warning('请输入团队名称')
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
    TMessage.info('团队创建成功')
    router.push({ name: 'workbench-team-detail', params: { teamId: team.team_id } })
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '创建失败')
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
    TMessage.info('团队已解散')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '解散失败')
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
    TMessage.info('已退出团队')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '退出失败')
  } finally {
    deletingId.value = null
  }
}

function goDetail(teamId: number) {
  router.push({ name: 'workbench-team-detail', params: { teamId } })
}

function formatInvitationTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadInvitations() {
  const token = auth.token?.trim()
  if (!token) return

  invitationsLoading.value = true
  try {
    invitations.value = await listUserInvitations(token)
  } catch {
    // 邀请列表加载失败不阻塞团队页面
  } finally {
    invitationsLoading.value = false
  }
}

async function handleAcceptInvitation(inv: TeamInvitationResponse) {
  const token = auth.token?.trim()
  if (!token) return

  processingInvitationId.value = inv.id
  try {
    await acceptInvitation(token, inv.id)
    invitations.value = invitations.value.filter((i) => i.id !== inv.id)
    TMessage.info(`已加入「${inv.team_name}」`)
    await loadTeams()
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '接受邀请失败')
  } finally {
    processingInvitationId.value = null
  }
}

async function handleRejectInvitation(inv: TeamInvitationResponse) {
  const token = auth.token?.trim()
  if (!token) return

  processingInvitationId.value = inv.id
  try {
    await rejectInvitation(token, inv.id)
    invitations.value = invitations.value.filter((i) => i.id !== inv.id)
    TMessage.info('已拒绝邀请')
  } catch (e) {
    TMessage.warning(e instanceof Error ? e.message : '拒绝邀请失败')
  } finally {
    processingInvitationId.value = null
  }
}

onMounted(() => {
  loadTeams()
  loadInvitations()
})
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
          <TButton icon-only aria-label="刷新团队与邀请" :loading="loading || invitationsLoading"
            @click="reloadAll">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <section v-if="invitations.length" class="dev-surface-card dev-teams__invitations">
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
              由 {{ inv.inviter_username }} 邀请 · {{ formatInvitationTime(inv.created_at) }}
            </div>
          </div>
          <div class="dev-teams__item-actions">
            <button class="dev-btn dev-btn--ghost" type="button" :disabled="processingInvitationId === inv.id"
              @click="handleRejectInvitation(inv)">
              拒绝
            </button>
            <button class="dev-btn dev-btn--primary" type="button" :disabled="processingInvitationId === inv.id"
              @click="handleAcceptInvitation(inv)">
              {{ processingInvitationId === inv.id ? '处理中...' : '接受' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">我的团队</h3>
        </div>
        <div class="dev-card-head__actions">
          <button class="dev-btn dev-btn--primary" type="button" @click="showCreateModal = true">
            <TIcon>
              <Plus />
            </TIcon>
            <span>创建团队</span>
          </button>
        </div>
      </div>

      <!-- 列表工具条：与其余菜单页同一条（筛选项 + 搜索 + 重置都在同一行，
           筛选即时生效，所以不另给「查询」按钮）。 -->
      <div class="dev-toolbar">
        <TSelect v-model="filters.scope" clearable placeholder="团队归属" class="dev-toolbar__field"
          aria-label="按团队归属筛选">
          <TOption label="我创建的" value="owned" />
          <TOption label="我加入的" value="joined" />
        </TSelect>

        <TInput v-model="filters.keyword" clearable placeholder="搜索团队名称或简介" class="dev-toolbar__search">
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>

        <div class="dev-toolbar__actions">
          <span v-if="hasActiveFilters" class="dev-toolbar__hint">
            筛选出 {{ filteredTeams.length }} / {{ teams.length }} 个
          </span>
        </div>
      </div>

      <div v-if="loading" class="dev-empty-state">团队加载中</div>

      <div v-else-if="teams.length === 0" class="dev-empty-state">
        还没有团队，创建或加入一个团队后即可与伙伴协作
      </div>

      <div v-else-if="filteredTeams.length === 0" class="dev-empty-state">
        当前筛选下没有团队，换个条件或点「重置」再看看
      </div>

      <div v-else class="dev-stack-list">
        <article v-for="team in filteredTeams" :key="team.team_id" class="dev-stack-item dev-teams__card"
          @click="goDetail(team.team_id)">
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
            <button v-if="team.owner_username === auth.username" class="dev-btn dev-btn--danger" type="button"
              :disabled="deletingId === team.team_id" @click="handleDelete(team)">
              {{ deletingId === team.team_id ? '解散中...' : '解散' }}
            </button>
            <button v-else class="dev-btn dev-btn--ghost" type="button" :disabled="deletingId === team.team_id"
              @click="handleLeave(team)">
              {{ deletingId === team.team_id ? '退出中...' : '退出' }}
            </button>
          </div>
        </article>
      </div>
    </TCard>

    <TDialog v-model:open="showCreateModal" title="创建团队" width="520px" class="dev-dialog"
      :mask-closable="!creating">
      <TForm label-position="top">
        <TFormItem label="团队名称" required>
          <TInput v-model="createName"  :maxlength="64" placeholder="输入团队名称"
            @keyup.enter="handleCreate" />
        </TFormItem>
        <TFormItem label="团队简介">
          <TInput show-count v-model="createDesc" type="textarea" :rows="3"  :maxlength="200"
            placeholder="简单描述团队的目的（可选）" />
        </TFormItem>
      </TForm>
      <template #footer>
        <TButton :disabled="creating" @click="showCreateModal = false">取消</TButton>
        <TButton variant="solid" tone="accent" :loading="creating" @click="handleCreate">创建</TButton>
      </template>
    </TDialog>
  </div>
</template>

<style scoped>
/* 本页原先自带一套视觉（渐变主按钮 #2563eb→#4f8cff、22px 圆角、手写弹窗与 #e5e7eb 描边），
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
  transition: border-color 160ms ease, box-shadow 160ms ease;
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
