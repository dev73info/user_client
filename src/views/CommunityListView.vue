<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TEmpty } from 'ui_73info'

import type { CommunityPost } from '@/api/community'
import CommunityListPanel from '@/components/community/CommunityListPanel.vue'
import CommunityPostPanel from '@/components/community/CommunityPostPanel.vue'

const route = useRoute()
const router = useRouter()
const detailColumnRef = ref<HTMLElement | null>(null)
const isCommunityPage = computed(() => route.name === 'community')
const selectedPostId = computed(() => {
  const value = Number(route.query.post)
  return Number.isSafeInteger(value) && value > 0 ? value : null
})

async function selectPost(post: CommunityPost) {
  if (!isCommunityPage.value || selectedPostId.value === post.id) return
  await router.replace({ query: { ...route.query, post: String(post.id) } })
  if (window.innerWidth > 900) return
  await nextTick()
  if (typeof detailColumnRef.value?.scrollIntoView === 'function') {
    detailColumnRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function handlePostsLoaded(posts: CommunityPost[]) {
  if (!isCommunityPage.value || posts.length === 0) return
  if (posts.some((post) => post.id === selectedPostId.value)) return
  void selectPost(posts[0]!)
}
</script>

<template>
  <main class="community-page" :class="{ 'community-page--split': isCommunityPage }">
    <div class="community-page__list-column">
      <CommunityListPanel
        :selectable="isCommunityPage"
        :selected-post-id="selectedPostId"
        @select-post="selectPost"
        @posts-loaded="handlePostsLoaded"
        @created="selectPost"
      />
    </div>

    <section v-if="isCommunityPage" ref="detailColumnRef" class="community-page__detail-column">
      <CommunityPostPanel v-if="selectedPostId" :post-id="selectedPostId" />
      <TEmpty v-else description="选择左侧帖子查看内容" />
    </section>
  </main>
</template>

<style scoped>
.community-page {
  width: min(1440px, calc(100% - 24px));
  margin: 0 auto;
  padding: 24px 0 64px;
  color: var(--73-ink);
}
.community-page--split {
  display: grid;
  grid-template-columns: minmax(300px, 350px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.community-page__list-column {
  min-width: 0;
}
.community-page--split .community-page__list-column {
  position: sticky;
  top: 86px;
  max-height: calc(100vh - 102px);
  overflow: auto;
  scrollbar-gutter: stable;
}
.community-page__detail-column {
  min-width: 0;
}
@media (max-width: 900px) {
  .community-page--split {
    grid-template-columns: 1fr;
  }
  .community-page--split .community-page__list-column {
    position: static;
    max-height: none;
    overflow: visible;
    scrollbar-gutter: auto;
  }
}
@media (max-width: 640px) {
  .community-page {
    padding-top: 16px;
  }
}
</style>
