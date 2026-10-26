<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, TButton, TEmpty, TIcon, TLoading } from 'ui_73info'

import type { CreateCommunityPostPayload } from '@/api/community'
import CommunityPagination from '@/components/community/CommunityPagination.vue'
import CommunityPostCard from '@/components/community/CommunityPostCard.vue'
import CommunityPostFormDialog from '@/components/community/CommunityPostFormDialog.vue'
import { useCommunityAccess } from '@/composables/useCommunityAccess'
import { useCommunityList, type CommunityListMode } from '@/composables/useCommunityList'
import { useCommunityPostEditor } from '@/composables/useCommunityPostEditor'
import { COMMUNITY_STATUS_OPTIONS } from '@/shared/community'

const router = useRouter()
const { openRealname } = useCommunityAccess()
const list = reactive(useCommunityList())
const editor = reactive(useCommunityPostEditor())
const modes: Array<{ value: CommunityListMode; label: string }> = [
  { value: 'all', label: '全部帖子' },
  { value: 'mine', label: '我的帖子' },
  { value: 'favorites', label: '我的收藏' },
]

async function submitPost(payload: CreateCommunityPostPayload) {
  const saved = await editor.submit(payload)
  if (saved) await router.push({ name: 'community-post', params: { id: saved.id } })
}
</script>

<template>
  <main class="community-page">
    <header class="community-page__header">
      <h1>社区</h1>
      <TButton
        variant="solid"
        tone="accent"
        class="community-page__publish"
        @click="editor.openCreate"
      >
        <TIcon><Plus /></TIcon>
        发布帖子
      </TButton>
    </header>

    <div class="community-page__tabs" role="tablist" aria-label="社区帖子范围">
      <button
        v-for="item in modes"
        :key="item.value"
        type="button"
        role="tab"
        :aria-selected="list.mode === item.value"
        :class="{ active: list.mode === item.value }"
        @click="list.setMode(item.value)"
      >
        {{ item.label }}
      </button>
    </div>

    <form class="community-filters" @submit.prevent="list.applyFilters">
      <input
        v-model="list.keyword"
        class="community-filters__keyword"
        type="search"
        maxlength="80"
        placeholder="搜索标题、作者或标签"
        aria-label="搜索社区帖子"
        :disabled="list.mode === 'favorites'"
      />
      <select v-if="list.mode !== 'favorites'" v-model="list.tag" aria-label="按标签筛选">
        <option value="">全部标签</option>
        <option v-for="item in list.tags" :key="item.id" :value="item.name">{{ item.name }}</option>
      </select>
      <select v-if="list.mode === 'mine'" v-model="list.status" aria-label="按审核状态筛选">
        <option value="">全部状态</option>
        <option v-for="item in COMMUNITY_STATUS_OPTIONS" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
      <TButton variant="solid" tone="accent" type="submit" :disabled="list.mode === 'favorites'">
        搜索
      </TButton>
      <TButton type="button" @click="list.resetFilters">重置</TButton>
    </form>
    <div v-if="list.tagError" class="community-inline-error" role="alert">
      <span>{{ list.tagError }}</span>
      <button type="button" @click="list.loadTags">重试</button>
    </div>

    <section class="community-page__results" :aria-busy="list.loading">
      <TLoading :loading="list.loading" class="community-page__loading">
        <div v-if="list.error" class="community-error" role="alert">
          <span>{{ list.error }}</span>
          <TButton @click="list.load">重新加载</TButton>
        </div>
        <TEmpty v-else-if="!list.posts.length" :description="list.emptyText" />
        <div v-else class="community-page__posts">
          <CommunityPostCard v-for="post in list.posts" :key="post.id" :post="post" />
        </div>
      </TLoading>
    </section>

    <CommunityPagination
      v-if="!list.error && (list.posts.length > 0 || list.page > 1)"
      :page="list.page"
      :loading="list.loading"
      :has-previous="list.hasPrevious"
      :has-next="list.hasNext"
      @previous="list.previousPage"
      @next="list.nextPage"
    />

    <CommunityPostFormDialog
      v-model:open="editor.open"
      :post="editor.editingPost"
      :tags="list.tags"
      :submitting="editor.submitting"
      :error="editor.error"
      :error-code="editor.errorCode"
      @submit="submitPost"
      @realname="openRealname"
    />
  </main>
</template>

<style scoped>
.community-page {
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
  padding: 28px 0 64px;
  color: var(--73-ink);
}
.community-page__header,
.community-page__tabs,
.community-filters,
.community-inline-error,
.community-error {
  display: flex;
  align-items: center;
  gap: 12px;
}
.community-page__header {
  justify-content: space-between;
  margin-bottom: 22px;
}
.community-page__header h1 {
  margin: 0;
  font-size: 20px;
}
.community-page__publish {
  display: inline-flex;
  gap: 6px;
}
.community-page__tabs {
  gap: 6px;
  margin-bottom: 14px;
}
.community-page__tabs button {
  min-height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--73-ink-soft);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.community-page__tabs button.active {
  background: var(--73-accent-soft);
  color: var(--73-accent);
}
.community-filters {
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.community-filters input,
.community-filters select {
  min-height: 40px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
}
.community-filters__keyword {
  flex: 1 1 280px;
  min-width: 0;
}
.community-filters select {
  flex: 0 1 180px;
}
.community-page__loading {
  display: block;
  min-height: 180px;
}
.community-page__posts {
  display: grid;
  gap: 14px;
}
.community-error {
  justify-content: center;
  min-height: 160px;
  padding: 24px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  color: var(--73-danger);
  background: var(--73-surface-strong);
}
.community-inline-error {
  justify-content: space-between;
  margin-bottom: 14px;
  color: var(--73-danger);
  font-size: 12px;
}
.community-inline-error button {
  border: 0;
  background: transparent;
  color: var(--73-accent);
  cursor: pointer;
}
@media (max-width: 640px) {
  .community-page {
    padding-top: 18px;
  }
  .community-page__header {
    margin-bottom: 16px;
  }
  .community-page__tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .community-page__tabs button {
    min-height: 44px;
    padding: 0 6px;
  }
  .community-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .community-filters__keyword {
    grid-column: 1 / -1;
    width: 100%;
  }
  .community-filters input,
  .community-filters select,
  .community-filters :deep(button),
  .community-page__publish {
    min-height: 44px;
  }
  .community-filters select {
    width: 100%;
  }
  .community-error {
    flex-direction: column;
    text-align: center;
  }
}
</style>
