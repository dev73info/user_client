<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { TIcon, ArrowDown } from 'ui_73info'

import RequirementAgentPanel from '@/components/RequirementAgentPanel.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import {
  loadAdapayAvailability,
  platformGuaranteeLoaded,
  platformGuaranteeReady,
} from '@/shared/adapayAvailability'
import type { RequirementDraftFormValues } from '@/shared/requirementDraft'
import { acceptanceTemplates, type AcceptanceTemplate } from '@/utils/acceptanceTemplates'
import { requirementRichTextHasMeaningfulContent } from '@/utils/requirementRichText'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

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

function updateTitle(event: Event) {
  emit('update:publishTitle', (event.target as HTMLInputElement).value)
}

function updateDescription(value: string) {
  emit('update:publishDescription', value)
}

function updateBudget(event: Event) {
  emit('update:publishBudget', (event.target as HTMLInputElement).value)
}

function updateAcceptance(value: string) {
  emit('update:publishAcceptance', value)
}

function updateDevelopmentCycleDays(event: Event) {
  emit('update:publishDevelopmentCycleDays', (event.target as HTMLInputElement).value)
}

/**
 * 是否电签担保：只有担保需求才需要填「开发周期」（R014）。
 *
 * 无担保需求（`self_managed`）不建合同、也没有有效期，发布 / 编辑时不显示该字段；
 * 视图提交时同样按这个模式决定要不要带上 `development_cycle_days`。
 */
const isGuaranteeMode = computed(() => props.publishPaymentMode === 'platform_guarantee')

/** 开发周期输入区内的提示：讲清「这是合同有效期、以后端下限为准」。 */
const developmentCycleHint = computed(
  () =>
    '开发周期（天）＝合同自双方签署完成到截止的有效期；低于平台配置的最短天数会被拒绝，具体下限以后端提示为准。',
)

function forwardNotify(message: string, type?: NotifyType) {
  emit('notify', message, type)
}

function updatePaymentMode(value: 'platform_guarantee' | 'self_managed') {
  if (value === 'platform_guarantee' && !platformGuaranteeAllowed.value) {
    return
  }

  emit('update:publishPaymentMode', value)
}

// ===== AI 需求助手 =====
// 「跟 AI 聊着填」：在弹窗内以二级层承载对话面板，聊出的草稿回填到下面这五个字段，
// 最终仍由用户点原来的「确认发布」创建需求（本组件不直接建需求）。
const agentMode = ref(false)

function toggleAgentPanel() {
  agentMode.value = !agentMode.value
}

/** 回填草稿：只覆盖草稿里有内容的字段，避免把用户手填的内容抹成空 */
function applyAgentDraft(values: RequirementDraftFormValues) {
  const title = values.title.trim()
  if (title) {
    emit('update:publishTitle', title)
  }
  if (values.description.trim()) {
    emit('update:publishDescription', values.description)
  }
  if (values.budget.trim()) {
    emit('update:publishBudget', values.budget)
  }
  if (values.acceptance.trim()) {
    emit('update:publishAcceptance', values.acceptance)
  }
  updatePaymentMode(values.paymentMode)

  agentMode.value = false
  emit('notify', '已把整理好的需求填入表单，确认无误后点「确认发布」', 'success')
}

// ===== 验收标准模板 =====
// 模板入口固定在「验收标准」标签行右侧。选择模板后在编辑器中填入结构化骨架，
// 编辑器已有内容时先弹站内样式的覆盖确认，避免误操作丢掉已写内容。

const acceptanceTemplateMenuOpen = ref(false)
const pendingAcceptanceTemplate = ref<AcceptanceTemplate | null>(null)
const acceptanceTemplateRootRef = ref<HTMLElement | null>(null)
const acceptanceTemplateTriggerRef = ref<HTMLButtonElement | null>(null)
const acceptanceTemplateConfirmRef = ref<HTMLButtonElement | null>(null)
const acceptanceEditorRef = ref<InstanceType<typeof RichTextEditor> | null>(null)

function toggleAcceptanceTemplateMenu() {
  acceptanceTemplateMenuOpen.value = !acceptanceTemplateMenuOpen.value
}

function closeAcceptanceTemplateMenu() {
  acceptanceTemplateMenuOpen.value = false
}

function handleAcceptanceTemplatePointerDown(event: PointerEvent) {
  if (!acceptanceTemplateMenuOpen.value) {
    return
  }

  const target = event.target
  // 点击入口或菜单内部不关闭，由其自身交互处理
  if (target instanceof Node && acceptanceTemplateRootRef.value?.contains(target)) {
    return
  }

  closeAcceptanceTemplateMenu()
}

function handleAcceptanceTemplateKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') {
    return
  }

  // 覆盖确认打开时，Escape 只关闭确认框
  if (pendingAcceptanceTemplate.value) {
    cancelAcceptanceTemplate()
    return
  }

  closeAcceptanceTemplateMenu()
}

function fillAcceptanceTemplate(template: AcceptanceTemplate) {
  emit('update:publishAcceptance', sanitizeRichHtml(template.html))
  void nextTick(() => {
    // 填入后聚焦编辑器，方便直接按括号提示补充内容
    acceptanceEditorRef.value?.focus()
  })
}

function requestAcceptanceTemplate(template: AcceptanceTemplate) {
  closeAcceptanceTemplateMenu()

  if (requirementRichTextHasMeaningfulContent(String(props.publishAcceptance ?? ''))) {
    pendingAcceptanceTemplate.value = template
    void nextTick(() => acceptanceTemplateConfirmRef.value?.focus())
    return
  }

  fillAcceptanceTemplate(template)
}

function cancelAcceptanceTemplate() {
  if (!pendingAcceptanceTemplate.value) {
    return
  }

  pendingAcceptanceTemplate.value = null
  void nextTick(() => acceptanceTemplateTriggerRef.value?.focus())
}

function confirmAcceptanceTemplate() {
  const template = pendingAcceptanceTemplate.value
  pendingAcceptanceTemplate.value = null

  if (template) {
    fillAcceptanceTemplate(template)
  }
}

// 弹窗关闭时收起模板菜单与覆盖确认，避免下次打开残留；AI 面板也回到表单视图
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      closeAcceptanceTemplateMenu()
      pendingAcceptanceTemplate.value = null
      agentMode.value = false
    }
  },
)

// ===== 草稿系统 =====
// 所有使用场景（新建发布、重新编辑、重新提交审核）都启用草稿自动保存。
// draftScope 用于隔离不同场景/不同用户的数据，避免互相覆盖：
//   - 新建发布：username（或 default）
//   - 重新编辑/重提：edit-<id> / resubmit-<id> 等独立作用域
// 草稿在关闭弹窗后仍保留在 localStorage，下次打开自动恢复，防止误关丢失内容。

type PublishDraft = {
  title: string
  description: string
  budget: string
  acceptance: string
  paymentMode: 'platform_guarantee' | 'self_managed'
  /** 开发周期（天，R014）：担保需求必填；无担保需求不显示该字段，草稿里存空串。 */
  developmentCycleDays: string
  savedAt: number
}

const DRAFT_STORAGE_PREFIX = '73info_publish_draft_'

const draftEnabled = computed(() => props.draftScope !== '')

function draftStorageKey(scope = props.draftScope): string | null {
  if (!scope) {
    return null
  }
  return `${DRAFT_STORAGE_PREFIX}${scope}`
}

const hasMeaningfulDraft = computed(() => {
  const title = String(props.publishTitle ?? '').trim()
  const description = String(props.publishDescription ?? '').trim()
  const budget = String(props.publishBudget ?? '').trim()
  const acceptance = String(props.publishAcceptance ?? '').trim()
  const developmentCycleDays = String(props.publishDevelopmentCycleDays ?? '').trim()
  return Boolean(title || description || budget || acceptance || developmentCycleDays)
})

// 草稿是否已恢复过（避免组件在父组件主动重置表单时又覆盖回去）
let draftRestored = false

function savePublishDraft() {
  const key = draftStorageKey()
  if (!draftEnabled.value || !key || !props.visible) {
    return
  }

  if (!hasMeaningfulDraft.value) {
    // 用户主动清空全部内容时删除草稿，避免下次打开又"复活"
    clearPublishDraft()
    return
  }

  if (!draftRestored) {
    return
  }

  const draft: PublishDraft = {
    title: String(props.publishTitle ?? ''),
    description: String(props.publishDescription ?? ''),
    budget: String(props.publishBudget ?? ''),
    acceptance: String(props.publishAcceptance ?? ''),
    paymentMode: props.publishPaymentMode,
    developmentCycleDays: String(props.publishDevelopmentCycleDays ?? ''),
    savedAt: Date.now(),
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // localStorage 不可用或超限时静默忽略，不影响正常发布流程
  }
}

function clearPublishDraft(scope?: string) {
  const key = draftStorageKey(scope)
  if (!key) {
    return
  }
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 同上，静默忽略
  }
}

function restorePublishDraft() {
  const key = draftStorageKey()
  if (!draftEnabled.value || !key || !props.visible || draftRestored) {
    return
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PublishDraft>
      if (typeof parsed !== 'object' || parsed === null) {
        return
      }

      // 校验字段类型，避免脏数据导致表单异常
      const title = typeof parsed.title === 'string' ? parsed.title : ''
      const description = typeof parsed.description === 'string' ? parsed.description : ''
      const budget = typeof parsed.budget === 'string' ? parsed.budget : ''
      const acceptance = typeof parsed.acceptance === 'string' ? parsed.acceptance : ''
      const developmentCycleDays =
        typeof parsed.developmentCycleDays === 'string' ? parsed.developmentCycleDays : ''
      const paymentMode =
        parsed.paymentMode === 'platform_guarantee' || parsed.paymentMode === 'self_managed'
          ? parsed.paymentMode
          : 'self_managed'

      if (title || description || budget || acceptance || developmentCycleDays) {
        emit('update:publishTitle', title)
        emit('update:publishDescription', description)
        emit('update:publishBudget', budget)
        emit('update:publishAcceptance', acceptance)
        emit('update:publishPaymentMode', paymentMode)
        emit('update:publishDevelopmentCycleDays', developmentCycleDays)
      }
    }
  } catch {
    // 草稿损坏时忽略，下次输入会重新覆盖
  } finally {
    draftRestored = true
  }
}

// 打开弹窗时恢复草稿（immediate：页面通过 URL 直接带 modal=publish 加载时也能恢复）
watch(
  () => [props.visible, props.draftScope] as const,
  ([visible, draftScope]) => {
    if (visible && draftScope !== '') {
      restorePublishDraft()
    }
  },
  { immediate: true },
)

// 输入过程中自动保存草稿
watch(
  () => [
    props.publishTitle,
    props.publishDescription,
    props.publishBudget,
    props.publishAcceptance,
    props.publishPaymentMode,
    props.publishDevelopmentCycleDays,
  ],
  () => {
    savePublishDraft()
  },
)

// 弹窗关闭后重置恢复标记，下次打开重新恢复
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      draftRestored = false
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

// 是否展示「电签担保」：显式传入时以传入值为准，否则跟随服务端可用性
// （后端会校验 Adapay 密钥、回调地址、个税规则等配置是否齐备）。
const platformGuaranteeAllowed = computed(
  () => props.allowPlatformGuarantee ?? platformGuaranteeReady.value,
)

onMounted(() => {
  if (props.allowPlatformGuarantee === undefined) {
    void loadAdapayAvailability()
  }

  document.addEventListener('pointerdown', handleAcceptanceTemplatePointerDown, true)
  document.addEventListener('keydown', handleAcceptanceTemplateKeydown)
})

// 每次打开弹窗再确认一次可用性。
//
// 组件实例在首页就是挂载状态（`visible` 只是内层 v-if），`onMounted` 那一次请求往往
// 赶在自动登录落地之前，问到的是匿名身份的结果；那个结果不会被缓存
// （见 `shared/adapayAvailability.ts`），但要有人再问一次才会被纠正——
// 少了这一步，「电签担保」在整个页面会话里都不会出现。
watch(
  () => props.visible,
  (visible) => {
    if (visible && props.allowPlatformGuarantee === undefined) {
      void loadAdapayAvailability()
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleAcceptanceTemplatePointerDown, true)
  document.removeEventListener('keydown', handleAcceptanceTemplateKeydown)
})

watch(
  () =>
    [
      platformGuaranteeAllowed.value,
      platformGuaranteeLoaded.value,
      props.publishPaymentMode,
    ] as const,
  ([allowed, loaded, publishPaymentMode]) => {
    // 可用性尚未加载完成时不降级，否则会误清掉草稿里已选的担保模式。
    if (!loaded && props.allowPlatformGuarantee === undefined) {
      return
    }
    if (!allowed && publishPaymentMode === 'platform_guarantee') {
      emit('update:publishPaymentMode', 'self_managed')
    }
  },
  { immediate: true },
)
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
          <button
            v-if="!agentMode"
            type="button"
            class="publish-agent__trigger"
            title="跟 AI 聊着填：用自然语言说清需求，AI 帮你整理成表单内容"
            @click="toggleAgentPanel"
          >
            <span>跟 AI 聊着填</span>
          </button>
        </header>

        <div v-if="agentMode" class="publish-modal__agent">
          <RequirementAgentPanel
            @close="toggleAgentPanel"
            @filled="applyAgentDraft"
            @notify="forwardNotify"
          />
        </div>

        <div v-else class="publish-modal__body">
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

        <div v-if="!agentMode" class="auth-modal-actions publish-modal__actions">
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

        <footer v-if="draftEnabled && !agentMode" class="publish-modal__draft-hint">
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
  width: min(920px, 100%);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.76);
  background: linear-gradient(180deg, #ffffff 0%, rgba(248, 250, 252, 0.96) 100%);
}

.publish-modal__head h3 {
  margin: 0;
  min-width: 0;
  color: #0f172a;
  font-size: 20px;
  line-height: 1.2;
}

/* 「跟 AI 聊着填」入口：沿用验收标准模板按钮的浅底描边口径 */
.publish-agent__trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  min-height: 30px;
  padding: 4px 11px;
  border: 1px solid rgba(37, 99, 235, 0.34);
  border-radius: 9px;
  background: #eff6ff;
  color: #1d4ed8;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.publish-agent__trigger:hover,
.publish-agent__trigger:focus-visible {
  border-color: rgba(37, 99, 235, 0.7);
  background: #dbeafe;
  color: #1e40af;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

/* AI 对话二级层：占满弹窗剩余高度，滚动交给面板内部的对话区 / 草稿区 */
.publish-modal__agent {
  display: flex;
  flex: 1 1 auto;
  min-height: min(62vh, 560px);
  overflow: hidden;
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

.publish-rich-field {
  display: grid;
  gap: 7px;
  min-width: 0;
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

.publish-rich-field :deep(.rich-text-editor) {
  font-weight: 500;
}

.publish-rich-field__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.publish-template {
  position: relative;
  flex: 0 0 auto;
}

.publish-template__trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 3px 9px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 8px;
  background: #ffffff;
  color: #475569;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.publish-template__trigger:hover {
  border-color: rgba(37, 99, 235, 0.5);
  background: #f8fafc;
  color: #1d4ed8;
}

.publish-template__trigger:focus-visible,
.publish-template__trigger.is-open {
  border-color: rgba(37, 99, 235, 0.7);
  background: #eff6ff;
  color: #1d4ed8;
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.publish-template__caret {
  font-size: 12px;
  transition: transform 160ms ease;
}

.publish-template__trigger.is-open .publish-template__caret {
  transform: rotate(180deg);
}

.publish-template__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: grid;
  min-width: 232px;
  max-width: min(320px, calc(100vw - 56px));
  gap: 3px;
  padding: 6px;
  border: 1px solid rgba(191, 219, 254, 0.9);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(14px);
}

.publish-template__option {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #334155;
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.publish-template__option:hover,
.publish-template__option:focus-visible {
  outline: none;
  background: rgba(219, 234, 254, 0.78);
  color: #1d4ed8;
}

.publish-template__option strong {
  font-size: 13px;
  font-weight: 800;
}

.publish-template__option small {
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
}

.publish-confirm-wrap {
  z-index: 1260;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(5px);
}

.publish-confirm {
  width: min(430px, 100%);
  padding: 20px 22px 18px;
  border-radius: 18px;
  border-color: rgba(203, 213, 225, 0.84);
  background: #ffffff;
  box-shadow: 0 28px 68px rgba(15, 23, 42, 0.2);
}

.publish-confirm h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.25;
}

.publish-confirm__meta {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.publish-confirm__text {
  margin: 12px 0 0;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.7;
}

.publish-confirm__actions {
  margin-top: 16px;
}

.publish-confirm__actions .auth-btn {
  min-height: 40px;
  border-radius: 10px;
  padding: 0 18px;
  font-weight: 800;
}

.publish-confirm__actions .auth-btn.solid {
  background: #2563eb;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2);
}

.publish-confirm__actions .auth-btn.solid:hover:not(:disabled) {
  background: #1d4ed8;
}

.publish-rich-field :deep(.rich-text-editor__toolbar-shell) {
  position: sticky;
  top: 0;
  z-index: 18;
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

.publish-modal__draft-hint {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 22px 14px;
  color: #94a3b8;
  font-size: 12px;
}

.publish-modal__draft-hint::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
  flex: 0 0 auto;
}

.publish-mode-field {
  display: grid;
  gap: 9px;
}

/* R014：开发周期输入区与提示。提示是说明性小字，不抢输入的视觉权重。 */
.publish-cycle-hint {
  margin: -6px 0 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
}

.publish-mode-field > span {
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

/* 两档只剩标题，做成一行分段选择：灰底槽 + 选中项白卡蓝字 */
.publish-mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: #f1f5f9;
}

.publish-mode-options--single {
  grid-template-columns: minmax(0, 1fr);
}

.publish-mode-option {
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #475569;
  font-size: 14px;
  text-align: center;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

.publish-mode-option strong {
  font-weight: 700;
}

.publish-mode-option:hover:not(:disabled):not(.active) {
  color: #1d4ed8;
}

.publish-mode-option.active {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.1),
    0 0 0 1px rgba(37, 99, 235, 0.18);
}

.publish-mode-option:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
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
    align-items: center;
    padding: 10px;
    padding-top: max(10px, env(safe-area-inset-top));
    padding-bottom: max(10px, env(safe-area-inset-bottom));
  }

  .publish-confirm-wrap {
    padding: 14px;
    padding-top: max(14px, env(safe-area-inset-top));
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }

  .publish-confirm {
    width: 100%;
    padding: 18px;
  }

  .publish-modal {
    width: 100%;
    max-height: calc(100vh - 20px);
    max-height: calc(100dvh - 20px);
    border-radius: 16px;
  }

  .publish-modal__head {
    flex-wrap: wrap;
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
}
</style>
