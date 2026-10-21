<script setup lang="ts">
import { computed } from 'vue'
import { Close, TIcon } from 'ui_73info'

import type { DrawerRequirement } from '@/composables/useRequirementDetailDrawer'
import {
  formatCnDateTime,
  formatCny,
  requirementDetailAcceptanceHtml,
  requirementDetailDescriptionHtml,
  requirementPaymentModeLabel,
} from '@/shared/requirementDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'

/**
 * 需求详情抽屉（只读）。
 *
 * 从 `RequirementConversationModal.vue` 抽出：会话里点「详情」时从右侧划出、盖在会话之上，
 * 不跳页也不打断会话上下文。这里只吃父组件拿到的这一条需求，**没有任何回写**；
 * 开/关与取数在 `useRequirementDetailDrawer` 里。
 *
 * 整棵 Teleport 到 body：内嵌形态（消息中心）下消息页自己在一个层叠上下文里，
 * 留在原地的话抽屉的 z-index 再高也压不过站点的吸顶导航（40）与底部坞（60），
 * 移动端会出现「抽屉顶栏和底栏被盖住」。与验收弹窗同一处理（见 AcceptanceDialog）。
 */
const props = defineProps<{
  open: boolean
  loading: boolean
  requirement: DrawerRequirement | null
}>()

const emit = defineEmits<{
  close: []
}>()

/** 抽屉里的八项元信息：标签 + 已格式化好的值，模板只负责摆位置。 */
const fields = computed(() => {
  const item = props.requirement
  if (!item) {
    return []
  }

  return [
    { label: '编号', value: item.requirement_id },
    { label: '发布方式', value: requirementPaymentModeLabel(item.payment_mode) },
    { label: '状态', value: requirementStatusLabel(item.status, item.payment_mode) },
    { label: '预算', value: formatCny(item.budget) },
    { label: '创建', value: item.created_time ? formatCnDateTime(item.created_time) : '时间未知' },
    { label: '更新', value: formatCnDateTime(item.updated_at) },
    { label: '需求方', value: item.creator ?? '—' },
    { label: '开发者', value: item.developer ?? '待接单' },
  ]
})

/* 需求描述与验收标准是富文本，按站内既有口径走 sanitize + v-html（后端还有一道 ammonia），
   不要退化成纯文本——那样段落与列表会被拍平成一行。兜底文案与需求大厅详情同一份
   （见 shared/requirementDisplay 的 requirementDetail*Html），内容形状保持不变。 */
const descriptionHtml = computed(() =>
  requirementDetailDescriptionHtml(props.requirement?.description),
)

const acceptanceHtml = computed(() =>
  requirementDetailAcceptanceHtml(props.requirement?.acceptance_criteria),
)
</script>

<template>
  <Teleport to="body">
    <Transition name="conversation-drawer">
      <div v-if="open" class="conversation-drawer-layer">
        <div class="conversation-drawer__backdrop" @click="emit('close')"></div>
        <aside class="conversation-drawer" aria-label="需求详情">
          <header class="conversation-drawer__head">
            <h4>需求详情</h4>
            <button
              class="conversation-drawer__close"
              type="button"
              aria-label="收起需求详情"
              title="收起需求详情"
              @click="emit('close')"
            >
              <TIcon>
                <Close />
              </TIcon>
            </button>
          </header>

          <div class="conversation-drawer__body">
            <p v-if="loading" class="conversation-drawer__hint" role="status">需求详情加载中…</p>
            <p v-else-if="!requirement" class="conversation-drawer__hint">
              未能加载这条需求的详情。
            </p>
            <template v-else>
              <h5 class="conversation-drawer__title">{{ requirement.title }}</h5>

              <dl class="conversation-drawer__meta">
                <div v-for="field in fields" :key="field.label">
                  <dt>{{ field.label }}</dt>
                  <dd :title="field.value">{{ field.value }}</dd>
                </div>
              </dl>

              <section class="conversation-drawer__block">
                <h6>需求描述</h6>
                <article class="conversation-drawer__rich" v-html="descriptionHtml"></article>
              </section>

              <section class="conversation-drawer__block">
                <h6>验收标准</h6>
                <article class="conversation-drawer__rich" v-html="acceptanceHtml"></article>
              </section>
            </template>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped src="./requirement-detail-drawer.css"></style>
