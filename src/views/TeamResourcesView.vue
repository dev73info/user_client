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
import { useToast } from '@/composables/useToast'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { useResourceVersionDraft } from '@/composables/useResourceVersionDraft'
import {
  canDeleteResource,
  resourceCoverUrl,
  resourcePlatformLabel,
  resourceTagSummary,
  resourceVisibilityLabel,
  resourceVisibilityTagType,
} from '@/shared/resourcePresentation'
import {
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
  TOption,
  TPagination,
  TSelect,
  TTable,
  TTableColumn,
  TTag,
  ArrowDown,
  Plus,
  Refresh,
  RefreshLeft,
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
const { showToast } = useToast()

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

function resetFilters() {
  filters.keyword = ''
  filters.visibility = ''
}

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
    showToast(err instanceof Error ? err.message : '加载团队资源失败', 'error')
  } finally {
    isLoading.value = false
  }
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

  const confirmed = window.confirm(
    `确认删除资源 ${resource.title} 吗？该操作会同时删除其历史版本，且不可撤销。`,
  )
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

function openResourceHomepage(resource: McResourcePayload) {
  const tagSelections = resource.tag_selections ?? []
  const rootName = tagSelections.find((s) => s.group_path.length > 0)?.group_path[0] ?? ''
  const entryName =
    tagSelections.find((s) => s.group_path.length > 1)?.group_path[1] ??
    (resource.platform || '')
  const rootAlias =
    tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 0)
      ?.group_path_aliases?.[0] ?? ''
  const entryAlias =
    tagSelections.find((s) => (s.group_path_aliases?.length ?? 0) > 1)
      ?.group_path_aliases?.[1] ?? ''
  const rootSlug = rootAlias || getTagRouteSlug(rootName)
  const entrySlug = entryAlias || getTagRouteSlug(entryName)
  const resourceSlug = getResourceDetailSlug(resource.id, resource.creator || resource.author)

  // 资源没有分类标签时分类段是空字符串，push 带分类的路由会抛 `Missing required param "rootSlug"`。
  if (!rootSlug || !entrySlug) {
    void router.push({ name: 'resource-detail-direct', params: { resourceSlug } })
    return
  }

  void router.push({
    name: 'resource-detail',
    params: { rootSlug, entrySlug, resourceSlug },
  })
}

function openPublishVersionDialog(resource: McResourcePayload) {
  selectedResource.value = resource
  resetVersionDraft()
  publishDialogVisible.value = true
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
    clearFileSelection()
    showToast('新版本已发布', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布新版本失败'
    showToast(message, 'error')
  } finally {
    publishingResourceId.value = null
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
          <TButton variant="outline" @click="resetFilters">
            <TIcon>
              <RefreshLeft />
            </TIcon>
            <span>重置</span>
          </TButton>
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
            <span class="dev-resource-table__tags">{{
              resourceTagSummary(scope.row) || '未附带标签'
            }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="状态" min-width="110">
          <template #default="scope">
            <TTag variant="outline" :tone="resourceVisibilityTagType(scope.row.visibility)">
              {{ resourceVisibilityLabel(scope.row.visibility) }}
            </TTag>
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
                  <TDropdownItem :command="{ action: 'publish', resource: scope.row }"
                    >发布版本</TDropdownItem
                  >
                  <TDropdownItem
                    v-if="scope.row.visibility === 'draft'"
                    :disabled="
                      Boolean(scope.row.requirement_id) ||
                      requestingReviewResourceId === scope.row.id
                    "
                    :command="{ action: 'request-review', resource: scope.row }"
                  >
                    {{ requestingReviewResourceId === scope.row.id ? '提交中...' : '申请公开' }}
                  </TDropdownItem>
                  <TDropdownItem
                    v-if="scope.row.visibility === 'published'"
                    :disabled="settingPrivateResourceId === scope.row.id"
                    :command="{ action: 'set-private', resource: scope.row }"
                  >
                    {{ settingPrivateResourceId === scope.row.id ? '设置中...' : '设为私有' }}
                  </TDropdownItem>
                  <TDropdownItem :command="{ action: 'versions', resource: scope.row }"
                    >版本管理</TDropdownItem
                  >
                  <TDropdownItem :command="{ action: 'edit', resource: scope.row }"
                    >编辑主页</TDropdownItem
                  >
                  <TDropdownItem
                    :command="{ action: 'delete', resource: scope.row }"
                    :disabled="!canDeleteResource(scope.row) || deletingResourceId === scope.row.id"
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
</style>
