<script setup lang="ts">
import { ref } from 'vue'
import { Close, Document, TIcon, UploadFilled } from 'ui_73info'

/**
 * 交付文件选择字段。
 *
 * 真正的原生 `<input type="file">` 藏在卡片后面（`display: none`），由卡片代理点击；
 * 选中的文件由父组件持有，这里只向上抛 `select` / `clear`，并负责把文件大小算成人能读的字符串。
 */
const props = defineProps<{
  artifact: File | null
}>()

const emit = defineEmits<{
  select: [file: File]
  clear: []
}>()

const artifactInput = ref<HTMLInputElement | null>(null)

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 || size >= 10 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function chooseArtifact() {
  artifactInput.value?.click()
}

function handleArtifactChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) {
    emit('select', file)
  }
}
</script>

<template>
  <div class="delivery-artifact-field">
    <input
      ref="artifactInput"
      class="delivery-artifact-field__native"
      type="file"
      @change="handleArtifactChange"
    />

    <div
      v-if="!props.artifact"
      class="delivery-artifact-field__dropzone"
      role="button"
      tabindex="0"
      @click="chooseArtifact"
      @keydown.enter.prevent="chooseArtifact"
      @keydown.space.prevent="chooseArtifact"
    >
      <span class="delivery-artifact-field__icon" aria-hidden="true">
        <TIcon>
          <UploadFilled />
        </TIcon>
      </span>
      <span class="delivery-artifact-field__copy">
        <strong>点击选择交付文件</strong>
        <small>文件会作为资源项目新版本保存，客户可在需求详情中下载</small>
      </span>
    </div>

    <div v-else class="delivery-artifact-field__file">
      <span
        class="delivery-artifact-field__icon delivery-artifact-field__icon--file"
        aria-hidden="true"
      >
        <TIcon>
          <Document />
        </TIcon>
      </span>
      <span class="delivery-artifact-field__copy">
        <strong :title="props.artifact.name">{{ props.artifact.name }}</strong>
        <small>{{ formatBytes(props.artifact.size) }} · 提交后可在资源项目版本页管理</small>
      </span>
      <button
        type="button"
        class="delivery-artifact-field__remove"
        title="移除文件"
        @click="emit('clear')"
      >
        <TIcon>
          <Close />
        </TIcon>
      </button>
    </div>
  </div>
</template>

<style scoped>
.delivery-artifact-field {
  display: grid;
  gap: 10px;
  width: 100%;
}

/* 真正的文件选择框由上传卡片代理，原生控件不再出现 */
.delivery-artifact-field__native {
  display: none;
}

.delivery-artifact-field__dropzone,
.delivery-artifact-field__file {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 11px 12px;
  border-radius: 12px;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.delivery-artifact-field__dropzone {
  border: 1px dashed color-mix(in srgb, var(--73-ink-placeholder) 72%, transparent);
  background: color-mix(in srgb, var(--73-surface-strong) 78%, transparent);
  cursor: pointer;
}

.delivery-artifact-field__dropzone:hover {
  border-color: color-mix(in srgb, var(--73-accent) 58%, transparent);
  background: color-mix(in srgb, var(--73-accent-soft) 72%, transparent);
}

.delivery-artifact-field__dropzone:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--73-accent) 70%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--73-accent) 12%, transparent);
}

.delivery-artifact-field__file {
  border: 1px solid color-mix(in srgb, var(--73-success) 34%, transparent);
  background: color-mix(in srgb, var(--73-success-soft) 66%, transparent);
}

.delivery-artifact-field__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: var(--73-accent-soft);
  color: var(--73-accent);
  font-size: 16px;
}

.delivery-artifact-field__icon--file {
  background: color-mix(in srgb, var(--73-success-soft) 90%, transparent);
  color: var(--73-success);
}

.delivery-artifact-field__copy {
  display: grid;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.delivery-artifact-field__copy strong {
  color: var(--73-ink);
  font-size: 13px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delivery-artifact-field__copy small {
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.45;
}

.delivery-artifact-field__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--73-ink-placeholder);
  cursor: pointer;
  font-size: 14px;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.delivery-artifact-field__remove:hover {
  background: color-mix(in srgb, var(--73-danger-soft) 80%, transparent);
  color: var(--73-danger);
}
</style>
