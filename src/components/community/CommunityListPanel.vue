<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Search, TButton, TEmpty, TIcon, TInput, TLoading, TSelect } from 'ui_73info'
import type { SelectModelValue, SelectOptionItem } from 'ui_73info'

import type { CommunityPost, CreateCommunityPostPayload } from '@/api/community'
import CommunityPagination from '@/components/community/CommunityPagination.vue'
import CommunityPostCard from '@/components/community/CommunityPostCard.vue'
import CommunityPostFormDialog from '@/components/community/CommunityPostFormDialog.vue'
import { useCommunityAccess } from '@/composables/useCommunityAccess'
import type { CommunityListMode, CommunityListState } from '@/composables/useCommunityList'
import { useCommunityPostEditor } from '@/composables/useCommunityPostEditor'
import { COMMUNITY_STATUS_OPTIONS } from '@/shared/community'

const props = withDefaults(
  defineProps<{
    /** 列表状态：分栏页由视图持有（顶部工具栏与列表共用同一份），收藏页也在视图里创建。 */
    list: CommunityListState
    selectable?: boolean
    selectedPostId?: number | null
    /** 工作台收藏页只保留「我的帖子 / 我的收藏」，不提供公共社区的全量流。 */
    hideAllMode?: boolean
    /** 分栏页的工具栏已经提到页面顶部：面板内不再重复渲染页签 / 搜索 / 筛选 / 发布 */
    hideChrome?: boolean
  }>(),
  { selectable: false, selectedPostId: null, hideAllMode: false, hideChrome: false },
)

const emit = defineEmits<{
  (e: 'posts-loaded', posts: CommunityPost[]): void
  (e: 'select-post', post: CommunityPost): void
  (e: 'created', post: CommunityPost): void
}>()

const router = useRouter()
const { openRealname } = useCommunityAccess()
const list = props.list
const editor = reactive(useCommunityPostEditor())
const allModes: Array<{ value: CommunityListMode; label: string }> = [
  { value: 'all', label: '全部帖子' },
  { value: 'mine', label: '我的帖子' },
  { value: 'favorites', label: '我的收藏' },
]
const modes = computed(() =>
  props.hideAllMode ? allModes.filter((item) => item.value !== 'all') : allModes,
)

/** TSelect 把空字符串当成「未选择」，「全部」项改用不会被标签名 / 状态码命中的哨兵值 */
const ALL_VALUE = '__all__'

const tagOptions = computed<SelectOptionItem[]>(() => [
  { label: '全部标签', value: ALL_VALUE },
  ...list.tags.map((item) => ({ label: item.name, value: item.name })),
])

const tagValue = computed(() => list.tag || ALL_VALUE)
const statusValue = computed(() => list.status || ALL_VALUE)

const statusOptions: SelectOptionItem[] = [
  { label: '全部状态', value: ALL_VALUE },
  ...COMMUNITY_STATUS_OPTIONS.map((item) => ({ label: item.label, value: item.value })),
]

function changeTag(value: SelectModelValue) {
  list.tag = value === ALL_VALUE ? '' : String(value)
}

function changeStatus(value: SelectModelValue) {
  list.status = value === ALL_VALUE ? '' : String(value)
}

/** 顶部工具栏的「发布帖子」通过视图调这里打开弹窗（弹窗仍归面板）。 */
function openCreate() {
  editor.openCreate()
}

defineExpose({ openCreate })

watch(
  () => list.posts,
  (posts) => emit('posts-loaded', posts),
  { immediate: true },
)

watch(
  () => props.hideAllMode,
  (hidden) => {
    if (hidden && list.mode === 'all') {
      list.setMode('favorites')
    }
  },
  { immediate: true },
)

async function submitPost(payload: CreateCommunityPostPayload) {
  const saved = await editor.submit(payload)
  if (!saved) return
  if (props.selectable) {
    emit('created', saved)
    return
  }
  await router.push({ name: 'community-post', params: { id: saved.id } })
}
</script>

<template>
  <section
    class="community-list-panel"
    :class="{
      'community-list-panel--rail': selectable,
      'community-list-panel--two-modes': hideAllMode,
    }"
    aria-label="社区帖子列表"
  >
    <template v-if="!hideChrome">
      <header class="community-page__header">
        <h1>{{ hideAllMode ? '我的帖子' : '社区' }}</h1>
        <div class="community-page__header-actions">
          <TButton icon-only aria-label="刷新社区帖子" @click="list.load">
            <TIcon><Refresh /></TIcon>
          </TButton>
          <TButton
            variant="solid"
            tone="accent"
            class="community-page__publish"
            @click="editor.openCreate"
          >
            <TIcon><Plus /></TIcon>
            发布帖子
          </TButton>
        </div>
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

      <form
        v-if="list.mode !== 'favorites'"
        class="community-filters"
        @submit.prevent="list.applyFilters"
      >
        <TSelect
          class="community-filters__select"
          :model-value="tagValue"
          :options="tagOptions"
          aria-label="按标签筛选"
          @update:model-value="changeTag"
        />
        <TSelect
          v-if="list.mode === 'mine'"
          class="community-filters__select"
          :model-value="statusValue"
          :options="statusOptions"
          aria-label="按审核状态筛选"
          @update:model-value="changeStatus"
        />
        <TInput
          v-model="list.keyword"
          class="community-filters__keyword"
          clearable
          :maxlength="80"
          placeholder="搜索标题、作者或标签"
          aria-label="搜索社区帖子"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>
        <TButton variant="solid" tone="accent" type="submit"> 搜索 </TButton>
      </form>
      <div v-if="list.tagError" class="community-inline-error" role="alert">
        <span>{{ list.tagError }}</span>
        <button type="button" @click="list.loadTags">重试</button>
      </div>
    </template>

    <section class="community-page__results" :aria-busy="list.loading">
      <TLoading :loading="list.loading" class="community-page__loading">
        <div v-if="list.error" class="community-error" role="alert">
          <span>{{ list.error }}</span>
          <TButton @click="list.load">重新加载</TButton>
        </div>
        <TEmpty v-else-if="!list.posts.length" :description="list.emptyText" variant="plain" />
        <div v-else class="community-page__posts">
          <CommunityPostCard
            v-for="post in list.posts"
            :key="post.id"
            :post="post"
            :selectable="selectable"
            :active="selectedPostId === post.id"
            @select="emit('select-post', $event)"
          />
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
  </section>
</template>

<style scoped>
.community-list-panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--73-border);
  border-radius: 14px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
}
.community-page__header,
.community-page__header-actions,
.community-page__tabs,
.community-filters,
.community-inline-error,
.community-error {
  display: flex;
  align-items: center;
  gap: 10px;
}
.community-page__header {
  justify-content: space-between;
  margin-bottom: 14px;
}
.community-page__header-actions {
  margin-left: auto;
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
  gap: 5px;
  margin-bottom: 12px;
}
.community-page__tabs button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--73-ink-soft);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.community-page__tabs button.active {
  background: var(--73-accent-soft);
  color: var(--73-accent);
}
/* 社区列表的筛选条：下拉定宽排在搜索框左侧，搜索框吃剩余宽度，按钮只占自身宽度。 */
.community-filters {
  flex-wrap: wrap;
  margin-bottom: 12px;
}
/* 搜索框走 TInput（与工作台各列表页同一套高 / 圆角 / 描边），这里只给弹性宽度 */
.community-filters :deep(.community-filters__keyword) {
  flex: 1 1 220px;
  min-width: 0;
}
/* TSelect 根节点默认 width: 100%，这里按内容收窄；它关了 attrs 透传，
   父组件的 scope id 落不到根节点上，只能从面板 :deep() 选。 */
.community-filters :deep(.community-filters__select) {
  flex: 0 0 auto;
  width: 136px;
  font-size: 12px;
}
.community-page__loading {
  display: block;
  min-height: 180px;
}
.community-page__posts {
  display: grid;
  gap: 8px;
}
.community-error {
  justify-content: center;
  min-height: 160px;
  padding: 20px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  color: var(--73-danger);
  background: var(--73-surface-strong);
}
.community-inline-error {
  justify-content: space-between;
  margin-bottom: 12px;
  color: var(--73-danger);
  font-size: 12px;
}
.community-inline-error button {
  border: 0;
  background: transparent;
  color: var(--73-accent);
  cursor: pointer;
}
.community-list-panel--rail {
  padding: 12px;
}
.community-list-panel--rail .community-page__tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.community-list-panel--rail.community-list-panel--two-modes .community-page__tabs {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.community-list-panel--rail .community-page__tabs button {
  min-height: 36px;
  padding: 0 4px;
}
.community-list-panel--rail .community-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.community-list-panel--rail .community-filters :deep(.community-filters__keyword) {
  grid-column: 1 / -1;
}
.community-list-panel--rail .community-filters :deep(.community-filters__select) {
  width: 100%;
}
.community-list-panel--rail .community-filters :deep(button) {
  width: 100%;
}
@media (max-width: 640px) {
  .community-list-panel {
    padding: 14px;
  }
  .community-page__header {
    margin-bottom: 14px;
  }
  .community-page__tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .community-list-panel--two-modes .community-page__tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .community-page__tabs button,
  .community-filters :deep(.community-filters__keyword),
  .community-filters :deep(.community-filters__select),
  .community-filters :deep(button),
  .community-page__publish {
    min-height: 44px;
  }
  .community-error {
    flex-direction: column;
    text-align: center;
  }
}
</style>
