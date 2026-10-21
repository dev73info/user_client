<script setup lang="ts">
import RequirementProgressGuide from '@/components/RequirementProgressGuide.vue'
import type { RequirementProgressRow } from '@/composables/useRequirementOverview'

/**
 * 总览里的「需求进度」面板：最近 5 条需求的标题 / 状态 / 金额 / 时间，外加一条流程进度条；展示串
 * 由 `useRequirementOverview` 算好传进来，点一行只回传该行，不发路由、不弹提示。
 *
 * ⚠️ 整段 `:deep(.req-progress*)`（桌面一条 + `@640` 一条）必须留在**这里**：`:deep()` 只在
 * 「持有子组件的那一层」编译成后代选择器，搬回视图或全局都匹配不上，进度条会静默失去长相。
 */
defineProps<{ rows: RequirementProgressRow[] }>()

const emit = defineEmits<{ select: [row: RequirementProgressRow] }>()
</script>

<template>
  <section class="overview-focus-panel">
    <div class="overview-section-head">
      <h2>需求进度</h2>
      <RouterLink class="overview-link" :to="{ name: 'workbench-requirements' }"
        >查看需求单</RouterLink
      >
    </div>
    <div v-if="rows.length === 0" class="overview-empty-state">
      <strong>暂无需求单</strong>
    </div>
    <ul v-else class="overview-requirement-list">
      <li
        v-for="row in rows"
        :key="row.requirementId"
        class="clickable"
        role="button"
        tabindex="0"
        :aria-label="`查看需求：${row.title}`"
        @click="emit('select', row)"
        @keydown.enter.prevent="emit('select', row)"
        @keydown.space.prevent="emit('select', row)"
      >
        <div class="overview-requirement-meta">
          <strong>{{ row.title }}</strong>
          <span>{{ row.meta }}</span>
        </div>
        <span class="overview-status" :class="`overview-status--${row.status}`">{{
          row.statusText
        }}</span>
        <small>{{ row.budgetText }}</small>
        <time>{{ row.timeText }}</time>
        <div class="overview-requirement-progress" @click.stop>
          <RequirementProgressGuide
            :requirement="row.requirement"
            :payment-mode="row.requirement.payment_mode"
            :contract-status="row.contractStatus"
          />
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.overview-requirement-list span,
.overview-requirement-list time {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.overview-requirement-list strong {
  color: #0f172a;
  font-weight: 800;
}

.overview-requirement-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.overview-requirement-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 12px;
  align-items: center;
  min-height: 64px;
  padding: 16px 18px;
  border: 1px solid rgba(191, 219, 254, 0.78);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
}

.overview-requirement-list .overview-requirement-progress {
  grid-column: 1 / -1;
  margin-top: 6px;
}

.overview-requirement-progress :deep(.req-progress) {
  padding: 16px 18px 14px;
  border-color: rgba(191, 219, 254, 0.76);
  border-radius: 12px;
  background: rgba(248, 251, 255, 0.78);
}

.overview-requirement-list li.clickable {
  cursor: pointer;
  transition: all 0.2s ease;
}

.overview-requirement-list li.clickable:hover {
  border-color: rgba(125, 155, 225, 0.92);
  background: rgba(248, 251, 255, 0.98);
  box-shadow: 0 12px 24px rgba(76, 103, 172, 0.1);
}

.overview-requirement-list div {
  min-width: 0;
}

.overview-requirement-list strong,
.overview-requirement-list span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.overview-status--completed {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}
.overview-status--rejected {
  background: rgba(239, 68, 68, 0.12);
  color: #b42318;
}
.overview-status--deposit_paid,
.overview-status--in_development {
  background: rgba(79, 140, 255, 0.12);
  color: #1d4ed8;
}

/* R047 断点收敛：原档位 760px → 640px */
@media (max-width: 640px) {
  .overview-section-head {
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 12px;
  }

  .overview-focus-panel .overview-section-head h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 0;
    font-size: 15px;
    font-weight: 800;
  }

  .overview-focus-panel .overview-section-head h2::before {
    content: '';
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: #2563eb;
  }

  .overview-focus-panel .overview-link {
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
  }

  .overview-focus-panel .overview-link::after {
    content: '›';
    margin-left: 4px;
  }

  /* 需求卡：标题与编号一块，状态 / 时间 / 金额压成一行，进度条横排；不再套描边卡片，只留分隔线 */
  .overview-requirement-list li {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'meta meta meta'
      'status time budget'
      'progress progress progress';
    gap: 10px 8px;
    align-items: center;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .overview-requirement-list li + li {
    padding-top: 14px;
    border-top: 1px solid rgba(224, 232, 255, 0.96);
  }

  .overview-requirement-list li.clickable:hover {
    border-color: rgba(224, 232, 255, 0.96);
    background: transparent;
    box-shadow: none;
  }

  .overview-requirement-list .overview-requirement-meta {
    grid-area: meta;
    display: grid;
    gap: 4px;
  }

  .overview-requirement-list .overview-requirement-meta strong {
    display: -webkit-box;
    font-size: 15px;
    line-height: 1.4;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .overview-requirement-list .overview-status {
    grid-area: status;
    min-height: 24px;
    padding: 3px 10px;
  }

  .overview-requirement-list time {
    grid-area: time;
    color: #94a3b8;
  }

  .overview-requirement-list small {
    grid-area: budget;
    color: #0f172a;
    font-size: 16px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .overview-requirement-list .overview-requirement-progress {
    grid-area: progress;
    margin-top: 0;
  }

  .overview-requirement-progress :deep(.req-progress) {
    padding: 12px 6px 10px;
    border: 0;
    border-radius: 12px;
    background: #f6f9ff;
  }

  /* 组件在 640px 以下会改成竖排五行，总览里保持横排：只留圆点和步骤名，说明文字收起 */
  .overview-requirement-progress :deep(.req-progress__steps) {
    flex-direction: row;
    align-items: flex-start;
    gap: 0;
  }

  .overview-requirement-progress :deep(.req-progress__step) {
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }

  .overview-requirement-progress :deep(.req-progress__dot) {
    width: 22px;
    height: 22px;
    font-size: 11px;
  }

  .overview-requirement-progress :deep(.req-progress__step-title) {
    font-size: 11px;
    white-space: nowrap;
  }

  .overview-requirement-progress :deep(.req-progress__step-desc) {
    display: none;
  }

  .overview-requirement-progress :deep(.req-progress__connector) {
    display: block;
    top: 11px;
    left: calc(50% + 14px);
    right: calc(-50% + 14px);
  }
}
</style>
