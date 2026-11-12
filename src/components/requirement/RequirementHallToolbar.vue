<script setup lang="ts">
/**
 * 需求大厅的工具栏：担保方式下拉 + 关键词搜索 + 「发布需求」/「刷新」。
 *
 * 从 `views/RequirementHallView.vue` 抽出来，模板、文案与样式逐段照搬；组件只上传事件，
 * 真正的筛选与取数在页面（`useRequirementHall` / `useRequirementHallPublish`）里。
 *
 * 关键词是本地过滤，用 `v-model:keyword` 直接回写；担保方式是服务端筛选，
 * 换值要回到第一页重新拉取，所以只把选中的值抛上去，由页面里的 `onGuaranteeFilterChange` 处理。
 */
import {
  Plus,
  Refresh,
  Search,
  TButton,
  TIcon,
  TInput,
  TSelect,
  type SelectModelValue,
} from 'ui_73info'

import type { RequirementGuaranteeFilter } from '@/shared/requirementDisplay'

defineProps<{
  /** 当前生效的担保方式（`all` / `platform_guarantee` / `self_managed`） */
  guaranteeFilter: RequirementGuaranteeFilter
  /** 下拉选项：全部 + 两档担保方式，文案与卡片上的胶囊同一口径 */
  options: Array<{ label: string; value: string }>
  /** 当前排序（`latest` / `price_desc`） */
  sort: string
  /** 排序下拉选项 */
  sortOptions: Array<{ label: string; value: string }>
  /** 大厅列表加载中 */
  loading: boolean
  /** 大厅概览加载中 */
  overviewLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'guarantee-change', value: SelectModelValue): void
  (e: 'sort-change', value: SelectModelValue): void
  (e: 'clear-keyword'): void
  (e: 'publish'): void
  (e: 'refresh'): void
}>()

const keyword = defineModel<string>('keyword', { required: true })
</script>

<template>
  <div class="requirement-hall__toolbar" data-tour="requirement-hall:1">
    <TSelect
      class="requirement-hall__guarantee-select"
      :model-value="guaranteeFilter"
      :options="options"
      aria-label="按担保方式筛选需求"
      @update:model-value="emit('guarantee-change', $event)"
    />

    <TSelect
      class="requirement-hall__sort-select"
      :model-value="sort"
      :options="sortOptions"
      aria-label="需求排序方式"
      @update:model-value="emit('sort-change', $event)"
    />

    <TInput
      v-model="keyword"
      class="requirement-hall__search"
      clearable
      placeholder="搜索标题、编号"
      aria-label="搜索需求标题或编号"
      title="可按需求标题、编号、说明、担保方式与状态搜索"
      @clear="emit('clear-keyword')"
    >
      <template #prefix>
        <TIcon>
          <Search />
        </TIcon>
      </template>
    </TInput>

    <div class="portal-page__header-actions requirement-hall__header-actions">
      <button
        class="requirement-hall__publish-btn"
        type="button"
        data-tour="requirement-hall:4"
        @click="emit('publish')"
      >
        <TIcon>
          <Plus />
        </TIcon>
        <span>发布需求</span>
      </button>
      <TButton
        icon-only
        :loading="loading || overviewLoading"
        aria-label="刷新"
        title="刷新"
        @click="emit('refresh')"
      >
        <TIcon>
          <Refresh />
        </TIcon>
      </TButton>
    </div>
  </div>
</template>

<style scoped>
.requirement-hall__header-actions {
  flex: 0 0 auto;
  align-self: center;
  gap: 8px;
}

/* 发布需求：主按钮。刷新按钮改用库里的 TButton（icon-only，见模板），
   不再走这里的一套自定义底色 / 描边。 */
.requirement-hall__publish-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.requirement-hall__publish-btn {
  padding: 0 14px;
  background: var(--73-accent);
  color: var(--73-surface-strong);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--73-accent) 18%, transparent);
}

.requirement-hall__publish-btn:hover {
  background: var(--73-app-accent-strong);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--73-accent) 22%, transparent);
  transform: translateY(-1px);
}

/* 刷新按钮的样式由库里的 TButton（icon-only，outline / neutral / md）承担，
   与工作台概览条上的「刷新」同一个实现，这里不再自定义。 */

/* 工具栏：担保方式下拉 + 关键词搜索 + 操作按钮压在同一行里。
   窄屏在文末媒体查询里改回换行。 */
.requirement-hall__toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

/* 担保与排序下拉：宽度跟当前文案走，不再固定定宽。
   TSelect 关了 attrs 透传（`inheritAttrs: false`），根节点拿不到本文件的 scope id，
   所以只能从工具栏用 :deep() 选它——直接写 .requirement-hall__guarantee-select 是选不到的。 */
.requirement-hall__toolbar :deep(.requirement-hall__guarantee-select),
.requirement-hall__toolbar :deep(.requirement-hall__sort-select) {
  flex: 0 0 auto;
}

/* 搜索框走 TInput（与工作台各列表页同一套高 / 圆角 / 描边），这里只给弹性宽度 */
.requirement-hall__toolbar :deep(.requirement-hall__search) {
  flex: 1 1 200px;
  min-width: 0;
}

@media (max-width: 640px) {
  /* 窄屏：工具栏由一行拆成多行，控件各自占满 */
  .requirement-hall__toolbar {
    flex-wrap: wrap;
  }

  .requirement-hall__toolbar :deep(.requirement-hall__guarantee-select),
  .requirement-hall__toolbar :deep(.requirement-hall__sort-select),
  .requirement-hall__toolbar :deep(.requirement-hall__search),
  .portal-page--nav .requirement-hall__header-actions {
    flex: 1 1 100%;
    width: auto;
  }

  .portal-page--nav .requirement-hall__header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .requirement-hall__publish-btn {
    width: 100%;
  }
}
</style>
