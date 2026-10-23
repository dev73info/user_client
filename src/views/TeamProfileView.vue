<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { apiUrl, requestJson } from '@/api/http'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import TeamPublicResourceCard from '@/components/team/TeamPublicResourceCard.vue'
import { TLoading, TMessage } from 'ui_73info'

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

const teamId = computed(() => Number(route.params.teamId))
const loading = ref(false)
const team = ref<TeamPublicProfile | null>(null)
const allResources = ref<PublicMcResourceItem[]>([])
const failedAvatarUrl = ref(false)

const teamResources = computed(() =>
  allResources.value.filter((r) => r.ownership_type === 'team' && r.team_id === teamId.value),
)

const stats = computed(() => ({
  resourceCount: teamResources.value.length,
  totalLikes: teamResources.value.reduce((sum, r) => sum + r.like_count, 0),
  platforms: new Set(teamResources.value.map((r) => r.platform).filter(Boolean)).size,
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
    TMessage.error(err instanceof Error ? err.message : '加载团队信息失败')
  } finally {
    loading.value = false
  }
})

function onAvatarError() {
  failedAvatarUrl.value = true
}
</script>

<template>
  <TLoading tag="main" class="team-profile" :loading="loading">
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
        <TeamPublicResourceCard
          v-for="resource in teamResources"
          :key="resource.id"
          :resource="resource"
        />
      </div>
    </section>
  </TLoading>
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
  border: 1px solid color-mix(in srgb, var(--73-border) 96%, transparent);
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--73-surface-strong) 98%, transparent),
    color-mix(in srgb, var(--73-surface-strong) 94%, transparent)
  );
  box-shadow: 0 4px 16px color-mix(in srgb, var(--73-ink) 4%, transparent);
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
  border: 2px solid color-mix(in srgb, var(--73-accent) 40%, transparent);
  display: block;
}

.team-profile__avatar--text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--73-accent), var(--73-accent));
  color: var(--73-surface-strong);
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
  color: var(--73-ink);
}

.team-profile__desc {
  margin: 0 0 6px;
  color: var(--73-ink-soft);
  font-size: 14px;
  line-height: 1.5;
}

.team-profile__meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: var(--73-ink-placeholder);
}

.team-profile__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.team-profile__stat {
  padding: 20px 16px;
  border: 1px solid color-mix(in srgb, var(--73-border) 96%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--73-surface-strong) 92%, transparent);
  text-align: center;
  display: grid;
  gap: 4px;
}

.team-profile__stat strong {
  font-size: 28px;
  font-weight: 700;
  color: var(--73-ink);
}

.team-profile__stat span {
  font-size: 13px;
  color: var(--73-ink-muted);
}

.team-profile__section-title {
  margin: 0 0 14px;
  font-size: 18px;
  font-weight: 700;
  color: var(--73-ink);
}

.team-profile__empty {
  padding: 48px 16px;
  border: 1px dashed color-mix(in srgb, var(--73-ink-placeholder) 36%, transparent);
  border-radius: 12px;
  text-align: center;
  color: var(--73-ink-placeholder);
  font-size: 14px;
}

.team-profile__resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
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
