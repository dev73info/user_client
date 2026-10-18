<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
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
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { buildUnifiedAuthUrl } from '@/config/runtime'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'
import {
  isResourceArchiveLocked,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'
import {
  TAlert,
  TButton,
  TCard,
  TDialog,
  TDropdown,
  TDropdownItem,
  TDropdownMenu,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TLoading,
  TMessage,
  TOption,
  TPagination,
  TSelect,
  TTable,
  TTableColumn,
  type SelectModelValue,
  ArrowDown,
  Plus,
  Refresh,
  RefreshLeft,
  Search,
} from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

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

/* R014：所属需求进入到期锁定 / 已清除后，本页只读——只能下载历史版本，不能发版 / 编辑 / 删除
   （后端版本接口仍以 409 + 中文提示兜底）。 */
const archiveLocked = computed(() =>
  resource.value ? isResourceArchiveLocked(resource.value) : false,
)

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
    TMessage.warning('资源编号无效')
    router.replace({ name: 'dev-resource-list' })
    return
  }

  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
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
    TMessage.error(message)
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
    TMessage.error(message)
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
  if (resource.value && isResourceArchiveLocked(resource.value)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  resetCreateForm()
  createVersionDialogVisible.value = true
}

/* `TSelect` 的 `change` 是宽联合，这里只需单值，收紧一次再用。 */
function onEditVersionChange(value: SelectModelValue) {
  const version = String(value)
  const found = versionRows.value.find((v) => v.version === version)
  if (!found) return
  editVersionForm.note = found.note || ''
  editNoteEditor.value?.setContent(found.note || '<p></p>', false)
}

async function submitVersion() {
  if (!auth.token || !resource.value) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (isResourceArchiveLocked(resource.value)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  if (!createForm.version.trim()) {
    TMessage.warning('请填写版本号')
    return
  }

  if (!selectedVersionFile.value) {
    TMessage.warning('请选择资源文件')
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
    TMessage.success('新版本已发布')
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布新版本失败'
    TMessage.error(message)
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
  if (resource.value && isResourceArchiveLocked(resource.value)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

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
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (isResourceArchiveLocked(resource.value)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  if (!editVersionForm.version.trim()) {
    TMessage.warning('请填写版本号')
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
    TMessage.success('版本信息已更新')
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新版本失败'
    TMessage.error(message)
  } finally {
    savingVersionId.value = null
  }
}

function openDeleteVersionDialog(version: McResourceVersionPayload) {
  if (!auth.token || !resource.value) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (isResourceArchiveLocked(resource.value)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  if (version.delete_request_status === 'pending') {
    TMessage.warning('该版本删除审核已提交，等待用户处理')
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
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (isResourceArchiveLocked(resource.value)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  const version = deleteVersionTarget.value

  deletingVersionId.value = version.id
  try {
    await deleteMcResourceVersion(auth.token, resource.value.id, version.id)
    await loadPage()
    if (resource.value.requirement_id) {
      TMessage.success('版本删除申请已提交，等待用户审核')
    } else {
      versionRows.value = versionRows.value.filter((item) => item.id !== version.id)
      if (editingVersion.value?.id === version.id) {
        editingVersion.value = null
        editVersionDialogVisible.value = false
      }
      TMessage.success('版本已删除')
    }
    deleteVersionDialogVisible.value = false
    deleteVersionTarget.value = null
  } catch (error) {
    const message = error instanceof Error ? error.message : resource.value.requirement_id ? '提交版本删除审核失败' : '删除版本失败'
    TMessage.error(message)
  } finally {
    deletingVersionId.value = null
  }
}
</script>

<template>
  <div class="dev-page dev-page--resource-versions">
    <WorkbenchBarSlot>
      <TLoading tag="div" class="dev-meta-strip" :loading="loading">
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
          <TButton icon-only :loading="versionsLoading" aria-label="刷新版本列表" @click="reloadVersions">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </TLoading>
    </WorkbenchBarSlot>

    <TAlert
      v-if="archiveLocked"
      tone="warning"
      variant="soft"
      class="dev-archive-locked-notice"
      data-testid="resource-archive-locked-notice"
      :title="RESOURCE_ARCHIVE_LOCKED_TITLE"
      :description="RESOURCE_ARCHIVE_LOCKED_MESSAGE"
    />

    <TLoading tag="section" class="dev-resource-versions__layout" :loading="loading">
      <TCard class="dev-surface-card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">版本列表</h3>
          </div>
          <div class="dev-card-head__actions">
            <TButton variant="solid" tone="accent" :disabled="archiveLocked" @click="openCreateVersionDialog"
              ><template #prefix
                ><TIcon><Plus /></TIcon></template
              >发布版本</TButton
            >
          </div>
        </div>

        <div class="dev-toolbar">
          <TInput
            v-model="filters.keyword"
            clearable
            placeholder="搜索版本号、备注或文件名"
            class="dev-toolbar__search"
          >
            <template #prefix>
              <TIcon>
                <Search />
              </TIcon>
            </template>
          </TInput>

          <div class="dev-toolbar__actions">
            <span v-if="hasActiveFilters" class="dev-toolbar__hint">
              筛选出 {{ filteredVersions.length }} / {{ versionRows.length }} 条
            </span>
            <TButton variant="outline" @click="resetFilters">
              <TIcon>
                <RefreshLeft />
              </TIcon>
              <span>重置</span>
            </TButton>
          </div>
        </div>

        <TTable :loading="versionsLoading" :data="pagedVersions" stripe class="dev-table">
          <template #empty>
            <p class="dev-empty-state">
              {{ hasActiveFilters ? '没有匹配的版本' : '当前还没有版本记录' }}
            </p>
          </template>
          <TTableColumn prop="version" label="版本号" min-width="140" />
          <TTableColumn label="资源文件" min-width="220" show-overflow-tooltip>
            <template #default="scope">
              <a
                :href="versionDownloadUrl(scope.row)"
                target="_blank"
                rel="noopener noreferrer"
                class="dev-version-link"
              >
                {{ versionFileName(scope.row) }}
              </a>
            </template>
          </TTableColumn>
          <TTableColumn label="备注" min-width="180" show-overflow-tooltip>
            <template #default="scope">
              <span
                class="dev-version-note"
                v-html="scope.row.note ? sanitizeRichHtml(scope.row.note) : '无'"
              ></span>
            </template>
          </TTableColumn>
          <TTableColumn label="发布时间" min-width="180">
            <template #default="scope">
              {{ formatCreatedAt(scope.row.created_at) }}
            </template>
          </TTableColumn>
          <TTableColumn label="操作" width="120">
            <template #default="scope">
              <TDropdown
                trigger="click"
                @command="(cmd) => handleVersionAction(String(cmd), scope.row)"
              >
                <TButton variant="outline" tone="accent">
                  <span>更多</span>
                  <TIcon class="dev-action-caret">
                    <ArrowDown />
                  </TIcon>
                </TButton>
                <template #dropdown>
                  <TDropdownMenu>
                    <TDropdownItem command="download">下载</TDropdownItem>
                    <TDropdownItem command="edit" :disabled="archiveLocked">编辑</TDropdownItem>
                    <TDropdownItem
                      command="delete"
                      :disabled="archiveLocked || scope.row.delete_request_status === 'pending'"
                    >
                      {{ scope.row.delete_request_status === 'pending' ? '删除审核中' : '删除' }}
                    </TDropdownItem>
                  </TDropdownMenu>
                </template>
              </TDropdown>
            </template>
          </TTableColumn>
        </TTable>

        <div class="dev-pager">
          <div class="dev-pager__count">
            <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
              <TOption
                v-for="size in LIST_PAGE_SIZES"
                :key="size"
                :label="`${size} 条/页`"
                :value="size"
              />
            </TSelect>
          </div>
          <TPagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="filteredTotal"
            :pager-count="5"
            background
            aria-label="版本列表分页"
          />
        </div>
      </TCard>
    </TLoading>

    <TDialog
      v-model:open="createVersionDialogVisible"
      title="发布版本"
      width="720px"
      class="dev-dialog"
      :mask-closable="!publishing"
    >
      <TForm label-position="top" class="dev-version-form">
        <TFormItem label="版本号" required>
          <TInput v-model="createForm.version" :maxlength="80" placeholder="例如：1.20.1-2.0.0" />
        </TFormItem>
        <TFormItem label="资源文件" required>
          <div class="dev-version-file-picker">
            <input
              ref="versionFileInput"
              type="file"
              class="dev-version-file-picker__input"
              @change="handleVersionFileChange"
            />
            <TButton @click="triggerVersionFileSelect">选择文件</TButton>
            <span class="dev-version-file-picker__name">{{
              selectedVersionFileName || '未选择文件'
            }}</span>
          </div>
        </TFormItem>
        <TFormItem label="备注">
          <RichTextEditor
            ref="createNoteEditor"
            :model-value="createForm.note"
            min-height="clamp(120px, 18vh, 160px)"
            max-height="clamp(200px, 30vh, 280px)"
            @update:model-value="createForm.note = $event"
          />
        </TFormItem>
      </TForm>
      <template #footer>
        <TButton @click="resetCreateForm">清空</TButton>
        <TButton variant="solid" tone="accent" :loading="publishing" @click="submitVersion"
          >发布版本</TButton
        >
      </template>
    </TDialog>

    <TDialog
      v-model:open="editVersionDialogVisible"
      width="720px"
      class="dev-dialog"
      :title="editingVersion ? `编辑版本 · ${editingVersion.version}` : '编辑版本'"
    >
      <TForm label-position="top" class="dev-version-form">
        <TFormItem label="版本号" required>
          <TSelect
            v-model="editVersionForm.version"
            filterable
            placeholder="输入或选择历史版本号"
            style="width: 100%"
            @change="onEditVersionChange"
          >
            <TOption v-for="v in versionRows" :key="v.id" :label="v.version" :value="v.version" />
          </TSelect>
        </TFormItem>
        <TFormItem label="资源文件">
          <div class="dev-version-file-picker">
            <input
              ref="editVersionFileInput"
              type="file"
              class="dev-version-file-picker__input"
              @change="handleEditVersionFileChange"
            />
            <TButton @click="triggerEditVersionFileSelect">更换文件</TButton>
            <span class="dev-version-file-picker__name">
              {{
                editSelectedFileName ||
                (editingVersion ? versionFileName(editingVersion) : '未选择文件')
              }}
            </span>
          </div>
        </TFormItem>
        <TFormItem label="备注">
          <RichTextEditor
            ref="editNoteEditor"
            :model-value="editVersionForm.note"
            min-height="clamp(120px, 18vh, 160px)"
            max-height="clamp(200px, 30vh, 280px)"
            @update:model-value="editVersionForm.note = $event"
          />
        </TFormItem>
      </TForm>

      <template #footer>
        <TButton @click="editVersionDialogVisible = false">取消</TButton>
        <TButton
          variant="solid"
          tone="accent"
          :loading="savingVersionId === editingVersion?.id"
          @click="submitVersionEdit"
          >保存</TButton
        >
      </template>
    </TDialog>

    <TDialog
      v-model:open="deleteVersionDialogVisible"
      width="520px"
      class="dev-dialog"
      :title="deleteVersionTarget ? `删除版本 · ${deleteVersionTarget.version}` : '删除版本'"
      @close="closeDeleteVersionDialog"
    >
      <div class="dev-version-delete-dialog">
        <p>
          {{
            resource?.requirement_id
              ? '提交后需要需求发起人在用户端审核，同意后该版本才会真正删除。'
              : '删除后该版本文件将被永久移除，且无法恢复。'
          }}
        </p>
        <p v-if="deleteVersionTarget"><strong>版本号：</strong>{{ deleteVersionTarget.version }}</p>
        <p v-if="deleteVersionTarget">
          <strong>资源文件：</strong>{{ versionFileName(deleteVersionTarget) }}
        </p>
      </div>

      <template #footer>
        <TButton :disabled="deletingVersionId != null" @click="closeDeleteVersionDialog"
          >取消</TButton
        >
        <TButton
          variant="solid"
          tone="danger"
          :loading="deletingVersionId === deleteVersionTarget?.id"
          @click="removeVersion"
        >
          {{ resource?.requirement_id ? '确认提交删除审核' : '确认删除版本' }}
        </TButton>
      </template>
    </TDialog>
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

/* R014：锁定资源的说明横幅，放在工作台操作条与版本列表之间（观感取自 TAlert 的 warning 态）。 */
.dev-archive-locked-notice {
  margin: 0 0 16px;
}
</style>
