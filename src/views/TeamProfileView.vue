<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl, requestJson } from '@/api/http'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'

interface TeamPublicProfile {
  team_id: number
  name: string
  description: string
  avatar_url: string | null
  owner_username: string
  member_count: number
  created_at: string
}

const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const teamId = computed(() => Number(route.params.teamId))
const loading = ref(false)
const team = ref<TeamPublicProfile | null>(null)
const allResources = ref<PublicMcResourceItem[]>([])
const failedAvatarUrl = ref(false)

const teamResources = computed(() =>
  allResources.value.filter(
    (r) => r.ownership_type === 'team' && r.team_id === teamId.value,
  ),
)

const stats = computed(() => ({
  resourceCount: teamResources.value.length,
  totalLikes: teamResources.value.reduce((sum, r) => sum + r.like_count, 0),
  platforms: [...new Set(teamResources.value.map((r) => r.platform).filter(Boolean))].length,
}))

const avatarSrc = computed(() => {
  if (failedAvatarUrl.value || !team.value?.avatar_url) return ''
  return apiUrl(team.value.avatar_url)
})

onMounted(async () => {
  if (!teamId.value) return
  loading.value = true
  try {
    const [profile, resources] = await Promise.all([
      requestJson<TeamPublicProfile>(`/team/public/${teamId.value}`, {}),
      listAllPublicMcResources(),
    ])
    team.value = profile
    allResources.value = resources
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载团队信息失败', 'error')
  } finally {
    loading.value = false
  }
})

function onAvatarError() {
  failedAvatarUrl.value = true
}

function openResource(resource: PublicMcResourceItem) {
  const selections = resource.tag_selections ?? []
  const rootName = selections.find((s) => s.group_path.length > 0)?.group_path[0] ?? ''
  const entryName = selections.find((s) => s.group_path.length > 1)?.group_path[1] ?? (resource.platform || '')
  const rootAlias = selections.find((s) => (s.group_path_aliases?.length ?? 0) > 0)?.group_path_aliases?.[0] ?? ''
  const entryAlias = selections.find((s) => (s.group_path_aliases?.length ?? 0) > 1)?.group_path_aliases?.[1] ?? ''

  router.push({
    name: 'resource-detail',
    params: {
      rootSlug: rootAlias || getTagRouteSlug(rootName),
      entrySlug: entryAlias || getTagRouteSlug(entryName),
      resourceSlug: getResourceDetailSlug(resource.id, resource.creator || resource.author),
    },
  })
}
</script>

<template>
  <main class="team-profile" v-loading="loading">
    <!-- 头部 -->
    <section class="team-profile__head">
      <div class="team-profile__avatar-wrap">
        <img
          v-if="avatarSrc"
          :src="avatarSrc"
          :alt="team?.name"
          class="team-profile__avatar"
          @error="onAvatarError"
        />
        <span v-else class="team-profile__avatar team-profile__avatar--text">
          {{ team?.name?.slice(0, 1).toUpperCase() || 'T' }}
        </span>
      </div>
      <div class="team-profile__head-content">
        <h1 class="team-profile__name">{{ team?.name || '未知团队' }}</h1>
        <p class="team-profile__desc" v-if="team?.description">{{ team.description }}</p>
        <p class="team-profile__meta">
          <span>{{ team?.member_count ?? 0 }} 位成员</span>
          <span v-if="team?.owner_username">创建者 {{ team.owner_username }}</span>
        </p>
      </div>
    </section>

    <!-- 统计 -->
    <section class="team-profile__stats">
      <div class="team-profile__stat">
        <strong>{{ stats.resourceCount }}</strong>
        <span>公开资源</span>
      </div>
      <div class="team-profile__stat">
        <strong>{{ stats.totalLikes }}</strong>
        <span>获得点赞</span>
      </div>
      <div class="team-profile__stat">
        <strong>{{ stats.platforms }}</strong>
        <span>涉及平台</span>
      </div>
    </section>

    <!-- 资源列表 -->
    <section class="team-profile__resources">
      <h2 class="team-profile__section-title">团队资源</h2>
      <div v-if="teamResources.length === 0" class="team-profile__empty">
        <p>该团队暂未发布公开资源</p>
      </div>
      <div v-else class="team-profile__resource-grid">
        <article
          v-for="resource in teamResources"
          :key="resource.id"
          class="team-profile__resource-card"
          @click="openResource(resource)"
        >
          <div class="team-profile__resource-cover-wrap">
            <img
              v-if="resource.cover_url"
              :src="apiUrl(resource.cover_url)"
              :alt="resource.title"
              class="team-profile__resource-cover"
            />
            <span v-else class="team-profile__resource-cover team-profile__resource-cover--text">
              {{ resource.title.slice(0, 1).toUpperCase() }}
            </span>
          </div>
          <div class="team-profile__resource-body">
            <h3 class="team-profile__resource-title">{{ resource.title }}</h3>
            <p class="team-profile__resource-desc">{{ resource.description || '暂无简介' }}</p>
            <div class="team-profile__resource-meta">
              <span>{{ resource.platform }}</span>
              <span>{{ resource.like_count }} 赞</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.team-profile {
  width: min(1120px, calc(100% - 32px));
  margin: 24px auto 48px;
  display: grid;
  gap: 24px;
}

.team-profile__head {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 28px 32px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
}

.team-profile__avatar-wrap {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
}

.team-profile__avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(96, 165, 250, 0.4);
  display: block;
}

.team-profile__avatar--text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #7c3aed, #6366f1);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
}

.team-profile__head-content {
  min-width: 0;
}

.team-profile__name {
  margin: 0 0 4px;
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.team-profile__desc {
  margin: 0 0 6px;
  color: #475569;
  font-size: 14px;
  line-height: 1.5;
}

.team-profile__meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #94a3b8;
}

.team-profile__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.team-profile__stat {
  padding: 20px 16px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  text-align: center;
  display: grid;
  gap: 4px;
}

.team-profile__stat strong {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.team-profile__stat span {
  font-size: 13px;
  color: #64748b;
}

.team-profile__section-title {
  margin: 0 0 14px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.team-profile__empty {
  padding: 48px 16px;
  border: 1px dashed rgba(148, 163, 184, 0.36);
  border-radius: 12px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}

.team-profile__resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.team-profile__resource-card {
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.team-profile__resource-card:hover {
  border-color: rgba(99, 102, 241, 0.36);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-2px);
}

.team-profile__resource-cover-wrap {
  width: 100%;
  height: 160px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  overflow: hidden;
}

.team-profile__resource-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.team-profile__resource-cover--text {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f3ff, #ede9fe);
  color: #a78bfa;
  font-size: 36px;
  font-weight: 700;
  object-fit: unset;
}

.team-profile__resource-body {
  padding: 14px 16px;
  display: grid;
  gap: 6px;
}

.team-profile__resource-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-profile__resource-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.team-profile__resource-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #94a3b8;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .team-profile__stats {
    grid-template-columns: 1fr;
  }

  .team-profile__head {
    flex-direction: column;
    text-align: center;
  }

  .team-profile__resource-grid {
    grid-template-columns: 1fr;
  }
}
</style>
