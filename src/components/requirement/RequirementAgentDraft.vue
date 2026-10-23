<script setup lang="ts">
import type { RequirementDraft } from '@/api/requirementAgent'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

/**
 * 「跟 AI 聊着填需求」右侧的需求草稿栏（R047 从 `components/RequirementAgentPanel.vue` 拆出）。
 *
 * 纯展示 + 一个动作：五个字段逐项显示（缺哪项标出来）、富文本过一次 DOMPurify 才渲染
 * （后端已净化，前端再过一道）、底部「填入表单」只在草稿齐了且未发布时可用。
 * 采纳之后的动作（调接口 + 回填表单）在 `useRequirementAgentChat`，本组件只回抛 `fill`。
 */
defineProps<{
  draft: RequirementDraft | null
  /** 草稿所属需求已发布：此时改由「已发布」提示，不再提示缺项。 */
  published: boolean
  /** 还缺哪几项（已转成中文标签，空标签已被过滤掉）。 */
  missingLabels: string[]
  /** 客服接手时显示维护人，未接手为 null（= AI 维护）。 */
  agentUsername: string | null
  canFillForm: boolean
  adopting: boolean
}>()

const emit = defineEmits<{ (e: 'fill'): void }>()
</script>

<template>
  <aside class="agent-panel__draft" aria-label="需求草稿">
    <div class="agent-draft__head">
      <h4>需求草稿</h4>
      <span v-if="draft" class="agent-draft__badge" :class="`is-${draft.status}`">
        {{
          draft.status === 'ready'
            ? '已可填入表单'
            : draft.status === 'adopted'
              ? '已填入表单'
              : '整理中'
        }}
      </span>
    </div>

    <p v-if="!draft" class="agent-panel__hint">对话开始后，这里会实时显示 AI 整理出的需求草稿。</p>

    <template v-else>
      <p v-if="published" class="agent-panel__hint">
        该需求已发布{{
          draft.published_requirement_id ? `（需求号 ${draft.published_requirement_id}）` : ''
        }}。
      </p>
      <p v-else-if="missingLabels.length > 0" class="agent-panel__hint">
        还需要确认：{{ missingLabels.join('、') }}
      </p>
      <p v-else class="agent-panel__hint is-ready">五个字段都齐了，可以填入表单。</p>

      <dl class="agent-draft">
        <div
          class="agent-draft__row"
          :class="{ 'is-missing': draft.missing_fields.includes('title') }"
        >
          <dt>需求标题</dt>
          <dd>{{ draft.title.trim() || '待补' }}</dd>
        </div>
        <div
          class="agent-draft__row"
          :class="{ 'is-missing': draft.missing_fields.includes('budget') }"
        >
          <dt>预算</dt>
          <dd>{{ draft.budget === null ? '待补' : `¥${draft.budget}` }}</dd>
        </div>
        <div
          class="agent-draft__row"
          :class="{ 'is-missing': draft.missing_fields.includes('payment_mode') }"
        >
          <dt>发布方式</dt>
          <dd>{{ draft.payment_mode === 'platform_guarantee' ? '电签担保' : '无电签约定' }}</dd>
        </div>
        <div
          class="agent-draft__row agent-draft__row--rich"
          :class="{ 'is-missing': draft.missing_fields.includes('description') }"
        >
          <dt>需求描述</dt>
          <!-- 后端已净化，前端再过一次 DOMPurify 才渲染 -->
          <dd
            v-if="draft.description_html.trim()"
            class="agent-draft__rich"
            v-html="sanitizeRichHtml(draft.description_html)"
          ></dd>
          <dd v-else class="agent-draft__rich is-empty">待补</dd>
        </div>
        <div
          class="agent-draft__row agent-draft__row--rich"
          :class="{ 'is-missing': draft.missing_fields.includes('acceptance') }"
        >
          <dt>验收标准</dt>
          <dd
            v-if="draft.acceptance_html.trim()"
            class="agent-draft__rich"
            v-html="sanitizeRichHtml(draft.acceptance_html)"
          ></dd>
          <dd v-else class="agent-draft__rich is-empty">待补</dd>
        </div>
      </dl>

      <p v-if="agentUsername" class="agent-draft__editor">当前由客服 {{ agentUsername }} 维护</p>
      <p v-else class="agent-draft__editor">由 AI 助手维护</p>
    </template>

    <div class="agent-draft__actions">
      <button
        class="auth-btn solid agent-draft__fill"
        type="button"
        :disabled="!canFillForm || adopting"
        @click="emit('fill')"
      >
        {{ adopting ? '填入中…' : '填入表单' }}
      </button>
    </div>
  </aside>
</template>
