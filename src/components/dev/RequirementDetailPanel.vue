<script setup lang="ts">
import { computed } from 'vue'
import {
  requirementBudgetText,
  requirementDevelopmentCycleText,
  requirementRichTextHtml,
  requirementTimeText,
  type RequirementDetailFacts,
} from '@/shared/devRequirementDetail'

/**
 * 左栏：需求标题、四格读数（预算 / 开发周期 / 发起人 / 最近更新）、需求描述与验收标准。
 *
 * 描述与验收标准是富文本（后端存的是编辑器 HTML），渲染前一律过
 * `requirementRichTextHtml` 清洗；配套的 `:deep` 排版样式跟着 `.dev-requirement-detail__rich`
 * 这个容器一起留在这个组件里——拆出去就洗不到 `v-html` 出来的子节点了。
 */
const props = defineProps<{
  requirement: RequirementDetailFacts
}>()

const budgetText = computed(() => requirementBudgetText(props.requirement.budget))
const createdAtText = computed(() => requirementTimeText(props.requirement.created_time))
/** R014：开发周期（天）——担保需求合同有效期的依据；无担保 / 未填不渲染。 */
const developmentCycleText = computed(() => requirementDevelopmentCycleText(props.requirement))
const descriptionHtml = computed(() =>
  requirementRichTextHtml(props.requirement.description, '暂无需求描述'),
)
const acceptanceHtml = computed(() =>
  requirementRichTextHtml(props.requirement.acceptance_criteria, '暂无验收标准'),
)
</script>

<template>
  <div class="dev-card-head">
    <div class="dev-card-head__title-block">
      <span class="dev-filter-label">{{ requirement.requirement_id }}</span>
      <h2 class="dev-section-title">{{ requirement.title }}</h2>
    </div>
  </div>

  <div class="dev-requirement-detail__stats">
    <div class="dev-requirement-detail__stat">
      <span>预算</span>
      <strong>{{ budgetText }}</strong>
    </div>
    <!-- R014：开发周期（天）——担保需求合同有效期的依据；无担保 / 未填不渲染。 -->
    <div
      v-if="developmentCycleText"
      class="dev-requirement-detail__stat"
      data-testid="dev-requirement-development-cycle"
    >
      <span>开发周期</span>
      <strong>{{ developmentCycleText }}</strong>
    </div>
    <div class="dev-requirement-detail__stat">
      <span>发起人</span>
      <strong>{{ requirement.creator }}</strong>
    </div>
    <div class="dev-requirement-detail__stat">
      <span>发布时间</span>
      <strong>{{ createdAtText }}</strong>
    </div>
  </div>

  <section class="dev-requirement-detail__section">
    <span class="dev-requirement-hall__review-label">需求描述</span>
    <article class="dev-requirement-detail__rich" v-html="descriptionHtml"></article>
  </section>

  <section class="dev-requirement-detail__section">
    <span class="dev-requirement-hall__review-label">验收标准</span>
    <article class="dev-requirement-detail__rich" v-html="acceptanceHtml"></article>
  </section>
</template>

<style scoped>
.dev-requirement-detail__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

/* 内嵌读数块：半径与描边走统一层的内嵌档（--dev-radius-inner / --dev-line） */
.dev-requirement-detail__stat {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
  border: 1px solid var(--dev-line);
}

.dev-requirement-detail__stat span {
  color: var(--dev-muted);
  font-size: 11px;
  font-weight: 800;
}

.dev-requirement-detail__stat strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--dev-ink);
  font-size: 14px;
  line-height: 1.45;
}

.dev-requirement-detail__section {
  display: grid;
  gap: 8px;
}

.dev-requirement-detail__rich {
  padding: 14px 16px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface);
  color: var(--dev-ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.75;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.dev-requirement-detail__rich :deep(p),
.dev-requirement-detail__rich :deep(ul),
.dev-requirement-detail__rich :deep(ol),
.dev-requirement-detail__rich :deep(blockquote) {
  margin: 0 0 10px;
}

.dev-requirement-detail__rich :deep(ul),
.dev-requirement-detail__rich :deep(ol) {
  padding-left: 20px;
}

.dev-requirement-detail__rich :deep(a) {
  color: var(--dev-blue);
}

.dev-requirement-detail__rich :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 10px 0;
  border-radius: var(--dev-radius-inner);
}

@container (max-width: 520px) {
  .dev-requirement-detail__stats {
    grid-template-columns: 1fr;
  }
}

/* R047 断点收敛：原档位 720px → 640px（四格读数在手机档压成一列） */
@media (max-width: 640px) {
  .dev-requirement-detail__stats {
    grid-template-columns: 1fr;
  }
}
</style>
