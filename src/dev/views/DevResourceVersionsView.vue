<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl } from '@dev/api/http'
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

const createForm = reactive({
  version: '',
  note: '',
})

const editVersionForm = reactive({
  version: '',
  note: '',
})

const deleteVersionTarget = ref<McResourceVersionPayload | null>(null)

const pageTitle = computed(() => (resource.value ? `版本管理 · ${resource.value.title}` : '版本管理'))
const statusText = computed(() => {
  if (resource.value?.visibility === 'published') return '公开'
  if (resource.value?.visibility === 'review') return '审核中'
  return '私有'
})
const statusType = computed(() => {
  if (resource.value?.visibility === 'published') return 'success'
  if (resource.value?.visibility === 'review') return 'warning'
  return 'info'
})

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

function resetCreateForm() {
  createForm.version = ''
  createForm.note = ''
  selectedVersionFile.value = null
  selectedVersionFileName.value = ''
  if (versionFileInput.value) {
    versionFileInput.value.value = ''
  }
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
      note: createForm.note.trim() || null,
    })
    resetCreateForm()
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
  return segments[segments.length - 1] || `${version.version}.bin`
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
  editVersionDialogVisible.value = true
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
      note: editVersionForm.note.trim() || null,
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

function goBack() {
  router.push({ name: 'dev-resource-list' })
}
</script>

<template>
  <div class="dev-page dev-page--resource-versions">
    <section class="dev-panel-banner dev-panel-banner--light">
      <div>
        <div class="dev-panel-banner__eyebrow">Version Manager</div>
        <h2 class="dev-panel-banner__title">{{ pageTitle }}</h2>
        <p class="dev-panel-banner__desc">在单独页面中管理当前资源的版本发布、编辑和删除，避免列表页弹窗层级过深。</p>
      </div>
      <div class="dev-panel-banner__meta">
        <el-button text @click="goBack">返回资源列表</el-button>
        <el-button text :loading="loading || versionsLoading" @click="loadPage">刷新页面</el-button>
      </div>
    </section>

    <section class="dev-resource-versions__layout" v-loading="loading">
      <el-card shadow="never" class="dev-surface-card">
        <div class="dev-resource-versions__resource-head">
          <div>
            <div class="dev-resource-versions__resource-title">{{ resource?.title || '资源版本管理' }}</div>
            <div class="dev-resource-versions__resource-meta">
              <span>{{ resource?.author || '未知作者' }}</span>
              <span>{{ resource?.platform || '未知平台' }}</span>
            </div>
          </div>
          <el-tag :type="statusType" effect="plain">{{ statusText }}</el-tag>
        </div>

        <p class="dev-resource-versions__resource-desc">{{ resource?.description || '暂无资源简介。' }}</p>
      </el-card>

      <el-card shadow="never" class="dev-surface-card">
        <div class="dev-upload-section__head">
          <section>
            <h3 class="dev-section-title">发布版本</h3>
            <p class="dev-section-desc">上传新的资源文件并填写版本说明。提交后资源会进入重新审核流程。</p>
          </section>
        </div>

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
            <el-input v-model="createForm.note" type="textarea" :rows="4" maxlength="1000" show-word-limit
              placeholder="记录本次新版本说明、兼容性变化或补充信息" />
          </el-form-item>
          <div class="dev-resource-versions__create-actions">
            <el-button @click="resetCreateForm">清空</el-button>
            <el-button type="primary" :loading="publishing" @click="submitVersion">发布版本</el-button>
          </div>
        </el-form>
      </el-card>

      <el-card shadow="never" class="dev-surface-card">
        <div class="dev-upload-section__head">
          <section>
            <h3 class="dev-section-title">版本列表</h3>
            <p class="dev-section-desc">查看历史版本，支持下载、编辑版本说明和删除版本。</p>
          </section>
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
              {{ scope.row.note || '无' }}
            </template>
          </el-table-column>
          <el-table-column label="发布时间" min-width="180">
            <template #default="scope">
              {{ formatCreatedAt(scope.row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="260" align="right">
            <template #default="scope">
              <div class="dev-version-actions">
                <el-button link type="success" @click="downloadVersion(scope.row)">下载</el-button>
                <el-button link type="primary" @click="openEditVersionDialog(scope.row)">编辑</el-button>
                <el-button link type="danger" :loading="deletingVersionId === scope.row.id"
                  @click="openDeleteVersionDialog(scope.row)">
                  {{ scope.row.delete_request_status === 'pending' ? '删除审核中' : '删除' }}
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </section>

    <el-dialog v-model="editVersionDialogVisible" width="520px"
      :title="editingVersion ? `编辑版本 · ${editingVersion.version}` : '编辑版本'">
      <el-form label-position="top" class="dev-version-form">
        <el-form-item label="版本号" required>
          <el-input v-model="editVersionForm.version" maxlength="80" placeholder="例如：1.20.1-2.0.1" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editVersionForm.note" type="textarea" :rows="4" maxlength="1000" show-word-limit
            placeholder="更新该版本的说明信息" />
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

.dev-resource-versions__resource-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.dev-resource-versions__resource-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.dev-resource-versions__resource-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  color: var(--el-text-color-secondary);
}

.dev-resource-versions__resource-desc {
  margin: 16px 0 0;
  color: var(--el-text-color-regular);
  line-height: 1.7;
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

.dev-version-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 900px) {
  .dev-resource-versions__resource-head {
    flex-direction: column;
  }
}
</style>
