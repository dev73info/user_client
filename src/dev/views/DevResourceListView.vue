<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { apiUrl } from '@dev/api/http'
import {
  createMcResourceVersion,
  deleteMcResource,
  listMcResources,
  updateMcResourceHomepage,
  type McResourcePayload,
} from '@dev/api/mcResources'
import { useToast } from '@dev/composables/useToast'
import { useAuthStore } from '@dev/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const { showToast } = useToast()

const isLoading = ref(false)
const publishingResourceId = ref<number | null>(null)
const requestingReviewResourceId = ref<number | null>(null)
const settingPrivateResourceId = ref<number | null>(null)
const publishDialogVisible = ref(false)
const deletingResourceId = ref<number | null>(null)
const versionFileInput = ref<HTMLInputElement | null>(null)
const selectedVersionFile = ref<File | null>(null)
const selectedVersionFileName = ref('')
const resources = ref<McResourcePayload[]>([])
const selectedResource = ref<McResourcePayload | null>(null)

const versionForm = reactive({
  version: '',
  note: '',
})

const emptyText = computed(() => {
  if (isLoading.value) {
    return '资源列表加载中'
  }

  return '当前还没有资源记录'
})

onMounted(async () => {
  auth.hydrate()
  await loadResources()
})

async function loadResources() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  isLoading.value = true
  try {
    resources.value = await listMcResources(auth.token)
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载资源列表失败'
    showToast(message, 'error')
  } finally {
    isLoading.value = false
  }
}

function platformText(value: string): string {
  return value || '未知平台'
}

function visibilityText(value: McResourcePayload['visibility']): string {
  if (value === 'published') {
    return '公开'
  }

  if (value === 'review') {
    return '审核中'
  }

  return '私有'
}

function visibilityTagType(value: McResourcePayload['visibility']): 'success' | 'warning' | 'info' {
  if (value === 'published') {
    return 'success'
  }

  if (value === 'review') {
    return 'warning'
  }

  return 'info'
}

function tagSummary(resource: McResourcePayload): string {
  return resource.tag_selections.flatMap((group) => group.tag_names).join(' / ')
}

function resourceHomepageUrl(resource: McResourcePayload): string {
  const configuredBase = (import.meta.env.VITE_USER_CLIENT_BASE_URL as string | undefined)?.trim().replace(/\/$/, '')
  const baseUrl = configuredBase || 'http://127.0.0.1:5175'
  return `${baseUrl}/resources/${resource.id}`
}

function resourceCoverUrl(resource: McResourcePayload): string {
  return apiUrl(resource.cover_url || '')
}

function openResourceHomepage(resource: McResourcePayload) {
  window.open(resourceHomepageUrl(resource), '_blank', 'noopener,noreferrer')
}

function openPublishVersionDialog(resource: McResourcePayload) {
  selectedResource.value = resource
  versionForm.version = ''
  versionForm.note = ''
  selectedVersionFile.value = null
  selectedVersionFileName.value = ''
  if (versionFileInput.value) {
    versionFileInput.value.value = ''
  }
  publishDialogVisible.value = true
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

function openEditHomepagePage(resource: McResourcePayload) {
  router.push({ name: 'dev-resource-homepage-edit', params: { resourceId: resource.id } })
}

function openVersionsPage(resource: McResourcePayload) {
  router.push({ name: 'dev-resource-versions', params: { resourceId: resource.id } })
}

function canDeleteResource(resource: McResourcePayload) {
  return !resource.requirement_id
}

async function removeResource(resource: McResourcePayload) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!canDeleteResource(resource)) {
    showToast('已关联需求的资源不能删除', 'warning')
    return
  }

  const confirmed = window.confirm(`确认删除资源 ${resource.title} 吗？该操作会同时删除其历史版本，且不可撤销。`)
  if (!confirmed) {
    return
  }

  deletingResourceId.value = resource.id
  try {
    await deleteMcResource(auth.token, resource.id)
    resources.value = resources.value.filter((item) => item.id !== resource.id)
    showToast('资源已删除', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除资源失败'
    showToast(message, 'error')
  } finally {
    deletingResourceId.value = null
  }
}

function handleResourceAction(command: 'publish' | 'edit' | 'versions' | 'delete', resource: McResourcePayload) {
  if (command === 'publish') {
    openPublishVersionDialog(resource)
    return
  }

  if (command === 'versions') {
    openVersionsPage(resource)
    return
  }

  if (command === 'delete') {
    void removeResource(resource)
    return
  }

  openEditHomepagePage(resource)
}

function handleResourceCommand(payload: { action: string; resource: McResourcePayload }) {
  if (payload.action === 'request-review') {
    void requestPublicReview(payload.resource)
    return
  }

  if (payload.action === 'set-private') {
    void setResourcePrivate(payload.resource)
    return
  }

  if (payload.action !== 'publish' && payload.action !== 'edit' && payload.action !== 'versions' && payload.action !== 'delete') {
    return
  }

  handleResourceAction(payload.action, payload.resource)
}

async function submitVersion() {
  if (!auth.token || !selectedResource.value) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (!versionForm.version.trim()) {
    showToast('请填写版本号', 'warning')
    return
  }

  if (!selectedVersionFile.value) {
    showToast('请选择资源文件', 'warning')
    return
  }

  publishingResourceId.value = selectedResource.value.id
  try {
    await createMcResourceVersion(auth.token, selectedResource.value.id, {
      version: versionForm.version.trim(),
      file: selectedVersionFile.value,
      note: versionForm.note.trim() || null,
    })
    publishDialogVisible.value = false
    selectedVersionFile.value = null
    selectedVersionFileName.value = ''
    showToast('新版本已发布', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布新版本失败'
    showToast(message, 'error')
  } finally {
    publishingResourceId.value = null
  }
}

async function requestPublicReview(resource: McResourcePayload) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (resource.requirement_id) {
    showToast('已关联需求的资源不能申请公开审核', 'warning')
    return
  }

  requestingReviewResourceId.value = resource.id
  try {
    await updateMcResourceHomepage(auth.token, resource.id, {
      title: resource.title,
      author: resource.author,
      description: resource.description,
      cover_url: resource.cover_url,
      docs_url: resource.docs_url,
      visibility: 'review',
      release_note: resource.release_note,
    })
    showToast('公开申请已提交，等待管理员审核', 'success')
    await loadResources()
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交公开审核失败'
    showToast(message, 'error')
  } finally {
    requestingReviewResourceId.value = null
  }
}

async function setResourcePrivate(resource: McResourcePayload) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  settingPrivateResourceId.value = resource.id
  try {
    await updateMcResourceHomepage(auth.token, resource.id, {
      title: resource.title,
      author: resource.author,
      description: resource.description,
      cover_url: resource.cover_url,
      docs_url: resource.docs_url,
      visibility: 'draft',
      release_note: resource.release_note,
    })
    showToast('资源已设为私有', 'success')
    await loadResources()
  } catch (error) {
    const message = error instanceof Error ? error.message : '设为私有失败'
    showToast(message, 'error')
  } finally {
    settingPrivateResourceId.value = null
  }
}

</script>

<template>
  <div class="dev-page dev-page--resource-list">
    <section class="dev-panel-banner dev-panel-banner--light">
      <div>
        <div class="dev-panel-banner__eyebrow">Resource List</div>
        <h2 class="dev-panel-banner__title">集中查看当前开发者已提交的资源</h2>
        <p class="dev-panel-banner__desc">资源初始化后默认保持私有，可直接关联需求；如需公开展示，请先在这里提交公开审核。</p>
      </div>
      <div class="dev-panel-banner__meta">
        <el-button text :loading="isLoading" @click="loadResources">刷新列表</el-button>
      </div>
    </section>

    <el-card shadow="never" class="dev-surface-card">
      <div class="dev-upload-section__head">
        <section>
          <h3 class="dev-section-title">资源列表</h3>
          <p class="dev-section-desc">集中查看当前开发者已提交的 免费资源资源。</p>
        </section>
      </div>

      <el-table :data="resources" stripe v-loading="isLoading" class="dev-resource-table" :empty-text="emptyText">
        <el-table-column label="资源" min-width="260">
          <template #default="scope">
            <div class="dev-resource-table__title-cell">
              <img v-if="scope.row.cover_url" :src="resourceCoverUrl(scope.row)" alt="资源图标" class="dev-resource-table__icon" />
              <div>
                <button class="dev-resource-table__title-link" type="button" @click="openResourceHomepage(scope.row)">{{ scope.row.title }}</button>
                <div class="dev-resource-table__meta">{{ platformText(scope.row.platform) }} / {{ scope.row.author }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="260">
          <template #default="scope">
            <span class="dev-resource-table__tags">{{ tagSummary(scope.row) || '未附带标签' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="scope">
            <el-tag :type="visibilityTagType(scope.row.visibility)" effect="plain">
              {{ visibilityText(scope.row.visibility) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="180" />
        <el-table-column label="操作" width="180" align="right" fixed="right">
          <template #default="scope">
            <el-dropdown trigger="click" @command="handleResourceCommand">
              <el-button type="primary" plain class="dev-resource-table__action-button">
                更多
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="{ action: 'publish', resource: scope.row }">发布版本</el-dropdown-item>
                  <el-dropdown-item
                    v-if="scope.row.visibility === 'draft'"
                    :disabled="Boolean(scope.row.requirement_id) || requestingReviewResourceId === scope.row.id"
                    :command="{ action: 'request-review', resource: scope.row }"
                  >
                    {{ requestingReviewResourceId === scope.row.id ? '提交中...' : '申请公开' }}
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="scope.row.visibility === 'published'"
                    :disabled="settingPrivateResourceId === scope.row.id"
                    :command="{ action: 'set-private', resource: scope.row }"
                  >
                    {{ settingPrivateResourceId === scope.row.id ? '设置中...' : '设为私有' }}
                  </el-dropdown-item>
                  <el-dropdown-item :command="{ action: 'versions', resource: scope.row }">版本管理</el-dropdown-item>
                  <el-dropdown-item :command="{ action: 'edit', resource: scope.row }">编辑主页</el-dropdown-item>
                  <el-dropdown-item
                    :command="{ action: 'delete', resource: scope.row }"
                    :disabled="!canDeleteResource(scope.row) || deletingResourceId === scope.row.id"
                  >
                    {{ deletingResourceId === scope.row.id ? '删除中...' : '删除' }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="publishDialogVisible" width="520px" :title="selectedResource ? `发布版本 · ${selectedResource.title}` : '发布版本'">
      <el-form label-position="top" class="dev-version-form">
        <el-form-item label="版本号" required>
          <el-input v-model="versionForm.version" maxlength="80" placeholder="例如：1.20.1-2.0.0" />
        </el-form-item>
        <el-form-item label="资源文件" required>
          <div class="dev-version-file-picker">
            <input ref="versionFileInput" type="file" class="dev-version-file-picker__input" @change="handleVersionFileChange" />
            <el-button @click="triggerVersionFileSelect">选择文件</el-button>
            <span class="dev-version-file-picker__name">{{ selectedVersionFileName || '未选择文件' }}</span>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="versionForm.note" type="textarea" :rows="4" maxlength="1000" show-word-limit
            placeholder="记录本次新版本说明、兼容性变化或补充信息" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="publishDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="publishingResourceId === selectedResource?.id" @click="submitVersion">
          发布版本
        </el-button>
      </template>
    </el-dialog>

  </div>
</template>

<style scoped>
.dev-resource-table__title-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--el-color-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

.dev-resource-table__title-link:hover {
  color: var(--el-color-primary-light-3);
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

</style>
