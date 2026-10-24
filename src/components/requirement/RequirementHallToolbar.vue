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
import { Close, Plus, Refresh, TButton, TIcon, TSelect, type SelectModelValue } from 'ui_73info'

import type { RequirementGuaranteeFilter } from '@/shared/requirementDisplay'

defineProps<{
  /** 当前生效的担保方式（`all` / `platform_guarantee` / `self_managed`） */
  guaranteeFilter: RequirementGuaranteeFilter
  /** 下拉选项：全部 + 两档担保方式，文案与卡片上的胶囊同一口径 */
  options: Array<{ label: string; value: string }>
  /** 大厅列表加载中 */
  loading: boolean
  /** 大厅概览加载中 */
  overviewLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'guarantee-change', value: SelectModelValue): void
  (e: 'clear-keyword'): void
  (e: 'publish'): void
  (e: 'refresh'): void
}>()

const keyword = defineModel<string>('keyword', { required: true })
</script>

<template>
  <div class="requirement-hall__toolbar">
    <TSelect
      class="requirement-hall__guarantee-select"
      :model-value="guaranteeFilter"
      :options="options"
      aria-label="按担保方式筛选需求"
      @update:model-value="emit('guarantee-change', $event)"
    />

    <div class="requirement-hall__search">
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索标题、编号"
        title="可按需求标题、编号、说明、担保方式与状态搜索"
      />
      <button
        v-if="keyword.trim()"
        class="requirement-hall__search-clear"
        type="button"
        aria-label="清空搜索"
        @click="emit('clear-keyword')"
      >
        <TIcon>
          <Close />
        </TIcon>
      </button>
    </div>

    <div class="portal-page__header-actions requirement-hall__header-actions">
      <button class="requirement-hall__publish-btn" type="button" @click="emit('publish')">
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

/* 担保方式下拉：定宽，避免切换选项时整行跟着跳宽。
   TSelect 关了 attrs 透传（`inheritAttrs: false`），根节点拿不到本文件的 scope id，
   所以只能从工具栏用 :deep() 选它——直接写 .requirement-hall__guarantee-select 是选不到的。 */
.requirement-hall__toolbar :deep(.requirement-hall__guarantee-select) {
  flex: 0 0 auto;
  width: 132px;
}

.requirement-hall__search {
  position: relative;
  display: flex;
  flex: 1 1 200px;
  min-width: 0;
  align-items: center;
}

.requirement-hall__toolbar input {
  width: 100%;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--73-accent) 86%, transparent);
  border-radius: 14px;
  background: var(--73-surface-strong);
  color: var(--73-ink);
  padding: 0 40px 0 14px;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.requirement-hall__toolbar input::-webkit-search-cancel-button,
.requirement-hall__toolbar input::-webkit-search-decoration {
  display: none;
  -webkit-appearance: none;
}

.requirement-hall__search-clear {
  position: absolute;
  right: 8px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--73-ink-placeholder);
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.requirement-hall__search-clear:hover {
  background: color-mix(in srgb, var(--73-border) 66%, transparent);
  color: var(--73-ink-soft);
}

.requirement-hall__toolbar input:focus {
  border-color: color-mix(in srgb, var(--73-accent) 58%, transparent);
  background: var(--73-surface-strong);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--73-accent) 10%, transparent);
}

@media (max-width: 640px) {
  /* 窄屏：工具栏由一行拆成多行，控件各自占满 */
  .requirement-hall__toolbar {
    flex-wrap: wrap;
  }

  .requirement-hall__toolbar :deep(.requirement-hall__guarantee-select),
  .requirement-hall__search,
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
