<script setup lang="ts">
import SearchRequirementCard from '@/components/search/SearchRequirementCard.vue'
import SearchRequirementDetailModal from '@/components/search/SearchRequirementDetailModal.vue'
import SearchResourceCard from '@/components/search/SearchResourceCard.vue'
import { useSearchRequirementPreview } from '@/composables/useSearchRequirementPreview'
import { useSearchResultNavigation } from '@/composables/useSearchResultNavigation'
import { useSearchResults } from '@/composables/useSearchResults'

/**
 * 搜索结果页的壳（R047 拆分：1017 → 本文件）。
 *
 * 页面只有一件自有的事：把「路由 query → 取数 → 两类结果」摆成两段卡片流，
 * 其余四块各归其位：
 * - 取数、关键词 / 范围的推导与前端过滤 → `composables/useSearchResults`
 * - 两处落点（资源页内详情态 / 需求工作台详情）→ `useSearchResultNavigation`
 * - 需求详情弹窗的状态与补详情 → `useSearchRequirementPreview`
 * - 卡片与弹窗的 DOM → `components/search/*`，视觉在 `styles/portal-search.css`
 *
 * **只剩三样东西必须留在视图**：加载骨架、失败 / 空态三选一（整页态，不属于任何一块），
 * 以及弹窗遮罩——遮罩是视图自己的元素，`--sr-*` 色板也挂在这两个容器上，
 * 抽进子组件就少了「自定义属性沿 DOM 继承下去」那条路（卡片与弹窗只写 `var()`）。
 */
const {
  loading,
  loadError,
  keyword,
  tagTree,
  filteredResources,
  filteredRequirements,
  resultCount,
  resultSummary,
  loadSearchData,
} = useSearchResults()
const { openResource, openRequirementWorkbench, openHome } = useSearchResultNavigation({
  keyword,
  tagTree,
})
const {
  selectedRequirement,
  descriptionHtml,
  acceptanceHtml,
  canClaim,
  open: openRequirement,
  close: closeRequirementDetail,
} = useSearchRequirementPreview()
</script>

<template>
  <main class="portal-page portal-search-page">
    <section class="portal-page__panel portal-search-page__hero">
      <div class="portal-page__section-header portal-search-page__header">
        <div>
          <h2>{{ keyword ? `“${keyword}” 的搜索结果` : '输入关键词开始搜索' }}</h2>
          <p class="portal-search-page__summary">{{ resultSummary }}</p>
        </div>
        <button class="portal-page__link-btn" type="button" @click="openHome">返回首页</button>
      </div>
    </section>

    <section v-if="loading" class="portal-page__card-grid portal-search-page__grid">
      <article
        v-for="item in 4"
        :key="item"
        class="portal-page__card portal-page__resource-skeleton"
      >
        <span class="portal-page__skeleton-chip"></span>
        <span class="portal-page__skeleton-title"></span>
        <span class="portal-page__skeleton-line portal-page__skeleton-line--wide"></span>
        <span class="portal-page__skeleton-line"></span>
        <span class="portal-page__skeleton-action"></span>
      </article>
    </section>

    <section v-else-if="loadError" class="portal-page__empty portal-page__empty--stacked">
      <strong>搜索结果加载失败</strong>
      <span>{{ loadError }}</span>
      <button class="portal-page__action" type="button" @click="loadSearchData">重新加载</button>
    </section>

    <section v-else-if="resultCount === 0" class="portal-page__empty portal-page__empty--stacked">
      <strong>{{ keyword ? '没有找到匹配结果' : '还没有输入搜索关键词' }}</strong>
    </section>

    <template v-else>
      <section
        v-if="filteredResources.length"
        class="portal-page__panel portal-search-page__section"
      >
        <div class="portal-page__section-header">
          <div>
            <h2>资源项目</h2>
          </div>
          <span class="portal-page__loading-chip">{{ filteredResources.length }} 条</span>
        </div>

        <div class="portal-page__card-grid portal-search-page__grid">
          <SearchResourceCard
            v-for="resource in filteredResources"
            :key="resource.id"
            :resource="resource"
            @open="openResource(resource)"
          />
        </div>
      </section>

      <section
        v-if="filteredRequirements.length"
        class="portal-page__panel portal-search-page__section"
      >
        <div class="portal-page__section-header">
          <div>
            <h2>需求项目</h2>
          </div>
          <span class="portal-page__loading-chip">{{ filteredRequirements.length }} 条</span>
        </div>

        <div class="portal-page__card-grid portal-search-page__grid">
          <SearchRequirementCard
            v-for="requirement in filteredRequirements"
            :key="requirement.requirement_id"
            :requirement="requirement"
            @open="openRequirement(requirement)"
          />
        </div>
      </section>
    </template>
  </main>

  <Teleport to="body">
    <div
      v-if="selectedRequirement"
      class="portal-search-detail-wrap"
      @click.self="closeRequirementDetail"
    >
      <SearchRequirementDetailModal
        :requirement="selectedRequirement"
        :description-html="descriptionHtml"
        :acceptance-html="acceptanceHtml"
        :can-claim="canClaim"
        @close="closeRequirementDetail"
        @claim="openRequirementWorkbench(selectedRequirement)"
      />
    </div>
  </Teleport>
</template>

<style scoped>
/* 本页色板（`--sr-*`）：拆页时从原 scoped 块逐条提上来，**取值一字未改**，
   卡片（`styles/portal-search.css`）与弹窗（`components/search/*`）只写 `var(--sr-*)`，
   所以新文件零裸色值，而本文件原有的 raw-color 基线条目继续有效（45 处 → 下面这些）。 */
.portal-search-page,
.portal-search-detail-wrap {
  /* 文字与描边 */
  --sr-ink: var(--73-ink);
  --sr-ink-soft: var(--73-ink-soft);
  --sr-ink-muted: var(--73-ink-soft);
  --sr-text-muted: var(--73-ink-muted);
  --sr-brand: var(--73-accent);
  --sr-brand-strong: var(--73-accent);
  --sr-on-brand: var(--73-surface-strong);
  --sr-surface: var(--73-surface-strong);
  --sr-brand-line: color-mix(in srgb, var(--73-accent) 34%, transparent);
  --sr-brand-line-strong: color-mix(in srgb, var(--73-accent) 42%, transparent);
  --sr-detail-line: color-mix(in srgb, var(--73-ink-disabled) 82%, transparent);
  --sr-close-line: color-mix(in srgb, var(--73-ink-disabled) 86%, transparent);
  --sr-divider: color-mix(in srgb, var(--73-border) 84%, transparent);
  --sr-divider-soft: color-mix(in srgb, var(--73-border) 76%, transparent);
  /* 卡片：封面渐变、标签胶囊、悬停与「查看需求」入口 */
  --sr-cover-from: var(--73-accent-soft);
  --sr-cover-to: var(--73-accent-soft);
  --sr-chip-bg: color-mix(in srgb, var(--73-surface-strong) 96%, transparent);
  --sr-chip-line: color-mix(in srgb, var(--73-border) 92%, transparent);
  --sr-card-hover-line: color-mix(in srgb, var(--73-accent) 84%, transparent);
  --sr-card-hover-shadow: color-mix(in srgb, var(--73-accent) 12%, transparent);
  --sr-action-bg: color-mix(in srgb, var(--73-accent-soft) 86%, transparent);
  --sr-action-line: color-mix(in srgb, var(--73-accent) 72%, transparent);
  --sr-action-hover-shadow: color-mix(in srgb, var(--73-accent) 18%, transparent);
  /* 弹窗：底、抬头、评审面板与接取按钮 */
  --sr-head-bg: color-mix(in srgb, var(--73-surface-strong) 96%, transparent);
  --sr-panel-line: color-mix(in srgb, var(--73-ink) 8%, transparent);
  --sr-panel-from: color-mix(in srgb, var(--73-surface-strong) 96%, transparent);
  --sr-panel-to: color-mix(in srgb, var(--73-surface-strong) 92%, transparent);
  --sr-value-bg: color-mix(in srgb, var(--73-surface-strong) 90%, transparent);
  --sr-value-line: color-mix(in srgb, var(--73-ink-placeholder) 12%, transparent);
  --sr-actions-bg: color-mix(in srgb, var(--73-surface-strong) 62%, transparent);
  --sr-detail-shadow: color-mix(in srgb, var(--73-ink) 22%, transparent);
  --sr-bind-shadow: color-mix(in srgb, var(--73-accent) 16%, transparent);
  --sr-bind-hover-shadow: color-mix(in srgb, var(--73-accent) 22%, transparent);
  --sr-scrim: color-mix(in srgb, var(--73-ink) 28%, transparent);
}

/* 遮罩留在视图：弹窗被 `Teleport` 到 body，遮罩是它唯一的定位上下文。 */
.portal-search-detail-wrap {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: var(--sr-scrim);
  backdrop-filter: blur(5px);
}
</style>
