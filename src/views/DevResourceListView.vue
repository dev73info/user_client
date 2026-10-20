<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
import { apiUrl } from '@/api/http'
import {
  applyResourcePromoCard,
  createMcResourceVersion,
  deleteMcResource,
  listMcResources,
  updateMcResourceHomepage,
  type McResourcePayload,
} from '@/api/mcResources'
import {
  getResourcePromoMeta,
  listMyPromoCards,
  promoCardLabel,
  type PromoCard,
} from '@/api/points'
import { HttpError } from '@/api/http'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { useResourceVersionDraft } from '@/composables/useResourceVersionDraft'
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
import { formatResourcePriceLabel, isPricedResource } from '@/shared/resourceSale'
import {
  isApiResourceKind,
  isResourceRowActionAvailable,
  resourceKindFromQuery,
} from '@/shared/resourceApi'

import ResourceTransferDialog from '@/components/ResourceTransferDialog.vue'

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
  TMessage,
  TMessageBox,
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
const publishingResourceId = ref<number | null>(null)
const requestingReviewResourceId = ref<number | null>(null)
const settingPrivateResourceId = ref<number | null>(null)
const publishDialogVisible = ref(false)
const deletingResourceId = ref<number | null>(null)
const resources = ref<McResourcePayload[]>([])
const selectedResource = ref<McResourcePayload | null>(null)

const promoDialogVisible = ref(false)
const promoTarget = ref<McResourcePayload | null>(null)
const unusedPromoCards = ref<PromoCard[]>([])
const selectedPromoCardId = ref<number | null>(null)
const applyingPromo = ref(false)
const highLikeThreshold = ref(5)

function formatExposureStatus(resource: McResourcePayload): string {
  const parts: string[] = []
  if (resource.is_featured) {
    parts.push(resource.featured_until ? `精选至 ${resource.featured_until}` : '精选（永久）')
  }
  if (resource.is_pinned && resource.pinned_until) {
    parts.push(`置顶至 ${resource.pinned_until}`)
  }
  return parts.join(' · ')
}

function isFeaturedCardDisabled(card: PromoCard, resource: McResourcePayload | null): boolean {
  if (!resource || card.card_code !== 'resource_featured_card') return false
  return (resource.like_count ?? 0) < highLikeThreshold.value
}

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

  return hasActiveFilters.value ? '没有符合筛选条件的资源' : '当前还没有资源记录'
})

// 搜索与状态筛选都在前端做：这一页的数据源本身就一次取回全部资源，
// 与需求大厅（服务端分页查询）不同，所以没有「查询」按钮，输入即过滤。
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

/* 分页与其余菜单页同构（需求大厅、收益钱包、团队资源、我的接单都带表尾分页器）。
   本页数据源一次取回全部资源，所以这里是客户端切片，不走服务端页码。
   筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空表。 */
const { page, pageSize, total: filteredTotal, paged } = useClientPagination(filteredResources)

function resetPage() {
  page.value = 1
}

watch(filters, resetPage)

const totalCount = computed(() => resources.value.length)
const publishedCount = computed(
  () => resources.value.filter((item) => item.visibility === 'published').length,
)
const reviewCount = computed(
  () => resources.value.filter((item) => item.visibility === 'review').length,
)
const draftCount = computed(
  () => resources.value.filter((item) => item.visibility === 'draft').length,
)

/** R014：列表里已进入超期锁定 / 已清除的资源数；> 0 时表格上方给一条锁定说明。 */
const archiveLockedCount = computed(
  () => resources.value.filter((item) => isResourceArchiveLocked(item)).length,
)

onMounted(async () => {
  auth.hydrate()
  await loadResources()
})

async function openPromoDialog(resource: McResourcePayload) {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  if (isResourceArchiveLocked(resource)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }
  if (resource.visibility !== 'published') {
    TMessage.warning('只能对已发布的资源使用道具卡')
    return
  }
  promoTarget.value = resource
  selectedPromoCardId.value = null
  promoDialogVisible.value = true
  try {
    const [cards, meta] = await Promise.all([
      listMyPromoCards(auth.token, 'unused'),
      getResourcePromoMeta(auth.token),
    ])
    unusedPromoCards.value = cards
    const threshold = Number(meta.high_like_threshold)
    if (Number.isFinite(threshold) && threshold >= 1) {
      highLikeThreshold.value = Math.floor(threshold)
    }
    const firstUsable = cards.find((card) => !isFeaturedCardDisabled(card, resource))
    selectedPromoCardId.value = firstUsable?.id ?? cards[0]?.id ?? null
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : error instanceof Error
          ? error.message
          : '加载道具卡失败'
    TMessage.error(message)
  }
}

async function confirmApplyPromoCard() {
  if (!auth.token || !promoTarget.value || !selectedPromoCardId.value) {
    TMessage.warning('请选择一张道具卡')
    return
  }
  const card = unusedPromoCards.value.find((item) => item.id === selectedPromoCardId.value)
  if (card && isFeaturedCardDisabled(card, promoTarget.value)) {
    TMessage.warning(`点赞数不足 ${highLikeThreshold.value}，无法使用精选卡`)
    return
  }
  applyingPromo.value = true
  try {
    const updated = await applyResourcePromoCard(
      auth.token,
      promoTarget.value.id,
      selectedPromoCardId.value,
    )
    const index = resources.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) {
      resources.value[index] = { ...resources.value[index], ...updated }
    }
    promoDialogVisible.value = false
    TMessage.success('道具卡已使用')
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : error instanceof Error
          ? error.message
          : '使用道具卡失败'
    TMessage.error(message)
  } finally {
    applyingPromo.value = false
  }
}

async function loadResources() {
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  isLoading.value = true
  try {
    const all = await listMcResources(auth.token)
    resources.value = all.filter((item) => item.ownership_type !== 'team')
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载资源列表失败'
    TMessage.error(message)
  } finally {
    isLoading.value = false
  }
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

function openEditHomepagePage(resource: McResourcePayload) {
  if (isResourceArchiveLocked(resource)) {
    TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
    return
  }

  router.push({ name: 'dev-resource-homepage-edit', params: { resourceId: resource.id } })
}

/** 整行点击进入编辑；行内按钮、链接、下拉自己处理点击，不触发行跳转。 */
function handleRowClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target || target.closest('button, a, input, select, textarea, label, [role="button"]')) {
    return
  }

  const rowEl = target.closest('tr.t73-table__row')
  if (!rowEl?.parentElement) {
    return
  }

  const index = Array.from(rowEl.parentElement.children).indexOf(rowEl)
  const row = paged.value[index]
  if (row) {
    openEditHomepagePage(row)
  }
}

function openSoldPurchases(resource: McResourcePayload) {
  void router.push({
    name: 'dev-resource-sold-purchases',
    query: { resourceId: String(resource.id) },
  })
}

function openVersionsPage(resource: McResourcePayload) {
  router.push({ name: 'dev-resource-versions', params: { resourceId: resource.id } })
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

  const confirmed = await TMessageBox.confirm({
    title: '删除资源',
    content: `确认删除资源 ${resource.title} 吗？该操作会同时删除其历史版本，且不可撤销。购买订单会保留作历史记录。`,
    confirmText: '删除',
    cancelText: '取消',
    tone: 'danger',
  })
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

function handleResourceAction(
  command: 'publish' | 'versions' | 'delete',
  resource: McResourcePayload,
) {
  if (command === 'publish') {
    openPublishVersionDialog(resource)
    return
  }

  if (command === 'versions') {
    openVersionsPage(resource)
    return
  }

  void removeResource(resource)
}

/** R028：发布入口分两条，各进各的创建页——普通资源 `dev-plugins`、接口资源 `dev-plugins-api`。 */
function goCreateResource(kind: unknown) {
  void router.push({
    name: resourceKindFromQuery(kind) === 'api' ? 'dev-plugins-api' : 'dev-plugins',
  })
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

  if (payload.action === 'use-promo') {
    void openPromoDialog(payload.resource)
    return
  }

  if (payload.action === 'sold-orders') {
    openSoldPurchases(payload.resource)
    return
  }

  if (payload.action === 'transfer') {
    openTransferDialog(payload.resource)
    return
  }

  if (
    payload.action !== 'publish' &&
    payload.action !== 'versions' &&
    payload.action !== 'delete'
  ) {
    return
  }

  handleResourceAction(payload.action, payload.resource)
}

/* ------------------------------------------------------------------ *
 * R015 资源项目过户
 *
 * 发起入口仍在资源表格的「过户」动作里（`ResourceTransferDialog`）；
 * 「待我同意 / 我发起的」列表已迁到「系统通知」页，与其它通知合并展示。
 * ------------------------------------------------------------------ */
const transferDialogVisible = ref(false)
const transferTarget = ref<McResourcePayload | null>(null)

/** 打开「发起过户」弹窗；表单本身在 `ResourceTransferDialog` 里，这里只传目标资源。 */
function openTransferDialog(resource: McResourcePayload) {
  transferTarget.value = resource
  transferDialogVisible.value = true
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

  if (isPricedResource(resource.price_fen, resource.price_points) && resource.requirement_id) {
    TMessage.warning('绑定定制交付的资源不可付费售卖')
    return
  }

  if (isPricedResource(resource.price_fen, resource.price_points) && !resource.copyright_declared) {
    TMessage.warning('付费资源须先在「编辑主页」勾选版权声明，再申请公开')
    router.push({
      name: 'dev-resource-homepage-edit',
      params: { resourceId: String(resource.id) },
    })
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
      price_fen: resource.price_fen ?? 0,
      price_points: resource.price_points ?? 0,
      copyright_declared: resource.copyright_declared ?? false,
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
</script>

<template>
  <div class="dev-page dev-page--resource-list">
    <WorkbenchBarSlot>
      <div class="dev-meta-strip">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">资源总数</span>
          <span class="dev-meta-strip__value">{{ totalCount }}</span>
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
          <TButton icon-only :loading="isLoading" aria-label="刷新资源列表" @click="loadResources">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">资源列表</h3>
        </div>
        <div class="dev-card-head__actions">
          <!-- R028：发布入口分两条——普通资源（大厅公开展示）与接口资源（不公开展示，指定来源下单），
               各自进自己的创建页；类别由入口决定，创建页表单里不再有「资源类别」。 -->
          <TDropdown trigger="click" @command="(cmd: unknown) => goCreateResource(cmd)">
            <button type="button" class="dev-btn dev-btn--primary">
              <TIcon>
                <Plus />
              </TIcon>
              <span>发布资源</span>
            </button>
            <template #dropdown>
              <TDropdownMenu>
                <TDropdownItem :command="'normal'">普通资源</TDropdownItem>
                <TDropdownItem :command="'api'">接口资源</TDropdownItem>
              </TDropdownMenu>
            </template>
          </TDropdown>
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
            筛选出 {{ filteredResources.length }} / {{ totalCount }} 个
          </span>
        </div>
      </div>

      <TTable
        :loading="isLoading"
        :data="paged"
        stripe
        class="dev-table dev-resource-table"
        @click="handleRowClick"
      >
        <template #empty>
          <p class="dev-empty-state">{{ emptyText }}</p>
        </template>
        <!-- 列宽可拖：`resizable` 打开表头右边缘的拖拽手柄；固定宽度留给内容，
             弹性宽度留给「资源」列，窄窗口下表格横向滚动而不是把标签挤到隔壁列。 -->
        <TTableColumn label="资源" min-width="200" resizable>
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
                  @click="openEditHomepagePage(scope.row)"
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
        <!-- 标签不截断：列宽内自然换行，这一行标签多时宁可把行撑高也不显示省略号 -->
        <TTableColumn label="标签" width="200" resizable>
          <template #default="scope">
            <span class="dev-resource-table__tags">{{ resourceTagColumnLabel(scope.row) }}</span>
          </template>
        </TTableColumn>
        <TTableColumn label="售价" width="96" resizable>
          <template #default="scope">
            <TTag
              variant="outline"
              :tone="
                isPricedResource(scope.row.price_fen, scope.row.price_points) ? 'accent' : 'neutral'
              "
            >
              {{ formatResourcePriceLabel(scope.row.price_fen ?? 0, scope.row.price_points ?? 0) }}
            </TTag>
          </template>
        </TTableColumn>
        <TTableColumn label="状态" width="190" resizable>
          <template #default="scope">
            <div class="dev-resource-table__status-tags">
              <!-- 接口资源与普通资源共用同一套可见性标签，样式完全一致 -->
              <TTag
                variant="outline"
                :tone="resourceVisibilityTagType(scope.row.visibility)"
                :data-testid="isApiResourceKind(scope.row.resource_kind) ? 'resource-api-tag' : undefined"
              >
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
            <div v-if="formatExposureStatus(scope.row)" class="dev-resource-table__exposure">
              {{ formatExposureStatus(scope.row) }}
            </div>
          </template>
        </TTableColumn>
        <TTableColumn
          prop="created_at"
          label="创建时间"
          width="150"
          resizable
          show-overflow-tooltip
        />
        <TTableColumn label="操作" width="118" fixed="right" resizable>
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
                  <!-- 接口资源没有可下载文件、不进任何公开面、渠道配置也不随过户走，
                       所以「发布版本 / 版本管理 / 使用道具 / 过户」对它不出现（判据见
                       shared/resourceApi.ts 的 isResourceRowActionAvailable）。 -->
                  <TDropdownItem
                    v-if="isResourceRowActionAvailable('publish', scope.row.resource_kind)"
                    :disabled="isResourceArchiveLocked(scope.row)"
                    :command="{ action: 'publish', resource: scope.row }"
                  >
                    发布版本
                  </TDropdownItem>
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
                  <TDropdownItem
                    v-if="
                      scope.row.visibility === 'published' &&
                      isResourceRowActionAvailable('use-promo', scope.row.resource_kind)
                    "
                    :disabled="isResourceArchiveLocked(scope.row)"
                    :command="{ action: 'use-promo', resource: scope.row }"
                  >
                    使用道具
                  </TDropdownItem>
                  <TDropdownItem
                    v-if="isResourceRowActionAvailable('versions', scope.row.resource_kind)"
                    :command="{ action: 'versions', resource: scope.row }"
                    >版本管理</TDropdownItem
                  >
                  <TDropdownItem :command="{ action: 'sold-orders', resource: scope.row }">
                    售出订单
                  </TDropdownItem>
                  <TDropdownItem
                    v-if="isResourceRowActionAvailable('transfer', scope.row.resource_kind)"
                    :command="{ action: 'transfer', resource: scope.row }"
                  >
                    过户
                  </TDropdownItem>
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
          aria-label="资源列表分页"
        />
      </div>
    </TCard>

    <TDialog
      v-model:open="publishDialogVisible"
      width="520px"
      class="dev-dialog"
      :title="selectedResource ? `发布版本 · ${selectedResource.title}` : '发布版本'"
    >
      <TForm label-position="top" class="dev-version-form">
        <TFormItem label="版本号" required>
          <TInput v-model="versionForm.version" :maxlength="80" placeholder="例如：1.20.1-2.0.0" />
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

    <TDialog
      v-model:open="promoDialogVisible"
      width="520px"
      class="dev-dialog"
      :title="promoTarget ? `使用道具 · ${promoTarget.title}` : '使用道具'"
    >
      <p class="dev-promo-tip">
        当前点赞 {{ promoTarget?.like_count ?? 0 }}；精选卡需 ≥ {{ highLikeThreshold }}。
      </p>
      <TForm v-if="unusedPromoCards.length" label-position="top">
        <TFormItem label="选择道具卡" required>
          <TSelect
            v-model="selectedPromoCardId"
            placeholder="请选择未使用的道具卡"
            style="width: 100%"
          >
            <TOption
              v-for="card in unusedPromoCards"
              :key="card.id"
              :value="card.id"
              :disabled="isFeaturedCardDisabled(card, promoTarget)"
              :label="`${promoCardLabel(card.card_code)} · ${card.duration_days} 天${
                isFeaturedCardDisabled(card, promoTarget) ? `（点赞不足 ${highLikeThreshold}）` : ''
              }`"
            />
          </TSelect>
        </TFormItem>
      </TForm>
      <p v-else class="dev-promo-tip">背包暂无未使用的道具卡，请先到积分商城兑换。</p>
      <template #footer>
        <TButton @click="promoDialogVisible = false">取消</TButton>
        <TButton
          variant="solid"
          tone="accent"
          :loading="applyingPromo"
          :disabled="!unusedPromoCards.length || !selectedPromoCardId"
          @click="confirmApplyPromoCard"
        >
          确认使用
        </TButton>
      </template>
    </TDialog>

    <ResourceTransferDialog
      v-model:open="transferDialogVisible"
      :resource="transferTarget"
    />
  </div>
</template>

<style scoped>
/* 整行可点：给出行可点击的视觉提示 */
.dev-resource-table :deep(.t73-table__row) {
  cursor: pointer;
}

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

.dev-resource-table__exposure {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.dev-promo-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

/* R014：锁定资源的整体说明横幅，放在资源列表表格上方；观感取自 TAlert 的 warning 态。 */
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
