<script setup lang="ts">
import { watch } from 'vue'
import type { PropType } from 'vue'
import { TIcon, ArrowDown } from 'ui_73info'

import RichTextEditor from '@/components/RichTextEditor.vue'
import { useAcceptanceTemplateMenu } from '@/composables/useAcceptanceTemplateMenu'
import { usePublishDraft } from '@/composables/usePublishDraft'
import { usePublishModalFields } from '@/composables/usePublishModalFields'

/**
 * 发布需求弹窗（首页 / 个人中心 / 需求大厅共用）。
 *
 * 表单字段本身仍由父级持有（`v-model:publish*`），本组件只做三件事：把输入转成 emit、
 * 挂「验收标准模板」二级入口、按用户 / 场景隔离草稿。三块逻辑各自在 composable 里：
 * - `usePublishModalFields`：五个输入框的转发、发布方式门禁与电签担保可用性的两次询问；
 * - `usePublishDraft`：localStorage 草稿的存 / 取 / 清（`defineExpose({ clearDraft })` 仍对外）；
 * - `useAcceptanceTemplateMenu`：模板菜单与覆盖确认（含 document 级指针 / 键盘监听）。
 */

type NotifyType = 'success' | 'warning' | 'error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  modalTitle: { type: String, default: '发布需求' },
  submitText: { type: String, default: '确认发布' },
  loadingText: { type: String, default: '发布中...' },
  publishTitle: { type: [String, Number] as PropType<string | number>, default: '' },
  publishDescription: { type: String, default: '' },
  publishBudget: { type: [String, Number] as PropType<string | number>, default: '' },
  publishAcceptance: { type: String, default: '' },
  publishPaymentMode: {
    type: String as PropType<'platform_guarantee' | 'self_managed'>,
    default: 'self_managed',
  },
  /**
   * 开发周期（天，R014）：担保需求（`platform_guarantee`）必填。
   * 传字符串或数字都行（表单里是 `<input type="number">`）；下限以后端配置为准，
   * 这里只保证「正整数」，配置更高的下限由后端返回中文提示。
   */
  publishDevelopmentCycleDays: {
    type: [String, Number] as PropType<string | number>,
    default: '',
  },
  allowPlatformGuarantee: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  publishLoading: { type: Boolean, default: false },
  // 草稿作用域（一般传当前用户名），用于按用户隔离草稿，避免多账号共用浏览器时串数据
  draftScope: { type: String, default: 'default' },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit'): void
  (e: 'notify', message: string, type?: NotifyType): void
  (e: 'update:publishTitle', value: string): void
  (e: 'update:publishDescription', value: string): void
  (e: 'update:publishBudget', value: string | number): void
  (e: 'update:publishAcceptance', value: string): void
  (e: 'update:publishPaymentMode', value: 'platform_guarantee' | 'self_managed'): void
  (e: 'update:publishDevelopmentCycleDays', value: string | number): void
}>()

function forwardNotify(message: string, type?: NotifyType) {
  emit('notify', message, type)
}

const {
  isGuaranteeMode,
  developmentCycleHint,
  platformGuaranteeAllowed,
  updateTitle,
  updateDescription,
  updateBudget,
  updateAcceptance,
  updateDevelopmentCycleDays,
  updatePaymentMode,
} = usePublishModalFields(props, { emit })

const { draftEnabled, clearPublishDraft } = usePublishDraft(props, emit)

const {
  acceptanceTemplates,
  menuOpen: acceptanceTemplateMenuOpen,
  pendingTemplate: pendingAcceptanceTemplate,
  rootRef: acceptanceTemplateRootRef,
  triggerRef: acceptanceTemplateTriggerRef,
  confirmRef: acceptanceTemplateConfirmRef,
  editorRef: acceptanceEditorRef,
  toggleMenu: toggleAcceptanceTemplateMenu,
  resetMenu: resetAcceptanceTemplateMenu,
  requestTemplate: requestAcceptanceTemplate,
  cancelTemplate: cancelAcceptanceTemplate,
  confirmTemplate: confirmAcceptanceTemplate,
} = useAcceptanceTemplateMenu({
  acceptance: () => String(props.publishAcceptance ?? ''),
  applyAcceptance: updateAcceptance,
})

// 弹窗关闭时收起模板菜单与覆盖确认，避免下次打开残留
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      resetAcceptanceTemplateMenu()
    }
  },
)

// 遮罩点击：直接关闭。填写内容已通过草稿自动保存，无需确认，避免打断操作习惯
function handleBackdropClick() {
  if (props.publishLoading) {
    return
  }

  emit('close')
}

defineExpose({
  clearDraft: clearPublishDraft,
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="auth-modal-wrap publish-modal-wrap"
      @click.self="handleBackdropClick"
    >
      <section class="auth-modal publish-modal" :aria-label="`${modalTitle}弹窗`">
        <header class="publish-modal__head">
          <h3>{{ modalTitle }}</h3>
        </header>

        <div class="publish-modal__body">
          <label>
            需求标题 *
            <input
              :value="publishTitle"
              type="text"
              maxlength="60"
              placeholder="例如：企业官网改版、小程序开发"
              required
              @input="updateTitle"
            />
          </label>
          <div class="publish-rich-field">
            <span>需求描述 *</span>
            <RichTextEditor
              :model-value="publishDescription"
              :floating-toolbar="false"
              auto-height
              toolbar-on-focus
              @update:model-value="updateDescription"
              @notify="forwardNotify"
            />
          </div>
          <label>
            预算 *
            <input
              :value="publishBudget"
              type="number"
              min="0"
              step="0.01"
              placeholder="如 2000"
              required
              @input="updateBudget"
            />
          </label>
          <div class="publish-rich-field">
            <div class="publish-rich-field__head">
              <span>验收标准 *</span>
              <div ref="acceptanceTemplateRootRef" class="publish-template">
                <button
                  ref="acceptanceTemplateTriggerRef"
                  type="button"
                  class="publish-template__trigger"
                  :class="{ 'is-open': acceptanceTemplateMenuOpen }"
                  title="使用验收标准模板"
                  aria-haspopup="menu"
                  :aria-expanded="acceptanceTemplateMenuOpen ? 'true' : 'false'"
                  @click="toggleAcceptanceTemplateMenu"
                >
                  <span>模板</span>
                  <TIcon class="publish-template__caret">
                    <ArrowDown />
                  </TIcon>
                </button>
                <div
                  v-if="acceptanceTemplateMenuOpen"
                  class="publish-template__menu"
                  role="menu"
                  aria-label="验收标准模板"
                >
                  <button
                    v-for="template in acceptanceTemplates"
                    :key="template.id"
                    type="button"
                    class="publish-template__option"
                    role="menuitem"
                    @click="requestAcceptanceTemplate(template)"
                  >
                    <strong>{{ template.name }}</strong>
                    <small>{{ template.description }}</small>
                  </button>
                </div>
              </div>
            </div>
            <RichTextEditor
              ref="acceptanceEditorRef"
              :model-value="publishAcceptance"
              :floating-toolbar="false"
              auto-height
              toolbar-on-focus
              @update:model-value="updateAcceptance"
              @notify="forwardNotify"
            />
          </div>
          <div class="publish-mode-field">
            <span>发布方式 *</span>
            <div
              class="publish-mode-options"
              :class="{ 'publish-mode-options--single': !platformGuaranteeAllowed }"
              role="radiogroup"
              aria-label="发布方式选择"
            >
              <button
                type="button"
                class="publish-mode-option"
                role="radio"
                :aria-checked="publishPaymentMode === 'self_managed'"
                :class="{ active: publishPaymentMode === 'self_managed' }"
                @click="updatePaymentMode('self_managed')"
              >
                <strong>无电签约定</strong>
              </button>
              <button
                v-if="platformGuaranteeAllowed"
                type="button"
                class="publish-mode-option"
                role="radio"
                :aria-checked="publishPaymentMode === 'platform_guarantee'"
                :class="{ active: publishPaymentMode === 'platform_guarantee' }"
                @click="updatePaymentMode('platform_guarantee')"
              >
                <strong>电签担保</strong>
              </button>
            </div>
          </div>
          <!-- R014：开发周期（天）＝合同自双方签署完成到截止的有效期，担保需求必填。
               无担保需求不显示；下限以后端配置为准，前端只保证正整数。 -->
          <label v-if="isGuaranteeMode" class="publish-cycle-field">
            开发周期（天） *
            <input
              :value="publishDevelopmentCycleDays"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              placeholder="如 30"
              required
              @input="updateDevelopmentCycleDays"
            />
          </label>
          <p v-if="isGuaranteeMode" class="publish-cycle-hint">{{ developmentCycleHint }}</p>
        </div>

        <div class="auth-modal-actions publish-modal__actions">
          <button class="auth-btn ghost" type="button" @click="emit('close')">取消</button>
          <button
            class="auth-btn solid"
            type="button"
            :disabled="publishLoading"
            @click="emit('submit')"
          >
            {{ publishLoading ? loadingText : submitText }}
          </button>
        </div>

        <footer v-if="draftEnabled" class="publish-modal__draft-hint">
          <span>内容将自动保存为草稿</span>
        </footer>
      </section>
    </div>

    <!-- 覆盖确认：沿用站内弹窗/按钮风格，不用组件库默认样式 -->
    <div
      v-if="pendingAcceptanceTemplate"
      class="auth-modal-wrap publish-confirm-wrap"
      @click.self="cancelAcceptanceTemplate"
    >
      <section
        class="auth-modal publish-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-template-confirm-title"
      >
        <h3 id="publish-template-confirm-title">使用模板</h3>
        <p class="publish-confirm__meta">
          {{ pendingAcceptanceTemplate?.name }} · {{ pendingAcceptanceTemplate?.description }}
        </p>
        <p class="publish-confirm__text">验收标准中已有内容，继续将用模板覆盖现有内容。</p>
        <div class="auth-modal-actions publish-confirm__actions">
          <button class="auth-btn ghost" type="button" @click="cancelAcceptanceTemplate">
            取消
          </button>
          <button
            ref="acceptanceTemplateConfirmRef"
            class="auth-btn solid"
            type="button"
            @click="confirmAcceptanceTemplate"
          >
            覆盖并填入
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./publish-modal-form.css"></style>

<style scoped src="./publish-modal-confirm.css"></style>
