<script setup lang="ts">
/**
 * 「编辑简介」弹窗：只有一块 300 字上限的文本域，保存动作在 `useDevProfileEdit`。
 *
 * 从 `DevProfileView` 抽出来，标记与样式原样保留（自绘遮罩 + 面板，不是 TDialog）。
 */
const open = defineModel<boolean>('open', { required: true })
const description = defineModel<string>('description', { required: true })

defineProps<{ saving: boolean }>()

const emit = defineEmits<{ save: [] }>()
</script>

<template>
  <div v-if="open" class="dev-profile-modal" @click.self="open = false">
    <section
      class="dev-profile-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <header class="dev-profile-modal__header">
        <div>
          <h2 id="profile-modal-title">编辑简介</h2>
        </div>
        <button
          class="dev-profile-modal__close"
          type="button"
          aria-label="关闭"
          @click="open = false"
        >
          ×
        </button>
      </header>
      <div class="dev-profile-modal__body">
        <label class="dev-profile-modal__label" for="profile-description-input">个人简介</label>
        <div class="dev-profile-modal__field">
          <textarea
            id="profile-description-input"
            v-model="description"
            maxlength="300"
            rows="5"
            placeholder="介绍一下自己、擅长的平台或作品方向"
          />
          <span>{{ description.length }} / 300</span>
        </div>
      </div>
      <footer class="dev-profile-modal__actions">
        <button
          class="dev-profile-modal__button dev-profile-modal__button--ghost"
          type="button"
          @click="open = false"
        >
          取消
        </button>
        <button
          class="dev-profile-modal__button dev-profile-modal__button--primary"
          type="button"
          :disabled="saving"
          @click="emit('save')"
        >
          {{ saving ? '保存中...' : '保存简介' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style>
.dev-profile-modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--dp-scrim-28);
  backdrop-filter: blur(4px);
}

.dev-profile-modal__panel {
  width: min(480px, 100%);
  overflow: hidden;
  border: 1px solid var(--dp-border-soft);
  border-radius: 18px;
  background: var(--dp-white);
  box-shadow: 0 20px 48px var(--dp-shadow-deep);
}

.dev-profile-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 16px;
  border-bottom: 1px solid var(--dp-divider);
}

.dev-profile-modal__header h2 {
  margin: 0;
  color: var(--dp-ink);
  font-size: 20px;
  font-weight: 800;
}

.dev-profile-modal__close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dp-text-faint);
  font-size: 25px;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.dev-profile-modal__close:hover {
  background: var(--dp-accent-bg);
  color: var(--dp-accent);
}

.dev-profile-modal__body {
  padding: 22px 24px 8px;
}

.dev-profile-modal__label {
  display: block;
  margin-bottom: 8px;
  color: var(--dp-ink-soft);
  font-size: 13px;
  font-weight: 700;
}

.dev-profile-modal__field {
  position: relative;
}

.dev-profile-modal__field textarea {
  display: block;
  width: 100%;
  min-height: 132px;
  padding: 12px 14px 30px;
  border: 1px solid var(--dp-border);
  border-radius: 12px;
  outline: none;
  background: var(--dp-surface);
  color: var(--dp-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.dev-profile-modal__field textarea:focus {
  border-color: var(--dp-accent-light);
  background: var(--dp-white);
  box-shadow: 0 0 0 3px var(--dp-ring-accent-16);
}

.dev-profile-modal__field span {
  position: absolute;
  right: 12px;
  bottom: 9px;
  color: var(--dp-text-faint);
  gap: 20px;
  font-size: 12px;
  pointer-events: none;
}

.dev-profile-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 20px;
  border-top: 1px solid var(--dp-divider);
}

.dev-profile-modal__button {
  min-width: 84px;
  height: 38px;
  padding: 0 16px;
  border-radius: 9px;
  font: inherit;
  background: var(--dp-surface-70);
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.dev-profile-modal__button--ghost {
  border: 1px solid var(--dp-border);
  background: var(--dp-white);
  color: var(--dp-text-muted);
}

.dev-profile-modal__button--ghost:hover {
  border-color: var(--dp-border-accent);
  background: var(--dp-accent-bg);
  color: var(--dp-accent);
}

.dev-profile-modal__button--primary {
  border: 1px solid var(--dp-accent);
  background: var(--dp-accent);
  color: var(--dp-white);
}

.dev-profile-modal__button--primary:hover:not(:disabled) {
  border-color: var(--dp-accent-strong);
  background: var(--dp-accent-strong);
  transform: translateY(-1px);
}

.dev-profile-modal__button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 640px) {
  .dev-profile__edit-dialog {
    width: calc(100% - 32px) !important;
  }

  .dev-profile__edit-dialog {
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--dp-border-accent-72);
    border-radius: 18px;
    box-shadow: 0 20px 48px var(--dp-shadow-deep);
  }
}
</style>
