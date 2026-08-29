<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue'
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl } from '@dev/api/http'
import { with73Extension } from '@/api/resources'
import {
  createMcResourceVersion,
  deleteMcResourceVersion,
  getMcResource,
  listMcResourceVersions,
  type McResourcePayload,
  type McResourceVersionPayload,
  updateMcResourceVersion,
} from '@dev/api/mcResources'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'
import { buildUnifiedAuthUrl } from '@/config/runtime'
import { ArrowDown, Plus } from '@element-plus/icons-vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const versionsLoading = ref(false)
const publishing = ref(false)
const deletingVersionId = ref<number | null>(null)
const savingVersionId = ref<number | null>(null)
const deleteVersionDialogVisible = ref(false)
const resource = ref<McResourcePayload | null>(null)
const versionRows = ref<McResourceVersionPayload[]>([])
const versionFileInput = ref<HTMLInputElement | null>(null)
const selectedVersionFile = ref<File | null>(null)
const selectedVersionFileName = ref('')
const editingVersion = ref<McResourceVersionPayload | null>(null)
const editVersionDialogVisible = ref(false)
const editVersionFileInput = ref<HTMLInputElement | null>(null)
const editSelectedFile = ref<File | null>(null)
const editSelectedFileName = ref('')
const createNoteEditor = ref<InstanceType<typeof RichTextEditor> | null>(null)
const editNoteEditor = ref<InstanceType<typeof RichTextEditor> | null>(null)
const createVersionDialogVisible = ref(false)

const createForm = reactive({
  version: '',
  note: '',
})

const editVersionForm = reactive({
  version: '',
  note: '',
})

const deleteVersionTarget = ref<McResourceVersionPayload | null>(null)

onMounted(async () => {
  auth.hydrate()
  await loadPage()
})

async function loadPage() {
  const resourceId = Number(route.params.resourceId)
  if (!Number.isInteger(resourceId) || resourceId <= 0) {
    showToast('资源编号无效', 'warning')
    router.replace({ name: 'dev-resource-list' })
    return
  }

  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    router.replace(buildUnifiedAuthUrl('login', route.fullPath))
    return
  }

  loading.value = true
  try {
    const [resourcePayload, versionsPayload] = await Promise.all([
      getMcResource(auth.token, resourceId),
      listMcResourceVersions(auth.token, resourceId),
    ])

    resource.value = resourcePayload
    versionRows.value = versionsPayload
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载版本管理失败'
    showToast(message, 'error')
    router.replace({ name: 'dev-resource-list' })
  } finally {
    loading.value = false
  }
}

async function reloadVersions() {
  if (!auth.token || !resource.value) {
    return
  }

  versionsLoading.value = true
  try {
    versionRows.value = await listMcResourceVersions(auth.token, resource.value.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载版本列表失败'
    showToast(message, 'error')
  } finally {
    versionsLoading.value = false
  }
}

function triggerVersionFileSelect() {
  versionFileInput.value?.click()
}

function handleVersionFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  selectedVersionFile.value = file
  selectedVersionFileName.value = file?.name ?? ''
}

function triggerEditVersionFileSelect() {
  editVersionFileInput.value?.click()
}

function handleEditVersionFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  editSelectedFile.value = file
  editSelectedFileName.value = file?.name ?? ''
}

function resetCreateForm() {
  createForm.version = ''
  createForm.note = ''
  createNoteEditor.value?.setContent('<p></p>', false)
  selectedVersionFile.value = null
  selectedVersionFileName.value = ''
  if (versionFileInput.value) {
    versionFileInput.value.value = ''
  }
}

function openCreateVersionDialog() {
  resetCreateForm()
  createVersionDialogVisible.value = true
}

function onEditVersionChange(value: string) {
  const found = versionRows.value.find((v) => v.version === value)
  if (!found) return
  editVersionForm.note = found.note || ''
  editNoteEditor.value?.setContent(found.note || '<p></p>', false)
}

async function submitVersion() {
  if (!auth.token || !resource.value) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!createForm.version.trim()) {
    showToast('请填写版本号', 'warning')
    return
  }

  if (!selectedVersionFile.value) {
    showToast('请选择资源文件', 'warning')
    return
  }

  publishing.value = true
  try {
    await createMcResourceVersion(auth.token, resource.value.id, {
      version: createForm.version.trim(),
      file: selectedVersionFile.value,
      note: sanitizeRichHtml(createForm.note.trim()) || null,
    })
    resetCreateForm()
    createVersionDialogVisible.value = false
    await loadPage()
    showToast('新版本已发布', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布新版本失败'
    showToast(message, 'error')
  } finally {
    publishing.value = false
  }
}

function versionDownloadUrl(version: McResourceVersionPayload): string {
  return apiUrl(version.resource)
}

function versionFileName(version: McResourceVersionPayload): string {
  const segments = version.resource.split('/')
  const sourceName = segments[segments.length - 1] || `${version.version}.bin`
  return with73Extension(sourceName)
}

function handleVersionAction(command: string, version: McResourceVersionPayload) {
  if (command === 'download') {
    downloadVersion(version)
  } else if (command === 'edit') {
    openEditVersionDialog(version)
  } else if (command === 'delete') {
    openDeleteVersionDialog(version)
  }
}

function downloadVersion(version: McResourceVersionPayload) {
  const link = document.createElement('a')
  link.href = versionDownloadUrl(version)
  link.download = versionFileName(version)
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openEditVersionDialog(version: McResourceVersionPayload) {
  editingVersion.value = version
  editVersionForm.version = version.version
  editVersionForm.note = version.note || ''
  editSelectedFile.value = null
  editSelectedFileName.value = ''
  if (editVersionFileInput.value) {
    editVersionFileInput.value.value = ''
  }
  editVersionDialogVisible.value = true
  nextTick(() => {
    editNoteEditor.value?.setContent(editVersionForm.note || '<p></p>', false)
  })
}

async function submitVersionEdit() {
  if (!auth.token || !resource.value || !editingVersion.value) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!editVersionForm.version.trim()) {
    showToast('请填写版本号', 'warning')
    return
  }

  savingVersionId.value = editingVersion.value.id
  try {
    const updated = await updateMcResourceVersion(auth.token, resource.value.id, editingVersion.value.id, {
      version: editVersionForm.version.trim(),
      note: sanitizeRichHtml(editVersionForm.note.trim()) || null,
      file: editSelectedFile.value ?? undefined,
    })

    versionRows.value = versionRows.value.map((item) => (item.id === updated.id ? updated : item))
    editingVersion.value = null
    editVersionDialogVisible.value = false
    await loadPage()
    showToast('版本信息已更新', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新版本失败'
    showToast(message, 'error')
  } finally {
    savingVersionId.value = null
  }
}

function openDeleteVersionDialog(version: McResourceVersionPayload) {
  if (!auth.token || !resource.value) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (version.delete_request_status === 'pending') {
    showToast('该版本删除审核已提交，等待用户处理', 'warning')
    return
  }

  deleteVersionTarget.value = version
  deleteVersionDialogVisible.value = true
}

function closeDeleteVersionDialog() {
  if (deletingVersionId.value != null) {
    return
  }

  deleteVersionDialogVisible.value = false
  deleteVersionTarget.value = null
}

async function removeVersion() {
  if (!auth.token || !resource.value || !deleteVersionTarget.value) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  const version = deleteVersionTarget.value

  deletingVersionId.value = version.id
  try {
    await deleteMcResourceVersion(auth.token, resource.value.id, version.id)
    await loadPage()
    if (resource.value.requirement_id) {
      showToast('版本删除申请已提交，等待用户审核', 'success')
    } else {
      versionRows.value = versionRows.value.filter((item) => item.id !== version.id)
      if (editingVersion.value?.id === version.id) {
        editingVersion.value = null
        editVersionDialogVisible.value = false
      }
      showToast('版本已删除', 'success')
    }
    deleteVersionDialogVisible.value = false
    deleteVersionTarget.value = null
  } catch (error) {
    const message = error instanceof Error ? error.message : resource.value.requirement_id ? '提交版本删除审核失败' : '删除版本失败'
    showToast(message, 'error')
  } finally {
    deletingVersionId.value = null
  }
}

</script>

<template>
  <div class="dev-page dev-page--resource-versions">
    <section class="dev-resource-versions__layout" v-loading="loading">
      <el-card shadow="never" class="dev-surface-card">
          <div class="dev-upload-section__head dev-resource-versions__list-head">
            <section>
              <h3 class="dev-section-title">版本列表</h3>
              <p class="dev-section-desc">查看历史版本，支持下载、编辑版本说明和删除版本。</p>
            </section>
            <el-button type="primary" :icon="Plus" @click="openCreateVersionDialog">发布版本</el-button>
          </div>

        <el-table :data="versionRows" stripe v-loading="versionsLoading" empty-text="当前还没有版本记录">
          <el-table-column prop="version" label="版本号" min-width="140" />
          <el-table-column label="资源文件" min-width="220" show-overflow-tooltip>
            <template #default="scope">
              <a :href="versionDownloadUrl(scope.row)" target="_blank" rel="noopener noreferrer"
                class="dev-version-link">
                {{ versionFileName(scope.row) }}
              </a>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180" show-overflow-tooltip>
            <template #default="scope">
              <span class="dev-version-note" v-html="scope.row.note ? sanitizeRichHtml(scope.row.note) : '无'"></span>
            </template>
          </el-table-column>
          <el-table-column label="发布时间" min-width="180">
            <template #default="scope">
              {{ formatCreatedAt(scope.row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="scope">
              <el-dropdown trigger="click" @command="(cmd: string) => handleVersionAction(cmd, scope.row)">
                <el-button link type="primary">
                  更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="download">下载</el-dropdown-item>
                    <el-dropdown-item command="edit">编辑</el-dropdown-item>
                    <el-dropdown-item command="delete" :disabled="scope.row.delete_request_status === 'pending'">
                      {{ scope.row.delete_request_status === 'pending' ? '删除审核中' : '删除' }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </section>

    <el-dialog v-model="createVersionDialogVisible" title="发布版本" width="720px" align-center
      :close-on-click-modal="!publishing">
      <el-form label-position="top" class="dev-version-form">
        <el-form-item label="版本号" required>
          <el-input v-model="createForm.version" maxlength="80" placeholder="例如：1.20.1-2.0.0" />
        </el-form-item>
        <el-form-item label="资源文件" required>
          <div class="dev-version-file-picker">
            <input ref="versionFileInput" type="file" class="dev-version-file-picker__input"
              @change="handleVersionFileChange" />
            <el-button @click="triggerVersionFileSelect">选择文件</el-button>
            <span class="dev-version-file-picker__name">{{ selectedVersionFileName || '未选择文件' }}</span>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <RichTextEditor ref="createNoteEditor" :model-value="createForm.note" min-height="clamp(120px, 18vh, 160px)"
            max-height="clamp(200px, 30vh, 280px)" @update:model-value="createForm.note = $event" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetCreateForm">清空</el-button>
        <el-button type="primary" :loading="publishing" @click="submitVersion">发布版本</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVersionDialogVisible" width="720px" align-center
      :title="editingVersion ? `编辑版本 · ${editingVersion.version}` : '编辑版本'">
      <el-form label-position="top" class="dev-version-form">
        <el-form-item label="版本号" required>
          <el-select v-model="editVersionForm.version" filterable allow-create default-first-option
            placeholder="输入或选择历史版本号" style="width: 100%" @change="onEditVersionChange">
            <el-option v-for="v in versionRows" :key="v.id" :label="v.version" :value="v.version" />
          </el-select>
        </el-form-item>
        <el-form-item label="资源文件">
          <div class="dev-version-file-picker">
            <input ref="editVersionFileInput" type="file" class="dev-version-file-picker__input"
              @change="handleEditVersionFileChange" />
            <el-button @click="triggerEditVersionFileSelect">更换文件</el-button>
            <span class="dev-version-file-picker__name">
              {{ editSelectedFileName || (editingVersion ? versionFileName(editingVersion) : '未选择文件') }}
            </span>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <RichTextEditor ref="editNoteEditor" :model-value="editVersionForm.note" min-height="clamp(120px, 18vh, 160px)"
            max-height="clamp(200px, 30vh, 280px)" @update:model-value="editVersionForm.note = $event" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editVersionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingVersionId === editingVersion?.id"
          @click="submitVersionEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="deleteVersionDialogVisible" width="520px" :close-on-click-modal="false"
      :title="deleteVersionTarget ? `删除版本 · ${deleteVersionTarget.version}` : '删除版本'" @close="closeDeleteVersionDialog">
      <div class="dev-version-delete-dialog">
        <p>
          {{ resource?.requirement_id ? '提交后需要需求发起人在用户端审核，同意后该版本才会真正删除。' : '删除后该版本文件将被永久移除，且无法恢复。' }}
        </p>
        <p v-if="deleteVersionTarget"><strong>版本号：</strong>{{ deleteVersionTarget.version }}</p>
        <p v-if="deleteVersionTarget"><strong>资源文件：</strong>{{ versionFileName(deleteVersionTarget) }}</p>
      </div>

      <template #footer>
        <el-button :disabled="deletingVersionId != null" @click="closeDeleteVersionDialog">取消</el-button>
        <el-button type="danger" :loading="deletingVersionId === deleteVersionTarget?.id" @click="removeVersion">
          {{ resource?.requirement_id ? '确认提交删除审核' : '确认删除版本' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dev-resource-versions__layout {
  display: grid;
  gap: 20px;
}

.dev-resource-versions__list-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.dev-resource-versions__create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.dev-version-file-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.dev-version-file-picker__input {
  display: none;
}

.dev-version-file-picker__name {
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.dev-version-link {
  color: var(--el-color-primary);
  text-decoration: none;
}

.dev-version-link:hover {
  text-decoration: underline;
}

.dev-version-note {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
  color: var(--text-main);
}

.dev-version-note p {
  margin: 0;
}

.dev-version-note p + p {
  margin-top: 4px;
}

.dev-page--resource-versions :deep(.el-dialog__footer) {
  margin-top: 0;
  padding: 16px 0 0;
  border-top: none;
  background: none;
  text-align: right;
}

</style>
