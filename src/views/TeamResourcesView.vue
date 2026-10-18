<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
import { apiUrl } from '@/api/http'
import {
  listTeamResources,
  deleteMcResource,
  createMcResourceVersion,
  updateMcResourceHomepage,
  type McResourcePayload,
} from '@/api/mcResources'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { useResourceVersionDraft } from '@/composables/useResourceVersionDraft'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import {
  canDeleteResource,
  isResourceArchiveLocked,
  resourceCoverUrl,
  resourcePlatformLabel,
  resourceTagColumnLabel,
  resourceTagSummary,
  resourceVisibilityLabel,
  resourceVisibilityTagType,
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
  TTag,
  ArrowDown,
  Plus,
  Refresh,
  Search,
} from 'ui_73info'

const auth = useAuthStore()
const router = useRouter()
const isLoading = ref(false)
const deletingResourceId = ref<number | null>(null)
const resources = ref<McResourcePayload[]>([])
const publishingResourceId = ref<number | null>(null)
const settingPrivateResourceId = ref<number | null>(null)
const requestingReviewResourceId = ref<number | null>(null)
const publishDialogVisible = ref(false)
const selectedResource = ref<McResourcePayload | null>(null)

const {
  versionFileInput,
  selectedVersionFile,
  selectedVersionFileName,
  versionForm,
  clearFileSelection,
  reset: resetVersionDraft,
  triggerFileSelect: triggerVersionFileSelect,
  handleFileChange: handleVersionFileChange,
} = useResourceVersionDraft()

const emptyText = computed(() => {
  if (isLoading.value) {
    return '资源列表加载中'
  }
  return hasActiveFilters.value ? '没有符合筛选条件的团队资源' : '当前还没有团队资源记录'
})

// 与「资源项目」页同一套搜索与状态筛选口径：数据源一次取回全部，输入即过滤。
const filters = reactive({
  keyword: '',
  visibility: '',
})

const hasActiveFilters = computed(
  () => Boolean(filters.keyword.trim()) || Boolean(filters.visibility),
)

const filteredResources = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return resources.value.filter((item) => {
    if (filters.visibility && item.visibility !== filters.visibility) {
      return false
    }

    if (!keyword) {
      return true
    }

    return [item.title, item.author, item.description, resourceTagSummary(item)].some((value) =>
      (value ?? '').toLowerCase().includes(keyword),
    )
  })
})

/** 顶部读数条的口径与「资源项目」页一致：同一份数据按 visibility 分档。 */
const publishedCount = computed(
  () => resources.value.filter((item) => item.visibility === 'published').length,
)
const reviewCount = computed(
  () => resources.value.filter((item) => item.visibility === 'review').length,
)
const draftCount = computed(
  () => resources.value.filter((item) => item.visibility === 'draft').length,
)

/** R014：团队资源里已进入超期锁定 / 已清除的数量；> 0 时表格上方给一条锁定说明。 */
const archiveLockedCount = computed(
  () => resources.value.filter((item) => isResourceArchiveLocked(item)).length,
)

/* 分页与其余菜单页同构（需求大厅、收益钱包、资源项目、我的接单都带表尾分页器）。
   本页数据源一次取回全部，所以这里是客户端切片，不走服务端页码。
   筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空表。 */
const { page, pageSize, total: filteredTotal, paged } = useClientPagination(filteredResources)

function resetPage() {
  page.value = 1
}

watch(filters, resetPage)

onMounted(async () => {
  auth.hydrate()
  await loadResources()
})

function goCreate() {
  router.push({
    path: '/workbench/developer/resources/plugins-init',
    query: { ownership: 'team' },
  })
}

async function loadResources() {
  if (!auth.token) {
    resources.value = []
    return
  }

  isLoading.value = true
  try {
    resources.value = await listTeamResources(auth.token)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '加载团队资源失败')
  } finally {
    isLoading.value = false
  }
}

async function removeResource(resource: McResourcePayload) {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (isResourceArchiveLocked(resource)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  if (!canDeleteResource(resource)) {
    TMessage.warning('已关联需求的资源不能删除')
    return
  }

  const confirmed = window.confirm(
    `确认删除资源 ${resource.title} 吗？该操作会同时删除其历史版本，且不可撤销。购买订单会保留作历史记录。`,
  )
  if (!confirmed) {
    return
  }

  deletingResourceId.value = resource.id
  try {
    await deleteMcResource(auth.token, resource.id)
    resources.value = resources.value.filter((item) => item.id !== resource.id)
    TMessage.success('资源已删除')
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除资源失败'
    TMessage.error(message)
  } finally {
    deletingResourceId.value = null
  }
}

function openResourceHomepage(resource: McResourcePayload) {
  const tagSelections = resource.tag_selections ?? []
  const rootName = tagSelections.find((s) => s.group_path.length > 0)?.group_path[0] ?? ''
  const entryName =
    tagSelections.find((s) => s.group_path.length > 1)?.group_path[1] ?? (resource.platform || '')
  const rootAlias =
    tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 0)?.group_path_aliases?.[0] ??
    ''
  const entryAlias =
    tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 1)?.group_path_aliases?.[1] ??
    ''
  const rootSlug = rootAlias || getTagRouteSlug(rootName)
  const entrySlug = entryAlias || getTagRouteSlug(entryName)
  const resourceSlug = getResourceDetailSlug(resource.id, resource.creator || resource.author)

  // 资源没有分类标签时分类段是空字符串，push 带分类的路由会抛 `Missing required param "rootSlug"`。
  if (!rootSlug || !entrySlug) {
    void router.push({ name: 'resource-detail-direct', params: { resourceSlug } })
    return
  }

  void router.push(
    resourceDetailLocation({
      resourceId: resource.id,
      rootSlug,
      entrySlug,
      sale: resourceListingSaleOf(resource.price_fen, resource.price_points),
    }),
  )
}

function openPublishVersionDialog(resource: McResourcePayload) {
  if (isResourceArchiveLocked(resource)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  selectedResource.value = resource
  resetVersionDraft()
  publishDialogVisible.value = true
}

async function submitVersion() {
  if (!auth.token || !selectedResource.value) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (isResourceArchiveLocked(selectedResource.value)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  if (!versionForm.version.trim()) {
    TMessage.warning('请填写版本号')
    return
  }

  if (!selectedVersionFile.value) {
    TMessage.warning('请选择资源文件')
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
    clearFileSelection()
    TMessage.success('新版本已发布')
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布新版本失败'
    TMessage.error(message)
  } finally {
    publishingResourceId.value = null
  }
}

async function setResourcePrivate(resource: McResourcePayload) {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (isResourceArchiveLocked(resource)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
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
    TMessage.success('资源已设为私有')
    await loadResources()
  } catch (error) {
    const message = error instanceof Error ? error.message : '设为私有失败'
    TMessage.error(message)
  } finally {
    settingPrivateResourceId.value = null
  }
}

async function requestPublicReview(resource: McResourcePayload) {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (isResourceArchiveLocked(resource)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  if (resource.requirement_id) {
    TMessage.warning('已关联需求的资源不能申请公开审核')
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
    TMessage.success('公开申请已提交，等待管理员审核')
    await loadResources()
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交公开审核失败'
    TMessage.error(message)
  } finally {
    requestingReviewResourceId.value = null
  }
}

function handleResourceCommand(payload: { action: string; resource: McResourcePayload }) {
  if (payload.action === 'request-review') {
    void requestPublicReview(payload.resource)
    return
  }

  if (payload.action === 'view') {
    openResourceHomepage(payload.resource)
    return
  }

  if (payload.action === 'publish') {
    openPublishVersionDialog(payload.resource)
    return
  }

  if (payload.action === 'set-private') {
    void setResourcePrivate(payload.resource)
    return
  }

  if (payload.action === 'delete') {
    void removeResource(payload.resource)
    return
  }

  if (payload.action === 'versions') {
    router.push({
      name: 'dev-resource-versions',
      params: { resourceId: payload.resource.id },
      query: { from: 'team-resources' },
    })
    return
  }

  if (payload.action === 'edit') {
    router.push({
      name: 'dev-resource-homepage-edit',
      params: { resourceId: payload.resource.id },
      query: { from: 'team-resources' },
    })
    return
  }
}
</script>

<template>
  <div class="dev-page dev-page--resource-list">
    <WorkbenchBarSlot>
      <TLoading tag="div" class="dev-meta-strip" :loading="isLoading">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">团队资源</span>
          <span class="dev-meta-strip__value">{{ resources.length }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">公开</span>
          <span class="dev-meta-strip__value">{{ publishedCount }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">审核中</span>
          <span class="dev-meta-strip__value">{{ reviewCount }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">私有</span>
          <span class="dev-meta-strip__value">{{ draftCount }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton icon-only :loading="isLoading" aria-label="刷新团队资源" @click="loadResources">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </TLoading>
    </WorkbenchBarSlot>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">团队资源项目</h3>
        </div>
        <div class="dev-card-head__actions">
          <button class="dev-btn dev-btn--primary" type="button" @click="goCreate">
            <TIcon>
              <Plus />
            </TIcon>
            <span>新建资源</span>
          </button>
        </div>
      </div>

      <TAlert
        v-if="archiveLockedCount > 0"
        tone="warning"
        variant="soft"
        class="dev-archive-locked-notice"
        data-testid="resource-archive-locked-notice"
        :title="RESOURCE_ARCHIVE_LOCKED_TITLE"
        :description="RESOURCE_ARCHIVE_LOCKED_MESSAGE"
      />

      <div class="dev-toolbar">
        <TSelect
          v-model="filters.visibility"
          clearable
          placeholder="资源状态"
          class="dev-toolbar__field"
          aria-label="按资源状态筛选"
        >
          <TOption label="已公开" value="published" />
          <TOption label="审核中" value="review" />
          <TOption label="私有" value="draft" />
        </TSelect>

        <TInput
          v-model="filters.keyword"
          clearable
          placeholder="搜索资源标题、作者或标签"
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
            筛选出 {{ filteredResources.length }} / {{ resources.length }} 个
          </span>
        </div>
      </div>

      <TTable :loading="isLoading" :data="paged" stripe class="dev-table dev-resource-table">
        <template #empty>
          <p class="dev-empty-state">{{ emptyText }}</p>
        </template>
        <TTableColumn label="资源" min-width="160">
          <template #default="scope">
            <div class="dev-resource-table__title-cell">
              <img
                v-if="scope.row.cover_url"
                :src="resourceCoverUrl(scope.row, apiUrl)"
                alt="资源图标"
                class="dev-resource-table__icon"
              />
              <div>
                <button
                  class="dev-resource-table__title-link"
                  type="button"
                  @click="openResourceHomepage(scope.row)"
                >
                  {{ scope.row.title }}
                </button>
                <div class="dev-resource-table__meta">
                  {{ resourcePlatformLabel(scope.row.platform) }} / {{ scope.row.author }}
                </div>
              </div>
            </div>
          </template>
        </TTableColumn>
        <TTableColumn label="标签" min-width="120">
          <template #default="scope">
            <span class="dev-resource-table__tags">{{ resourceTagColumnLabel(scope.row) }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="状态" min-width="110">
          <template #default="scope">
            <div class="dev-resource-table__status-tags">
              <TTag variant="outline" :tone="resourceVisibilityTagType(scope.row.visibility)">
                {{ resourceVisibilityLabel(scope.row.visibility) }}
              </TTag>
              <TTag
                v-if="isResourceArchiveLocked(scope.row)"
                variant="soft"
                tone="warning"
                data-testid="resource-archive-locked-tag"
              >
                已锁定
              </TTag>
            </div>
          </template>
        </TTableColumn>
        <TTableColumn prop="created_at" label="创建时间" min-width="150" />
        <TTableColumn label="操作" min-width="120" fixed="right">
          <template #default="scope">
            <TDropdown
              trigger="click"
              @command="
                (cmd) =>
                  handleResourceCommand(cmd as { action: string; resource: McResourcePayload })
              "
            >
              <TButton variant="outline" tone="accent">
                <span>更多</span>
                <TIcon class="dev-action-caret">
                  <ArrowDown />
                </TIcon>
              </TButton>
              <template #dropdown>
                <TDropdownMenu>
                  <TDropdownItem :command="{ action: 'view', resource: scope.row }"
                    >资源主页</TDropdownItem
                  >
                  <TDropdownItem
                    :command="{ action: 'publish', resource: scope.row }"
                    :disabled="isResourceArchiveLocked(scope.row)"
                    >发布版本</TDropdownItem
                  >
                  <TDropdownItem
                    v-if="scope.row.visibility === 'draft'"
                    :disabled="
                      Boolean(scope.row.requirement_id) ||
                      isResourceArchiveLocked(scope.row) ||
                      requestingReviewResourceId === scope.row.id
                    "
                    :command="{ action: 'request-review', resource: scope.row }"
                  >
                    {{ requestingReviewResourceId === scope.row.id ? '提交中...' : '申请公开' }}
                  </TDropdownItem>
                  <TDropdownItem
                    v-if="scope.row.visibility === 'published'"
                    :disabled="
                      isResourceArchiveLocked(scope.row) ||
                      settingPrivateResourceId === scope.row.id
                    "
                    :command="{ action: 'set-private', resource: scope.row }"
                  >
                    {{ settingPrivateResourceId === scope.row.id ? '设置中...' : '设为私有' }}
                  </TDropdownItem>
                  <TDropdownItem :command="{ action: 'versions', resource: scope.row }"
                    >版本管理</TDropdownItem
                  >
                  <TDropdownItem
                    :command="{ action: 'edit', resource: scope.row }"
                    :disabled="isResourceArchiveLocked(scope.row)"
                    >编辑主页</TDropdownItem
                  >
                  <TDropdownItem
                    :command="{ action: 'delete', resource: scope.row }"
                    :disabled="
                      isResourceArchiveLocked(scope.row) ||
                      !canDeleteResource(scope.row) ||
                      deletingResourceId === scope.row.id
                    "
                  >
                    {{ deletingResourceId === scope.row.id ? '删除中...' : '删除' }}
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
          aria-label="团队资源分页"
        />
      </div>

      <TDialog
        v-model:open="publishDialogVisible"
        width="520px"
        class="dev-dialog"
        :title="selectedResource ? `发布版本 · ${selectedResource.title}` : '发布版本'"
      >
        <TForm label-position="top" class="dev-version-form">
          <TFormItem label="版本号" required>
            <TInput
              v-model="versionForm.version"
              :maxlength="80"
              placeholder="例如：1.20.1-2.0.0"
            />
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
            <TInput
              show-count
              v-model="versionForm.note"
              type="textarea"
              :rows="4"
              :maxlength="1000"
              placeholder="记录本次新版本说明、兼容性变化或补充信息"
            />
          </TFormItem>
        </TForm>

        <template #footer>
          <TButton @click="publishDialogVisible = false">取消</TButton>
          <TButton
            variant="solid"
            tone="accent"
            :loading="publishingResourceId === selectedResource?.id"
            @click="submitVersion"
          >
            发布版本
          </TButton>
        </template>
      </TDialog>
    </TCard>
  </div>
</template>

<style scoped>
.dev-resource-table__title-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dev-blue);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

.dev-resource-table__title-link:hover {
  color: #6280df;
}

/* R014：锁定资源的整体说明横幅，放在团队资源表格上方；观感取自 TAlert 的 warning 态。 */
.dev-archive-locked-notice {
  margin: 0 0 16px;
}

/* 状态列里「可见性」与「已锁定」两个标签并排时要留缝 */
.dev-resource-table__status-tags {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
</style>
