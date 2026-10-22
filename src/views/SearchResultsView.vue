<script setup lang="ts">
import SearchCommunityCard from '@/components/search/SearchCommunityCard.vue'
import SearchRequirementCard from '@/components/search/SearchRequirementCard.vue'
import SearchRequirementDetailModal from '@/components/search/SearchRequirementDetailModal.vue'
import SearchResourceCard from '@/components/search/SearchResourceCard.vue'
import { useSearchRequirementPreview } from '@/composables/useSearchRequirementPreview'
import { useSearchResultNavigation } from '@/composables/useSearchResultNavigation'
import { useSearchResults } from '@/composables/useSearchResults'

/**
 * 搜索结果页的壳（R047 拆分：1017 → 本文件）。
 *
 * 页面只有一件自有的事：把「路由 query → 取数 → 三类结果」摆成三段卡片流，
 * 其余四块各归其位：
 * - 取数、关键词 / 范围的推导与前端过滤 → `composables/useSearchResults`
 * - 三处落点（资源页内详情态 / 需求工作台详情 / 帖子详情）→ `useSearchResultNavigation`
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
  filteredCommunityPosts,
  resultCount,
  resultSummary,
  loadSearchData,
} = useSearchResults()
const { openResource, openRequirementWorkbench, openCommunityPost, openHome } =
  useSearchResultNavigation({ keyword, tagTree })
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

      <section
        v-if="filteredCommunityPosts.length"
        class="portal-page__panel portal-search-page__section"
      >
        <div class="portal-page__section-header">
          <div>
            <h2>社区帖子</h2>
          </div>
          <span class="portal-page__loading-chip">{{ filteredCommunityPosts.length }} 条</span>
        </div>

        <div class="portal-page__card-grid portal-search-page__grid">
          <SearchCommunityCard
            v-for="post in filteredCommunityPosts"
            :key="post.id"
            :post="post"
            @open="openCommunityPost(post)"
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
  --sr-ink: #0f172a;
  --sr-ink-soft: #334155;
  --sr-ink-muted: #475569;
  --sr-text-muted: #64748b;
  --sr-brand: #2563eb;
  --sr-brand-strong: #1d4ed8;
  --sr-on-brand: #fff;
  --sr-surface: #fff;
  --sr-brand-line: rgba(37, 99, 235, 0.34);
  --sr-brand-line-strong: rgba(29, 78, 216, 0.42);
  --sr-detail-line: rgba(203, 213, 225, 0.82);
  --sr-close-line: rgba(203, 213, 225, 0.86);
  --sr-divider: rgba(226, 232, 240, 0.84);
  --sr-divider-soft: rgba(226, 232, 240, 0.76);
  /* 卡片：封面渐变、标签胶囊、悬停与「查看需求」入口 */
  --sr-cover-from: #dbeafe;
  --sr-cover-to: #eff6ff;
  --sr-chip-bg: rgba(248, 250, 252, 0.96);
  --sr-chip-line: rgba(226, 232, 240, 0.92);
  --sr-card-hover-line: rgba(96, 165, 250, 0.84);
  --sr-card-hover-shadow: rgba(37, 99, 235, 0.12);
  --sr-action-bg: rgba(219, 234, 254, 0.86);
  --sr-action-line: rgba(147, 197, 253, 0.72);
  --sr-action-hover-shadow: rgba(37, 99, 235, 0.18);
  /* 弹窗：底、抬头、评审面板与接取按钮 */
  --sr-head-bg: rgba(255, 255, 255, 0.96);
  --sr-panel-line: rgba(17, 24, 39, 0.08);
  --sr-panel-from: rgba(248, 250, 252, 0.96);
  --sr-panel-to: rgba(241, 245, 249, 0.92);
  --sr-value-bg: rgba(255, 255, 255, 0.9);
  --sr-value-line: rgba(148, 163, 184, 0.12);
  --sr-actions-bg: rgba(248, 250, 252, 0.62);
  --sr-detail-shadow: rgba(15, 23, 42, 0.22);
  --sr-bind-shadow: rgba(37, 99, 235, 0.16);
  --sr-bind-hover-shadow: rgba(37, 99, 235, 0.22);
  --sr-scrim: rgba(15, 23, 42, 0.28);
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
