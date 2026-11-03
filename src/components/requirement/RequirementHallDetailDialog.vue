<script setup lang="ts">
/**
 * 需求大厅的需求详情弹窗（右侧浮层，`Teleport` 到 `body`）。
 *
 * 从 `views/RequirementHallView.vue` 抽出来：头部的发布方式胶囊与状态、编号 / 发布方式 / 状态 /
 * 更新 / 创建五行元信息、标题 / 描述 / 预算 / 验收标准四段（后两段是富文本，
 * 排版见 `RequirementHallRichText`）、底部「前往工作台接取需求」。模板、文案与样式逐段照搬。
 *
 * 组件只做展示与事件上报：是否显示由 `requirement` 决定，开 / 关与补详情在
 * `useRequirementHallDetail` 里。
 */
import { Close, Connection, TIcon } from 'ui_73info'

import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import RequirementHallRichText from '@/components/requirement/RequirementHallRichText.vue'
import {
  formatCnDateTime as formatTimeLabel,
  formatCny as formatMoney,
  requirementPaymentModeLabel,
} from '@/shared/requirementDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'

const props = defineProps<{
  /** 当前选中的需求；`null` 时整个浮层不渲染 */
  requirement: PublicRequirementSpotlightItem | null
  /** 需求描述的 HTML（已洗过，含空内容回退文案） */
  descriptionHtml: string
  /** 验收标准的 HTML（补详情期间是「加载中」文案） */
  acceptanceHtml: string
  /** 底部「前往工作台接取需求」：登录了、且不是自己发的需求才给 */
  canClaim: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-workbench', requirement: PublicRequirementSpotlightItem): void
}>()

function openWorkbench(): void {
  if (props.requirement) {
    emit('open-workbench', props.requirement)
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="requirement" class="requirement-hall-detail-wrap" @click.self="emit('close')">
      <section class="requirement-hall-detail" :aria-label="`${requirement.title}详情`">
        <header class="requirement-hall-detail__head">
          <div>
            <PaymentModeChip :mode="requirement.payment_mode" />
            <h3>{{ requirement.title }}</h3>
            <p>
              {{ requirement.requirement_id }} ·
              {{ requirementStatusLabel(requirement.status, requirement.payment_mode) }}
            </p>
          </div>
          <button
            class="requirement-hall-detail__close"
            type="button"
            aria-label="关闭详情"
            @click="emit('close')"
          >
            <TIcon>
              <Close />
            </TIcon>
          </button>
        </header>

        <div class="requirement-hall-detail__meta">
          <span>编号：{{ requirement.requirement_id }}</span>
          <span>发布方式：{{ requirementPaymentModeLabel(requirement.payment_mode) }}</span>
          <span
            >状态：{{ requirementStatusLabel(requirement.status, requirement.payment_mode) }}</span
          >
          <span>更新：{{ formatTimeLabel(requirement.updated_at) }}</span>
          <span>创建：{{ formatTimeLabel(requirement.created_at) }}</span>
        </div>

        <section class="requirement-hall-detail__review-panel">
          <div class="requirement-hall-detail__review-item">
            <span class="requirement-hall-detail__review-label">需求标题</span>
            <div class="requirement-hall-detail__review-value">{{ requirement.title }}</div>
          </div>

          <div class="requirement-hall-detail__review-item">
            <span class="requirement-hall-detail__review-label">需求描述</span>
            <RequirementHallRichText :html="descriptionHtml" />
          </div>

          <div class="requirement-hall-detail__review-grid">
            <div class="requirement-hall-detail__review-item">
              <span class="requirement-hall-detail__review-label">预算</span>
              <div class="requirement-hall-detail__review-value">
                {{ formatMoney(requirement.budget) }}
              </div>
            </div>

            <div class="requirement-hall-detail__review-item">
              <span class="requirement-hall-detail__review-label">验收标准</span>
              <RequirementHallRichText :html="acceptanceHtml" />
            </div>
          </div>
        </section>

        <div v-if="canClaim" class="requirement-hall-detail__actions">
          <button class="requirement-hall-detail__bind" type="button" @click="openWorkbench">
            <TIcon>
              <Connection />
            </TIcon>
            <span>前往工作台接取需求</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.requirement-hall-detail-wrap {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: color-mix(in srgb, var(--73-ink) 28%, transparent);
  backdrop-filter: blur(5px);
}

.requirement-hall-detail {
  width: min(860px, 100%);
  max-height: min(760px, calc(100dvh - 32px));
  overflow-y: auto;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-card);
  background: var(--73-surface);
  box-shadow: var(--73-shadow-dialog);
}

.requirement-hall-detail__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 16px;
  border-bottom: 1px solid var(--73-border-soft);
  background: var(--73-surface);
}

.requirement-hall-detail__head h3 {
  margin: 10px 0 6px;
  color: var(--73-ink);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.requirement-hall-detail__head p {
  margin: 0;
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 12px;
  font-weight: 400;
}

.requirement-hall-detail__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-control);
  background: var(--73-surface);
  color: var(--73-ink-soft);
  cursor: pointer;
}

.requirement-hall-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--73-border-soft);
  color: var(--73-ink-muted);
  font-family: var(--73-font-family-mono);
  font-size: 12px;
  font-weight: 400;
}

.requirement-hall-detail__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 24px 24px;
  background: var(--73-surface);
}

.requirement-hall-detail__bind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--73-control-height);
  padding: 0 16px;
  border: 1px solid var(--73-accent);
  border-radius: var(--73-radius-control);
  background: var(--73-accent);
  color: var(--73-accent-contrast);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  box-shadow: none;
  transition: background-color var(--73-transition);
}

.requirement-hall-detail__bind:hover {
  background: color-mix(in srgb, var(--73-accent) 85%, var(--73-ink));
}

.requirement-hall-detail__bind:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--73-accent) 16%, transparent);
}

.requirement-hall-detail__review-panel {
  display: grid;
  gap: 12px;
  margin: 16px 24px;
  padding: 16px;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-inner);
  background: var(--73-bg);
}

.requirement-hall-detail__review-grid {
  display: grid;
  grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

.requirement-hall-detail__review-item {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.requirement-hall-detail__review-grid .requirement-hall-detail__review-item {
  grid-template-rows: auto 1fr;
}

.requirement-hall-detail__review-label {
  color: var(--73-ink-muted);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1.35;
}

.requirement-hall-detail__review-value {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--73-border);
  border-radius: var(--73-radius-control);
  background: var(--73-surface);
  color: var(--73-ink);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.6;
}

.requirement-hall-detail__review-grid .requirement-hall-detail__review-value {
  height: 100%;
}

.requirement-hall-detail__review-grid div.requirement-hall-detail__review-value {
  display: flex;
  align-items: center;
  color: var(--73-ink);
  font-family: var(--73-font-family-mono);
  font-size: 18px;
  font-weight: 600;
}

.requirement-hall-detail__review-value--multiline {
  white-space: pre-wrap;
}

.requirement-hall-detail__section {
  padding: 20px 22px 4px;
}

.requirement-hall-detail__section:last-child {
  padding-bottom: 22px;
}

.requirement-hall-detail__section h4 {
  margin: 0 0 12px;
  color: var(--73-ink);
  font-size: 16px;
  line-height: 1.35;
}

@media (max-width: 640px) {
  .requirement-hall-detail__actions {
    padding: 0 16px 18px;
  }

  .requirement-hall-detail__bind {
    width: 100%;
  }

  .requirement-hall-detail__review-panel {
    margin: 14px 16px;
    padding: 14px;
    border-radius: var(--73-radius-inner);
  }

  .requirement-hall-detail__review-grid {
    grid-template-columns: 1fr;
  }
}
</style>
