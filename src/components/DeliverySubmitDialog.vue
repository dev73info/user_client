<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  createMcResourceVersion,
  listMcResourceVersions,
  type McResourceVersionPayload,
} from '@/api/mcResources'

import DeliveryArtifactField from '@/components/delivery/DeliveryArtifactField.vue'
import { TButton, TDialog, TForm, TFormItem, TInput, TMessage } from 'ui_73info'

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

function onArtifactSelected(file: File) {
  artifact.value = file
}

function clearArtifact() {
  artifact.value = null
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
          <DeliveryArtifactField
            :artifact="artifact"
            @select="onArtifactSelected"
            @clear="clearArtifact"
          />
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
  border: 1px solid color-mix(in srgb, var(--73-warning) 32%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--73-warning-soft) 48%, transparent);
  color: var(--73-warning-text);
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

.delivery-existing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--73-ink-muted);
  font-size: 12px;
}

.delivery-existing__label {
  flex: 0 0 auto;
  color: var(--73-ink-soft);
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
  color: var(--73-accent);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
</style>
