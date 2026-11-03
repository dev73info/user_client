<script setup lang="ts">
/**
 * 社区分栏页的顶部工具栏：页签、搜索、筛选、刷新、发布帖子。
 *
 * 状态由视图持有的 `CommunityListState` 传进来（与左侧帖子列表同一份），
 * 发布弹窗仍归列表面板（这里只回抛 `publish`，由视图调面板的 `openCreate`）。
 */
import { computed } from 'vue'
import { Plus, Refresh, Search, TButton, TIcon, TInput, TSelect } from 'ui_73info'
import type { SelectModelValue, SelectOptionItem } from 'ui_73info'

import type { CommunityListState } from '@/composables/useCommunityList'
import { COMMUNITY_STATUS_OPTIONS } from '@/shared/community'
import type { CommunityListMode } from '@/composables/useCommunityList'

const props = defineProps<{
  list: CommunityListState
  modes: Array<{ value: CommunityListMode; label: string }>
}>()

const emit = defineEmits<{ publish: [] }>()

/** TSelect 把空字符串当成「未选择」，所以「全部」项用一个不会被标签名 / 状态码命中的哨兵值 */
const ALL_VALUE = '__all__'

const tagOptions = computed<SelectOptionItem[]>(() => [
  { label: '全部标签', value: ALL_VALUE },
  ...props.list.tags.map((item) => ({ label: item.name, value: item.name })),
])

const tagValue = computed(() => props.list.tag || ALL_VALUE)

function changeTag(value: SelectModelValue) {
  // list 是父级传入的共享 reactive 状态（等同 store）：改的是它的字段，与列表面板共用同一份
  // eslint-disable-next-line vue/no-mutating-props
  props.list.tag = value === ALL_VALUE ? '' : String(value)
}

const statusOptions: SelectOptionItem[] = [
  { label: '全部状态', value: ALL_VALUE },
  ...COMMUNITY_STATUS_OPTIONS.map((item) => ({ label: item.label, value: item.value })),
]

const statusValue = computed(() => props.list.status || ALL_VALUE)

function changeStatus(value: SelectModelValue) {
  // eslint-disable-next-line vue/no-mutating-props
  props.list.status = value === ALL_VALUE ? '' : String(value)
}
</script>

<template>
  <!-- list 是父级传入的共享 reactive 列表状态（等同 store）：这里改的是它的字段，不是替换 prop，
       与列表面板共用同一份，不需要再包一层 v-model -->
  <!-- eslint-disable vue/no-mutating-props -->
  <header class="community-toolbar">
    <div class="community-toolbar__row">
      <div class="community-page__tabs" role="tablist" aria-label="社区帖子范围">
        <button
          v-for="item in props.modes"
          :key="item.value"
          type="button"
          role="tab"
          :aria-selected="props.list.mode === item.value"
          :class="{ active: props.list.mode === item.value }"
          @click="props.list.setMode(item.value)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="community-toolbar__actions">
        <TButton icon-only aria-label="刷新社区帖子" @click="props.list.load">
          <TIcon><Refresh /></TIcon>
        </TButton>
        <TButton
          variant="solid"
          tone="accent"
          class="community-toolbar__publish community-page__publish"
          @click="emit('publish')"
        >
          <TIcon><Plus /></TIcon>
          发布帖子
        </TButton>
      </div>
    </div>

    <form
      v-if="props.list.mode !== 'favorites'"
      class="community-filters"
      @submit.prevent="props.list.applyFilters"
    >
      <!-- 标签筛选在搜索框左侧：先缩小范围再搜，符合从左到右的筛选顺序 -->
      <TSelect
        class="community-filters__select"
        :model-value="tagValue"
        :options="tagOptions"
        aria-label="按标签筛选"
        @update:model-value="changeTag"
      />
      <TSelect
        v-if="props.list.mode === 'mine'"
        class="community-filters__select"
        :model-value="statusValue"
        :options="statusOptions"
        aria-label="按审核状态筛选"
        @update:model-value="changeStatus"
      />
      <TInput
        v-model="props.list.keyword"
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
      <TButton variant="solid" tone="accent" type="submit">搜索</TButton>
    </form>

    <div v-if="props.list.tagError" class="community-inline-error" role="alert">
      <span>{{ props.list.tagError }}</span>
      <button type="button" @click="props.list.loadTags">重试</button>
    </div>
  </header>
</template>

<style scoped>
/* 工具栏收成一张卡：与下方帖子行、正文面板同一层级，不再直接贴在页面底上 */
.community-toolbar {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid var(--73-border);
  border-radius: 14px;
  background: var(--73-surface-strong);
}

.community-toolbar__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.community-toolbar__actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.community-toolbar__publish {
  display: inline-flex;
  gap: 6px;
}

.community-page__tabs {
  display: flex;
  align-items: center;
  gap: 5px;
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

.community-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

/* 搜索框走 TInput（与工作台各列表页同一套高 / 圆角 / 描边），这里只给弹性宽度 */
.community-filters :deep(.community-filters__keyword) {
  flex: 1 1 220px;
  min-width: 0;
}

/* TSelect 根节点默认按内容定宽；这里只固定不参与伸缩。它关了 attrs 透传，
   父组件的 scope id 落不到根节点上，只能从工具栏 :deep() 选。 */
.community-filters :deep(.community-filters__select) {
  flex: 0 0 auto;
  font-size: 12px;
}

.community-inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--73-danger);
  font-size: 12px;
}

.community-inline-error button {
  border: 0;
  background: transparent;
  color: var(--73-accent);
  cursor: pointer;
}
</style>
