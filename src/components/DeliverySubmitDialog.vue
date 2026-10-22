<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  createMcResourceVersion,
  listMcResourceVersions,
  type McResourceVersionPayload,
} from '@/api/mcResources'

import {
  TButton,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  Close,
  Document,
  TMessage,
  UploadFilled,
} from 'ui_73info'

/**
 * 提交交付版本弹窗：交付即给需求绑定的资源项目发一个新版本。
 * 开发者接单列表与会话工具条共用同一份表单，避免两处样式各写一套。
 */
const visible = defineModel<boolean>('visible', { required: true })

const props = defineProps<{
  token: string
  /** 需求绑定的资源项目；为空时没有可交付的载体。 */
  boundResourceId?: number | null
}>()

const emit = defineEmits<{
  submitted: []
}>()

const router = useRouter()

const version = ref('')
const note = ref('')
const artifact = ref<File | null>(null)
const artifactInput = ref<HTMLInputElement | null>(null)
const submitting = ref(false)
const versions = ref<McResourceVersionPayload[]>([])
const versionsLoading = ref(false)

watch(visible, (open) => {
  if (!open) {
    return
  }

  version.value = ''
  note.value = ''
  artifact.value = null
  versions.value = []
  void loadVersions()
})

async function loadVersions() {
  const resourceId = props.boundResourceId
  if (!props.token || resourceId == null) {
    return
  }

  versionsLoading.value = true
  try {
    versions.value = await listMcResourceVersions(props.token, resourceId)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '加载资源版本失败')
  } finally {
    versionsLoading.value = false
  }
}

function existingVersionsLabel() {
  if (versionsLoading.value) {
    return '加载中...'
  }

  if (versions.value.length === 0) {
    return '暂无'
  }

  const labels = versions.value.slice(0, 3).map((item) => item.version)
  const suffix = versions.value.length > 3 ? ` 等 ${versions.value.length} 版` : ''
  return `${labels.join('、')}${suffix}`
}

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
  artifact.value = input.files?.[0] ?? null
  input.value = ''
}

function clearArtifact() {
  artifact.value = null
  if (artifactInput.value) {
    artifactInput.value.value = ''
  }
}

function openResourceVersionPage() {
  if (props.boundResourceId == null) {
    return
  }

  void router.push({ name: 'dev-resource-versions', params: { resourceId: props.boundResourceId } })
}

function requestClose() {
  if (!submitting.value) {
    visible.value = false
  }
}

async function submit() {
  const resourceId = props.boundResourceId
  if (!props.token || resourceId == null) {
    TMessage.warning('当前需求还没有关联资源项目')
    return
  }

  const trimmedVersion = version.value.trim()
  if (!trimmedVersion) {
    TMessage.warning('请填写版本号')
    return
  }

  if (!artifact.value) {
    TMessage.warning('请选择交付文件')
    return
  }

  submitting.value = true
  try {
    const created = await createMcResourceVersion(props.token, resourceId, {
      version: trimmedVersion,
      file: artifact.value,
      note: note.value.trim() || null,
    })
    TMessage.success(`交付版本 ${created.version} 已提交，等待客户验收`)
    visible.value = false
    emit('submitted')
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '提交交付版本失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <TDialog
    v-model:open="visible"
    title="提交交付版本"
    width="520px"
    :mask-closable="false"
    :escape-closable="false"
  >
    <div class="delivery-dialog-body">
      <p class="delivery-dialog__tip">交付物会保存为绑定资源项目的新版本，验收前至少提交一版。</p>
      <TForm label-position="top" class="delivery-dialog-form">
        <TFormItem label="版本号" required>
          <TInput v-model="version" :maxlength="80" placeholder="例如：1.0.0、首版功能交付" />
        </TFormItem>
        <TFormItem label="交付说明">
          <TInput
            show-count
            v-model="note"
            type="textarea"
            :rows="2"
            :maxlength="1000"
            placeholder="已完成的功能、使用方式和已知限制（会作为版本备注）"
          />
        </TFormItem>
        <TFormItem label="交付文件" required>
          <div class="delivery-artifact-field">
            <input
              ref="artifactInput"
              class="delivery-artifact-field__native"
              type="file"
              @change="handleArtifactChange"
            />

            <div
              v-if="!artifact"
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
                <strong :title="artifact.name">{{ artifact.name }}</strong>
                <small>{{ formatBytes(artifact.size) }} · 提交后可在资源项目版本页管理</small>
              </span>
              <button
                type="button"
                class="delivery-artifact-field__remove"
                title="移除文件"
                @click="clearArtifact"
              >
                <TIcon>
                  <Close />
                </TIcon>
              </button>
            </div>
          </div>
        </TFormItem>
      </TForm>

      <div class="delivery-existing">
        <span class="delivery-existing__label">已有交付版本</span>
        <span class="delivery-existing__value">{{ existingVersionsLabel() }}</span>
        <button
          v-if="boundResourceId != null"
          type="button"
          class="delivery-existing__link"
          @click="openResourceVersionPage"
        >
          去资源项目版本页
        </button>
      </div>
    </div>
    <template #footer>
      <TButton :disabled="submitting" @click="requestClose">取消</TButton>
      <TButton variant="solid" tone="accent" :loading="submitting" @click="submit"
        >提交交付版本</TButton
      >
    </template>
  </TDialog>
</template>

<style scoped>
.delivery-dialog-body {
  display: grid;
  gap: 10px;
}

.delivery-dialog__tip {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid rgba(251, 191, 36, 0.32);
  border-radius: 10px;
  background: rgba(254, 243, 199, 0.48);
  color: #92400e;
  font-size: 12px;
  line-height: 1.5;
}

/* TFormItem 默认下边距 18px，这张表单更紧凑，收到 12px */
.delivery-dialog-form :deep(.t73-form-item) {
  margin-bottom: 12px;
}

.delivery-dialog-form :deep(.t73-form-item:last-child) {
  margin-bottom: 0;
}

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
  border: 1px dashed rgba(148, 163, 184, 0.72);
  background: rgba(248, 250, 252, 0.78);
  cursor: pointer;
}

.delivery-artifact-field__dropzone:hover {
  border-color: rgba(37, 99, 235, 0.58);
  background: rgba(239, 246, 255, 0.72);
}

.delivery-artifact-field__dropzone:focus-visible {
  outline: none;
  border-color: rgba(37, 99, 235, 0.7);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.delivery-artifact-field__file {
  border: 1px solid rgba(34, 197, 94, 0.34);
  background: rgba(240, 253, 244, 0.66);
}

.delivery-artifact-field__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 16px;
}

.delivery-artifact-field__icon--file {
  background: rgba(220, 252, 231, 0.9);
  color: #15803d;
}

.delivery-artifact-field__copy {
  display: grid;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.delivery-artifact-field__copy strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delivery-artifact-field__copy small {
  color: #64748b;
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
  color: #94a3b8;
  cursor: pointer;
  font-size: 14px;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.delivery-artifact-field__remove:hover {
  background: rgba(254, 226, 226, 0.8);
  color: #dc2626;
}

.delivery-existing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 12px;
}

.delivery-existing__label {
  flex: 0 0 auto;
  color: #334155;
  font-weight: 800;
}

.delivery-existing__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delivery-existing__link {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
</style>
