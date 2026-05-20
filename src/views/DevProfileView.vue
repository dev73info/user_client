<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl } from '@/api/http'
import { listAllPublicMcResources, type PublicMcResourceItem } from '@/api/resources'
import { getUserBadges, getBadges, type BadgeDefinition, type UserBadge } from '@/api/invite'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { useToast } from '@/composables/useToast'
import BadgeDisplay from '@/components/BadgeDisplay.vue'

const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const username = computed(() => String(route.params.username || '').trim())
const loading = ref(false)
const allResources = ref<PublicMcResourceItem[]>([])
const userBadges = ref<UserBadge[]>([])
const allBadges = ref<BadgeDefinition[]>([])

const userResources = computed(() =>
  allResources.value.filter((r) => r.creator === username.value),
)

const creatorInfo = computed(() => userResources.value[0] ?? null)

const stats = computed(() => ({
  resourceCount: userResources.value.length,
  badgeCount: userBadges.value.length,
  totalLikes: userResources.value.reduce((sum, r) => sum + r.like_count, 0),
  platforms: [...new Set(userResources.value.map((r) => r.platform).filter(Boolean))].length,
}))

const failedAvatarUrls = ref<Set<string>>(new Set())
const failedCoverUrls = ref<Set<string>>(new Set())

function avatarSrc() {
  const url = creatorInfo.value?.creator_avatar_url
  if (!url) return ''
  const full = apiUrl(url)
  return failedAvatarUrls.value.has(full) ? '' : full
}

function coverSrc(resource: PublicMcResourceItem) {
  if (!resource.cover_url) return ''
  const full = apiUrl(resource.cover_url)
  return failedCoverUrls.value.has(full) ? '' : full
}

function onAvatarError() {
  const url = creatorInfo.value?.creator_avatar_url
  if (url) failedAvatarUrls.value.add(apiUrl(url))
}

function onCoverError(resource: PublicMcResourceItem) {
  if (resource.cover_url) failedCoverUrls.value.add(apiUrl(resource.cover_url))
}

onMounted(async () => {
  await loadData()
})

async function loadData() {
  if (!username.value) return
  loading.value = true
  try {
    const [resources, badges, definitions] = await Promise.all([
      listAllPublicMcResources(),
      getUserBadges(username.value),
      getBadges(),
    ])
    allResources.value = resources
    userBadges.value = badges.badges
    allBadges.value = definitions
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载开发者信息失败', 'error')
  } finally {
    loading.value = false
  }
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
  <main class="dev-profile" v-loading="loading">
    <!-- 头部 -->
    <section class="dev-profile__head">
      <div class="dev-profile__avatar-wrap">
        <img
          v-if="avatarSrc()"
          :src="avatarSrc()"
          :alt="username"
          class="dev-profile__avatar"
          @error="onAvatarError"
        />
        <span v-else class="dev-profile__avatar dev-profile__avatar--text">
          {{ username.slice(0, 1).toUpperCase() }}
        </span>
      </div>
      <div class="dev-profile__head-content">
        <h1 class="dev-profile__name">{{ username }}</h1>
        <p class="dev-profile__badge-line" v-if="userBadges.length > 0">
          <BadgeDisplay :badges="userBadges" :limit="4" />
        </p>
        <p class="dev-profile__badge-line dev-profile__badge-line--empty" v-else>
          暂未获得徽章
        </p>
      </div>
    </section>

    <!-- 统计 -->
    <section class="dev-profile__stats">
      <div class="dev-profile__stat">
        <strong>{{ stats.resourceCount }}</strong>
        <span>资源项目</span>
      </div>
      <div class="dev-profile__stat">
        <strong>{{ stats.badgeCount }}</strong>
        <span>荣誉徽章</span>
      </div>
      <div class="dev-profile__stat">
        <strong>{{ stats.totalLikes }}</strong>
        <span>获得点赞</span>
      </div>
      <div class="dev-profile__stat">
        <strong>{{ stats.platforms }}</strong>
        <span>涉及平台</span>
      </div>
    </section>

    <!-- 资源列表 -->
    <section class="dev-profile__resources">
      <h2 class="dev-profile__section-title">公开资源</h2>
      <div v-if="userResources.length === 0" class="dev-profile__empty">
        <p>该开发者暂未发布公开资源</p>
      </div>
      <div v-else class="dev-profile__resource-grid">
        <article
          v-for="resource in userResources"
          :key="resource.id"
          class="dev-profile__resource-card"
          @click="openResource(resource)"
        >
          <div class="dev-profile__resource-cover-wrap">
            <img
              v-if="coverSrc(resource)"
              :src="coverSrc(resource)"
              :alt="resource.title"
              class="dev-profile__resource-cover"
              @error="onCoverError(resource)"
            />
            <span
              v-else
              class="dev-profile__resource-cover dev-profile__resource-cover--text"
            >
              {{ resource.title.slice(0, 1).toUpperCase() }}
            </span>
          </div>
          <div class="dev-profile__resource-body">
            <h3 class="dev-profile__resource-title">{{ resource.title }}</h3>
            <p class="dev-profile__resource-desc">
              {{ resource.description || "暂无简介" }}
            </p>
            <div class="dev-profile__resource-meta">
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
.dev-profile {
  width: min(1120px, calc(100% - 32px));
  margin: 24px auto 48px;
  display: grid;
  gap: 24px;
}

.dev-profile__head {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 28px 32px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.98),
    rgba(248, 250, 252, 0.94)
  );
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
}

.dev-profile__avatar-wrap {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
}

.dev-profile__avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(96, 165, 250, 0.4);
  display: block;
}

.dev-profile__avatar--text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
}

.dev-profile__head-content {
  min-width: 0;
}

.dev-profile__name {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.dev-profile__badge-line {
  margin: 0;
}

.dev-profile__badge-line--empty {
  color: #94a3b8;
  font-size: 13px;
}

.dev-profile__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.dev-profile__stat {
  padding: 20px 16px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  text-align: center;
  display: grid;
  gap: 4px;
}

.dev-profile__stat strong {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.dev-profile__stat span {
  font-size: 13px;
  color: #64748b;
}

.dev-profile__section-title {
  margin: 0 0 14px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.dev-profile__empty {
  padding: 48px 16px;
  border: 1px dashed rgba(148, 163, 184, 0.36);
  border-radius: 12px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}

.dev-profile__resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.dev-profile__resource-card {
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.dev-profile__resource-card:hover {
  border-color: rgba(59, 130, 246, 0.36);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-2px);
}

.dev-profile__resource-cover-wrap {
  width: 100%;
  height: 160px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  overflow: hidden;
}

.dev-profile__resource-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dev-profile__resource-cover--text {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
  color: #94a3b8;
  font-size: 36px;
  font-weight: 700;
  object-fit: unset;
}

.dev-profile__resource-body {
  padding: 14px 16px;
  display: grid;
  gap: 6px;
}

.dev-profile__resource-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-profile__resource-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.dev-profile__resource-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #94a3b8;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .dev-profile__stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .dev-profile__head {
    flex-direction: column;
    text-align: center;
  }

  .dev-profile__resource-grid {
    grid-template-columns: 1fr;
  }
}
</style>
