<script setup lang="ts">
import { watch } from 'vue'
import type { PropType } from 'vue'

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
  allowPlatformGuarantee: { type: Boolean, default: true },
  publishLoading: { type: Boolean, default: false },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit'): void
  (e: 'update:publishTitle', value: string): void
  (e: 'update:publishDescription', value: string): void
  (e: 'update:publishBudget', value: string | number): void
  (e: 'update:publishAcceptance', value: string): void
  (e: 'update:publishPaymentMode', value: 'platform_guarantee' | 'self_managed'): void
}>()

function updateTitle(event: Event) {
  emit('update:publishTitle', (event.target as HTMLInputElement).value)
}

function updateDescription(event: Event) {
  emit('update:publishDescription', (event.target as HTMLTextAreaElement).value)
}

function updateBudget(event: Event) {
  emit('update:publishBudget', (event.target as HTMLInputElement).value)
}

function updateAcceptance(event: Event) {
  emit('update:publishAcceptance', (event.target as HTMLTextAreaElement).value)
}

function updatePaymentMode(value: 'platform_guarantee' | 'self_managed') {
  if (value === 'platform_guarantee' && !props.allowPlatformGuarantee) {
    return
  }

  emit('update:publishPaymentMode', value)
}

watch(
  () => [props.allowPlatformGuarantee, props.publishPaymentMode] as const,
  ([allowPlatformGuarantee, publishPaymentMode]) => {
    if (!allowPlatformGuarantee && publishPaymentMode === 'platform_guarantee') {
      emit('update:publishPaymentMode', 'self_managed')
    }
  },
  { immediate: true },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="auth-modal-wrap publish-modal-wrap" @click.self="emit('close')">
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
          <label>
            需求描述 *
            <textarea
              :value="publishDescription"
              rows="5"
              maxlength="300"
              placeholder="请描述你的目标、功能和期望交付时间，便于快速匹配。"
              required
              @input="updateDescription"
            ></textarea>
          </label>
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
          <label>
            验收标准 *
            <textarea
              :value="publishAcceptance"
              rows="3"
              maxlength="240"
              placeholder="请填写交付标准、验收节点等内容。"
              required
              @input="updateAcceptance"
            ></textarea>
          </label>
          <div class="publish-mode-field">
            <span>发布方式 *</span>
            <div class="publish-mode-options" role="radiogroup" aria-label="发布方式选择">
              <button
                type="button"
                class="publish-mode-option"
                :class="{ active: publishPaymentMode === 'self_managed' }"
                @click="updatePaymentMode('self_managed')"
              >
                <strong>无平台担保</strong>
                <small>平台提供协作与签署记录，付款双方另行约定</small>
              </button>
              <button
                type="button"
                class="publish-mode-option"
                :class="{
                  active: publishPaymentMode === 'platform_guarantee',
                  disabled: !allowPlatformGuarantee,
                }"
                :disabled="!allowPlatformGuarantee"
                @click="updatePaymentMode('platform_guarantee')"
              >
                <strong>平台担保</strong>
                <small>{{
                  allowPlatformGuarantee
                    ? '按平台定金与尾款规则推进'
                    : '暂未开放，当前仅支持无平台担保'
                }}</small>
              </button>
            </div>
          </div>
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
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.publish-modal-wrap {
  z-index: 1200;
  align-items: center;
  overflow-y: auto;
  padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
    max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
  background: rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(5px);
  overscroll-behavior: contain;
}

.publish-modal {
  width: min(600px, 100%);
  max-height: calc(100vh - 28px);
  max-height: calc(100dvh - 28px);
  border-radius: 18px;
  border-color: rgba(203, 213, 225, 0.84);
  background: #ffffff;
  box-shadow: 0 28px 68px rgba(15, 23, 42, 0.18);
  padding: 0;
  overflow: hidden;
}

.publish-modal__head {
  flex: 0 0 auto;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.76);
  background: linear-gradient(180deg, #ffffff 0%, rgba(248, 250, 252, 0.96) 100%);
}

.publish-modal__head h3 {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  line-height: 1.2;
}

.publish-modal__body {
  display: grid;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 22px 18px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.5) transparent;
}

.publish-modal__body label {
  gap: 7px;
  margin-bottom: 0;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

.publish-modal__body input,
.publish-modal__body textarea {
  border-color: rgba(203, 213, 225, 0.82);
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.04);
}

.publish-modal__body input {
  min-height: 42px;
}

.publish-modal__body textarea {
  min-height: 104px;
  max-height: 160px;
  resize: vertical;
}

.publish-modal__body textarea[rows='3'] {
  min-height: 86px;
}

.publish-modal__actions {
  flex: 0 0 auto;
  margin-top: 0;
  padding: 14px 22px 18px;
  border-top: 1px solid rgba(226, 232, 240, 0.78);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), #ffffff);
}

.publish-modal__actions .auth-btn {
  min-height: 40px;
  border-radius: 10px;
  padding: 0 18px;
  font-weight: 800;
}

.publish-modal__actions .auth-btn.ghost {
  border-color: rgba(203, 213, 225, 0.96);
  background: #ffffff;
  color: #334155;
}

.publish-modal__actions .auth-btn.solid {
  background: #2563eb;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2);
}

.publish-modal__actions .auth-btn.solid:hover:not(:disabled) {
  background: #1d4ed8;
}

.publish-mode-field {
  display: grid;
  gap: 9px;
}

.publish-mode-field > span {
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

.publish-mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.publish-mode-option {
  min-height: 76px;
  padding: 12px 13px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.78);
  color: #111827;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.publish-mode-option:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(239, 246, 255, 0.68);
}

.publish-mode-option.active {
  border-color: rgba(37, 99, 235, 0.86);
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.publish-mode-option.disabled {
  cursor: not-allowed;
  background: rgba(248, 250, 252, 0.68);
  opacity: 0.62;
}

.publish-mode-option strong,
.publish-mode-option small {
  display: block;
}

.publish-mode-option small {
  margin-top: 6px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.4;
}

@media (max-width: 640px) {
  .publish-modal-wrap {
    align-items: flex-end;
    padding: 10px;
    padding-top: max(10px, env(safe-area-inset-top));
    padding-bottom: max(10px, env(safe-area-inset-bottom));
  }

  .publish-modal {
    width: 100%;
    max-height: calc(100vh - 20px);
    max-height: calc(100dvh - 20px);
    border-radius: 16px;
  }

  .publish-modal__head {
    padding: 16px 16px 12px;
  }

  .publish-modal__body {
    gap: 12px;
    padding: 14px 16px 16px;
  }

  .publish-modal__actions {
    padding: 12px 16px 16px;
  }

  .publish-modal__actions .auth-btn {
    min-height: 42px;
  }

  .publish-mode-options {
    grid-template-columns: 1fr;
  }
}
</style>
