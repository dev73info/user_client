<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue'
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { apiUrl, HttpError } from '@/api/http'
import { extractResourceFileNameFromUrl, with73Extension } from '@/api/resources'
import {
  createMcResourceVersion,
  deleteMcResourceVersion,
  getMcResource,
  listMcResourceVersions,
  type McResourcePayload,
  type McResourceVersionPayload,
  updateMcResourceVersion,
} from '@/api/mcResources'
import { useToast } from '@/composables/useToast'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { buildUnifiedAuthUrl } from '@/config/runtime'
import { ArrowDown, Plus, Refresh, RefreshLeft, Search } from '@element-plus/icons-vue'
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

/** 关键字搜索：版本号、备注正文或文件名任一命中即可，与资源列表的口径一致。 */
const filters = reactive({
  keyword: '',
})

const deletePendingCount = computed(
  () => versionRows.value.filter((version) => version.delete_request_status === 'pending').length,
)

const filteredVersions = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  if (!keyword) {
    return versionRows.value
  }

  return versionRows.value.filter((version) =>
    [
      version.version,
      // 备注是富文本，先去掉标签再参与匹配，否则搜「p」会把所有版本都命中
      (version.note ?? '').replace(/<[^>]*>/g, ' '),
      versionFileName(version),
    ].some((field) => field.toLowerCase().includes(keyword)),
  )
})

const hasActiveFilters = computed(() => filters.keyword.trim() !== '')

function resetFilters() {
  filters.keyword = ''
}

/* 分页与其余菜单页同构（资源项目、团队资源、我的接单、收益钱包、需求大厅都带表尾分页器）。
   版本一次取回全部、搜索在前端做，所以这里是客户端切片，不走服务端页码。 */
const { page, pageSize, total: filteredTotal, paged: pagedVersions } = useClientPagination(filteredVersions)

/* 搜索一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空表。 */
watch(() => filters.keyword, () => {
  page.value = 1
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
    // 404 同时覆盖「资源不存在」与「私有/待审资源无权查看」，按后端原文弹「not found」对用户没意义
    const message = error instanceof HttpError && error.status === 404
      ? '资源不存在或无权访问'
      : error instanceof Error ? error.message : '加载版本管理失败'
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
  const fallbackFileName = `resource-${resource.value?.id ?? 'resource'}-v${version.id}`
  const sourceName = extractResourceFileNameFromUrl(version.resource, fallbackFileName)
  return with73Extension(sourceName, fallbackFileName)
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
    <div class="dev-meta-strip" v-loading="loading">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">版本总数</span>
        <span class="dev-meta-strip__value">{{ versionRows.length }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">关联需求</span>
        <span class="dev-meta-strip__value">{{ resource?.requirement_id || '未关联' }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">删除审核中</span>
        <span class="dev-meta-strip__value">{{ deletePendingCount }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <el-button class="dev-toolbar__icon-btn" aria-label="刷新版本列表" @click="reloadVersions">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </div>
    </div>

    <section class="dev-resource-versions__layout" v-loading="loading">
      <el-card shadow="never" class="dev-surface-card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">版本列表</h3>
          </div>
          <div class="dev-card-head__actions">
            <el-button class="dev-toolbar__primary" type="primary" :icon="Plus"
              @click="openCreateVersionDialog">发布版本</el-button>
          </div>
        </div>

        <div class="dev-toolbar">
          <el-input v-model="filters.keyword" clearable placeholder="搜索版本号、备注或文件名" class="dev-toolbar__search">
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>

          <div class="dev-toolbar__actions">
            <span v-if="hasActiveFilters" class="dev-toolbar__hint">
              筛选出 {{ filteredVersions.length }} / {{ versionRows.length }} 条
            </span>
            <el-button class="dev-toolbar__ghost" @click="resetFilters">
              <el-icon>
                <RefreshLeft />
              </el-icon>
              <span>重置</span>
            </el-button>
          </div>
        </div>

        <el-table :data="pagedVersions" stripe v-loading="versionsLoading" class="dev-table">
          <template #empty>
            <p class="dev-empty-state">{{ hasActiveFilters ? '没有匹配的版本' : '当前还没有版本记录' }}</p>
          </template>
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
                <el-button type="primary" plain class="dev-table__action dev-action--soft">
                  <span>更多</span>
                  <el-icon class="dev-action-caret">
                    <ArrowDown />
                  </el-icon>
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

        <div class="dev-pager">
          <div class="dev-pager__count">
            <span>共 {{ filteredTotal }} 条</span>
            <el-select v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
              <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
            </el-select>
          </div>
          <el-pagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
            :pager-count="5" layout="prev, pager, next" background aria-label="版本列表分页" />
        </div>
      </el-card>
    </section>

    <el-dialog v-model="createVersionDialogVisible" title="发布版本" width="720px" align-center
      class="dev-dialog" :close-on-click-modal="!publishing">
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

    <el-dialog v-model="editVersionDialogVisible" width="720px" align-center class="dev-dialog"
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

    <el-dialog v-model="deleteVersionDialogVisible" width="520px" align-center class="dev-dialog"
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
/* 卡片头走 dev-base.css 的 .dev-card-head，表格走 .dev-table（这两处原来是页内自己写的
   .dev-resource-versions__list-head 与无皮肤的 el-table）。这里只留本页特有样式。 */
.dev-resource-versions__layout {
  display: grid;
  gap: 20px;
}

.dev-version-link {
  color: var(--dev-blue);
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
  color: var(--dev-ink);
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
