<script setup lang="ts">
import { computed, watch } from "vue";
import type { PropType } from "vue";

import RichTextEditor from "@/components/RichTextEditor.vue";

type NotifyType = "success" | "warning" | "error";

const props = defineProps({
  visible: { type: Boolean, default: false },
  modalTitle: { type: String, default: "发布需求" },
  submitText: { type: String, default: "确认发布" },
  loadingText: { type: String, default: "发布中..." },
  publishTitle: { type: [String, Number] as PropType<string | number>, default: "" },
  publishDescription: { type: String, default: "" },
  publishBudget: { type: [String, Number] as PropType<string | number>, default: "" },
  publishAcceptance: { type: String, default: "" },
  publishPaymentMode: {
    type: String as PropType<"platform_guarantee" | "self_managed">,
    default: "self_managed",
  },
  // TODO：后续实现平台担保功能后再开放此属性，目前先隐藏平台担保选项以免引起误解
  allowPlatformGuarantee: { type: Boolean, default: false },
  publishLoading: { type: Boolean, default: false },
  // 草稿作用域（一般传当前用户名），用于按用户隔离草稿，避免多账号共用浏览器时串数据
  draftScope: { type: String, default: "default" },
});

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit"): void;
  (e: "notify", message: string, type?: NotifyType): void;
  (e: "update:publishTitle", value: string): void;
  (e: "update:publishDescription", value: string): void;
  (e: "update:publishBudget", value: string | number): void;
  (e: "update:publishAcceptance", value: string): void;
  (e: "update:publishPaymentMode", value: "platform_guarantee" | "self_managed"): void;
}>();

function updateTitle(event: Event) {
  emit("update:publishTitle", (event.target as HTMLInputElement).value);
}

function updateDescription(value: string) {
  emit("update:publishDescription", value);
}

function updateBudget(event: Event) {
  emit("update:publishBudget", (event.target as HTMLInputElement).value);
}

function updateAcceptance(value: string) {
  emit("update:publishAcceptance", value);
}

function forwardNotify(message: string, type?: NotifyType) {
  emit("notify", message, type);
}

function updatePaymentMode(value: "platform_guarantee" | "self_managed") {
  if (value === "platform_guarantee" && !props.allowPlatformGuarantee) {
    return;
  }

  emit("update:publishPaymentMode", value);
}

// ===== 草稿系统 =====
// 所有使用场景（新建发布、重新编辑、重新提交审核）都启用草稿自动保存。
// draftScope 用于隔离不同场景/不同用户的数据，避免互相覆盖：
//   - 新建发布：username（或 default）
//   - 重新编辑/重提：edit-<id> / resubmit-<id> 等独立作用域
// 草稿在关闭弹窗后仍保留在 localStorage，下次打开自动恢复，防止误关丢失内容。

type PublishDraft = {
  title: string;
  description: string;
  budget: string;
  acceptance: string;
  paymentMode: "platform_guarantee" | "self_managed";
  savedAt: number;
};

const DRAFT_STORAGE_PREFIX = "73info_publish_draft_";

const draftEnabled = computed(() => props.draftScope !== "");

function draftStorageKey(scope = props.draftScope): string | null {
  if (!scope) {
    return null;
  }
  return `${DRAFT_STORAGE_PREFIX}${scope}`;
}

const hasMeaningfulDraft = computed(() => {
  const title = String(props.publishTitle ?? "").trim();
  const description = String(props.publishDescription ?? "").trim();
  const budget = String(props.publishBudget ?? "").trim();
  const acceptance = String(props.publishAcceptance ?? "").trim();
  return Boolean(title || description || budget || acceptance);
});

// 草稿是否已恢复过（避免组件在父组件主动重置表单时又覆盖回去）
let draftRestored = false;

function savePublishDraft() {
  const key = draftStorageKey();
  if (!draftEnabled.value || !key || !props.visible) {
    return;
  }

  if (!hasMeaningfulDraft.value) {
    // 用户主动清空全部内容时删除草稿，避免下次打开又"复活"
    clearPublishDraft();
    return;
  }

  if (!draftRestored) {
    return;
  }

  const draft: PublishDraft = {
    title: String(props.publishTitle ?? ""),
    description: String(props.publishDescription ?? ""),
    budget: String(props.publishBudget ?? ""),
    acceptance: String(props.publishAcceptance ?? ""),
    paymentMode: props.publishPaymentMode,
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // localStorage 不可用或超限时静默忽略，不影响正常发布流程
  }
}

function clearPublishDraft(scope?: string) {
  const key = draftStorageKey(scope);
  if (!key) {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 同上，静默忽略
  }
}

function restorePublishDraft() {
  const key = draftStorageKey();
  if (!draftEnabled.value || !key || !props.visible || draftRestored) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PublishDraft>;
      if (typeof parsed !== "object" || parsed === null) {
        return;
      }

      // 校验字段类型，避免脏数据导致表单异常
      const title = typeof parsed.title === "string" ? parsed.title : "";
      const description = typeof parsed.description === "string" ? parsed.description : "";
      const budget = typeof parsed.budget === "string" ? parsed.budget : "";
      const acceptance = typeof parsed.acceptance === "string" ? parsed.acceptance : "";
      const paymentMode =
        parsed.paymentMode === "platform_guarantee" || parsed.paymentMode === "self_managed"
          ? parsed.paymentMode
          : "self_managed";

      if (title || description || budget || acceptance) {
        emit("update:publishTitle", title);
        emit("update:publishDescription", description);
        emit("update:publishBudget", budget);
        emit("update:publishAcceptance", acceptance);
        emit("update:publishPaymentMode", paymentMode);
      }
    }
  } catch {
    // 草稿损坏时忽略，下次输入会重新覆盖
  } finally {
    draftRestored = true;
  }
}

// 打开弹窗时恢复草稿（immediate：页面通过 URL 直接带 modal=publish 加载时也能恢复）
watch(
  () => [props.visible, props.draftScope] as const,
  ([visible, draftScope]) => {
    if (visible && draftScope !== "") {
      restorePublishDraft();
    }
  },
  { immediate: true }
);

// 输入过程中自动保存草稿
watch(
  () => [
    props.publishTitle,
    props.publishDescription,
    props.publishBudget,
    props.publishAcceptance,
    props.publishPaymentMode,
  ],
  () => {
    savePublishDraft();
  }
);

// 弹窗关闭后重置恢复标记，下次打开重新恢复
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      draftRestored = false;
    }
  }
);

// 遮罩点击：直接关闭。填写内容已通过草稿自动保存，无需确认，避免打断操作习惯
function handleBackdropClick() {
  if (props.publishLoading) {
    return;
  }

  emit("close");
}

defineExpose({
  clearDraft: clearPublishDraft,
});

watch(
  () => [props.allowPlatformGuarantee, props.publishPaymentMode] as const,
  ([allowPlatformGuarantee, publishPaymentMode]) => {
    if (!allowPlatformGuarantee && publishPaymentMode === "platform_guarantee") {
      emit("update:publishPaymentMode", "self_managed");
    }
  },
  { immediate: true }
);
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="auth-modal-wrap publish-modal-wrap" @click.self="handleBackdropClick">
      <section class="auth-modal publish-modal" :aria-label="`${modalTitle}弹窗`">
        <header class="publish-modal__head">
          <h3>{{ modalTitle }}</h3>
        </header>

        <div class="publish-modal__body">
          <label>
            需求标题 *
            <input :value="publishTitle" type="text" maxlength="60" placeholder="例如：企业官网改版、小程序开发" required
              @input="updateTitle" />
          </label>
          <div class="publish-rich-field">
            <span>需求描述 *</span>
            <RichTextEditor :model-value="publishDescription" :floating-toolbar="false"
              @update:model-value="updateDescription" @notify="forwardNotify" />
          </div>
          <label>
            预算 *
            <input :value="publishBudget" type="number" min="0" step="0.01" placeholder="如 2000" required
              @input="updateBudget" />
          </label>
          <div class="publish-rich-field">
            <span>验收标准 *</span>
            <RichTextEditor :model-value="publishAcceptance" :floating-toolbar="false"
              @update:model-value="updateAcceptance" @notify="forwardNotify" />
          </div>
          <div class="publish-mode-field">
            <span>发布方式 *</span>
            <div class="publish-mode-options" :class="{ 'publish-mode-options--single': !allowPlatformGuarantee }"
              role="radiogroup" aria-label="发布方式选择">
              <button type="button" class="publish-mode-option"
                :class="{ active: publishPaymentMode === 'self_managed' }" @click="updatePaymentMode('self_managed')">
                <strong>无电签约定</strong>
                <small>平台提供协作与签署记录，付款双方另行约定</small>
              </button>
              <button v-if="allowPlatformGuarantee" type="button" class="publish-mode-option"
                :class="{ active: publishPaymentMode === 'platform_guarantee' }"
                @click="updatePaymentMode('platform_guarantee')">
                <strong>电签担保</strong>
                <small>按平台定金与尾款规则推进</small>
              </button>
            </div>
          </div>
        </div>

        <div class="auth-modal-actions publish-modal__actions">
          <button class="auth-btn ghost" type="button" @click="emit('close')">
            取消
          </button>
          <button class="auth-btn solid" type="button" :disabled="publishLoading" @click="emit('submit')">
            {{ publishLoading ? loadingText : submitText }}
          </button>
        </div>

        <footer v-if="draftEnabled" class="publish-modal__draft-hint">
          <span>内容将自动保存为草稿</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.publish-modal-wrap {
  z-index: 1200;
  align-items: center;
  overflow-y: auto;
  padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
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

.publish-modal__body textarea[rows="3"] {
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
  content: "";
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

.publish-mode-field>span {
  color: #334155;
  font-size: 13px;
  font-weight: 800;
}

.publish-mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.publish-mode-options--single {
  grid-template-columns: minmax(0, 1fr);
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
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease,
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
