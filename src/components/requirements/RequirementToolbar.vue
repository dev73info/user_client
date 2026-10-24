<script setup lang="ts">
/**
 * 「我的需求」页的卡头 + 筛选工具栏 + 空态：只做展示与筛选交互 —— `keyword` / `selectedState`
 * 走 v-model 由外面持有，点「发布」与「清除筛选」只派发事件，不发请求、不改列表。
 */
import type { RequirementFilterKey, RequirementFilterOption } from '@/shared/requirementStatus'
import { RefreshLeft, Search, TButton, TIcon, TInput, TOption, TSelect } from 'ui_73info'

defineProps<{
  /** 状态下拉的四个选项（与顶部读数条同一份档位口径） */
  options: RequirementFilterOption[]
  /** 列表在加载且一条都没有：空态先报「加载中」，不显示「还没有提交过需求单」 */
  loading: boolean
  /** 需求单总条数（未筛选） */
  totalCount: number
  /** 当前筛选结果条数 */
  filteredCount: number
  /** 收窄了结果：工具栏右端给条数说明 */
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{ publish: []; resetFilters: [] }>()

const keyword = defineModel<string>('keyword', { required: true })
const selectedState = defineModel<RequirementFilterKey>('selectedState', { required: true })
</script>

<template>
  <div class="wb-card-head">
    <div class="wb-card-head__title-block">
      <h3 class="wb-card-head__title">需求列表</h3>
    </div>
    <div class="wb-card-head__actions">
      <TButton
        variant="solid"
        tone="accent"
        class="my-requirements-publish--head"
        @click="emit('publish')"
      >
        发布新需求
      </TButton>
    </div>
  </div>

  <div class="wb-toolbar">
    <TSelect
      v-model="selectedState"
      class="wb-toolbar__field wb-toolbar__field--requirement-state"
      aria-label="需求状态"
    >
      <TOption
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :label="option.label"
      />
    </TSelect>
    <TInput
      v-model="keyword"
      class="wb-toolbar__search"
      clearable
      placeholder="搜索需求标题、编号或发布人"
      aria-label="搜索需求"
    >
      <template #prefix
        ><TIcon><Search /></TIcon
      ></template>
    </TInput>
    <TButton
      variant="solid"
      tone="accent"
      class="my-requirements-publish--toolbar"
      aria-label="发布新需求"
      @click="emit('publish')"
    >
      发布
    </TButton>
    <!-- 工具栏不放「重置」：清空筛选的入口保留在下面空态的「清除筛选」；操作槽只在收窄了结果时给条数说明，无筛选时整槽不渲染、不留空容器。 -->
    <div v-if="hasActiveFilters" class="wb-toolbar__actions">
      <span class="wb-toolbar__hint"> 筛选出 {{ filteredCount }} / {{ totalCount }} 条 </span>
    </div>
  </div>

  <p v-if="loading && totalCount === 0" class="wb-empty" role="status">需求单加载中…</p>
  <div v-else-if="!filteredCount" class="wb-empty" role="status">
    <span class="wb-empty__title">
      {{ totalCount ? '没有符合条件的需求单' : '还没有提交过需求单' }}
    </span>
    <template v-if="totalCount">
      <div class="wb-empty__actions">
        <TButton variant="outline" @click="emit('resetFilters')">
          <TIcon><RefreshLeft /></TIcon><span>清除筛选</span>
        </TButton>
      </div>
    </template>
    <template v-else>点击右上角「发布新需求」即可创建你的第一个需求。</template>
  </div>
</template>

<style scoped>
/* 档位名只有三个字，状态下拉收窄；写 flex 基宽而非 width——TSelect 自带 width: 100% 会顶掉它（详见 portal-workbench.css）。 */
.wb-toolbar__field--requirement-state {
  flex: 0 1 140px;
}

/* 「发布新需求」放在「需求列表」卡头右端；手机档卡头整块收起，按钮改放搜索栏右端 */
.my-requirements-page .wb-card-head:has(.my-requirements-publish--head) {
  align-items: center;
}
.my-requirements-publish--toolbar {
  display: none;
}

@media (max-width: 640px) {
  .my-requirements-page .wb-card-head:has(.my-requirements-publish--head) {
    display: none;
  }
  /* 搜索栏右端的小号胶囊：浅蓝底蓝字，融进白色搜索栏，不压过搜索框本身 */
  .my-requirements-publish--toolbar,
  .my-requirements-publish--toolbar:hover,
  .my-requirements-publish--toolbar:focus-visible {
    display: inline-flex;
    flex: 0 0 auto;
    height: 32px;
    min-height: 32px;
    margin-left: 4px;
    padding: 0 16px;
    border: 0 !important;
    border-radius: 999px;
    background: var(--73-accent-soft) !important;
    box-shadow: none !important;
    color: var(--73-accent) !important;
    font-size: 13px;
    font-weight: 700;
  }
  .my-requirements-publish--toolbar:active {
    background: var(--73-accent-soft) !important;
  }
}
</style>
