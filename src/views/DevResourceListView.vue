<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRouter } from 'vue-router'
import { apiUrl } from '@/api/http'
import {
  getProcessedTagTree,
  type McProcessedTagTree,
} from '@/api/resourceTags'
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
import {
  acceptResourceTransfer,
  cancelResourceTransfer,
  listMyResourceTransferInbox,
  listMyResourceTransfers,
  rejectResourceTransfer,
  type ResourceTransferPayload,
} from '@/api/resourceTransfers'
import { useToast } from '@/composables/useToast'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { useResourceVersionDraft } from '@/composables/useResourceVersionDraft'
import {
  canDeleteResource,
  isResourceArchiveLocked,
  resourceCoverUrl,
  resourcePlatformLabel,
  resourceTagSummary,
  resourceVisibilityLabel,
  resourceVisibilityTagType,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
  RESOURCE_ARCHIVE_LOCKED_TITLE,
} from '@/shared/resourcePresentation'
import {
  formatResourcePriceLabel,
  isPricedResource,
} from '@/shared/resourceSale'
import { isApiResourceKind, resourceKindFromQuery } from '@/shared/resourceApi'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import {
  describeTransferError,
  describeTransferReceiver,
  isTransferCancelable,
  transferStatusLabel,
  transferStatusTone,
} from '@/shared/resourceTransfer'

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
const { showToast } = useToast()

const isLoading = ref(false)
const publishingResourceId = ref<number | null>(null)
const requestingReviewResourceId = ref<number | null>(null)
const settingPrivateResourceId = ref<number | null>(null)
const publishDialogVisible = ref(false)
const deletingResourceId = ref<number | null>(null)
const resources = ref<McResourcePayload[]>([])
const selectedResource = ref<McResourcePayload | null>(null)
const processedTagTree = ref<McProcessedTagTree | null>(null)

const promoDialogVisible = ref(false)
const promoTarget = ref<McResourcePayload | null>(null)
const unusedPromoCards = ref<PromoCard[]>([])
const selectedPromoCardId = ref<number | null>(null)
const applyingPromo = ref(false)
const highLikeThreshold = ref(5)

function formatExposureStatus(resource: McResourcePayload): string {
  const parts: string[] = []
  if (resource.is_featured) {
    parts.push(
      resource.featured_until
        ? `精选至 ${resource.featured_until}`
        : '精选（永久）',
    )
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

function resetFilters() {
  filters.keyword = ''
  filters.visibility = ''
}

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
  void loadResourceRouteTree()
  void loadTransfers()
  await loadResources()
})

async function loadResourceRouteTree() {
  try {
    processedTagTree.value = await getProcessedTagTree()
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载资源目录失败'
    showToast(message, 'warning')
  }
}

async function openPromoDialog(resource: McResourcePayload) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  if (isResourceArchiveLocked(resource)) {
    showToast(RESOURCE_ARCHIVE_LOCKED_MESSAGE, 'warning')
    return
  }
  if (resource.visibility !== 'published') {
    showToast('只能对已发布的资源使用道具卡', 'warning')
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
    showToast(message, 'error')
  }
}

async function confirmApplyPromoCard() {
  if (!auth.token || !promoTarget.value || !selectedPromoCardId.value) {
    showToast('请选择一张道具卡', 'warning')
    return
  }
  const card = unusedPromoCards.value.find((item) => item.id === selectedPromoCardId.value)
  if (card && isFeaturedCardDisabled(card, promoTarget.value)) {
    showToast(
      `点赞数不足 ${highLikeThreshold.value}，无法使用精选卡`,
      'warning',
    )
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
    showToast('道具卡已使用', 'success')
  } catch (error) {
    const message =
      error instanceof HttpError
        ? error.message
        : error instanceof Error
          ? error.message
          : '使用道具卡失败'
    showToast(message, 'error')
  } finally {
    applyingPromo.value = false
  }
}

async function loadResources() {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  isLoading.value = true
  try {
    const all = await listMcResources(auth.token)
    resources.value = all.filter((item) => item.ownership_type !== 'team')
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载资源列表失败'
    showToast(message, 'error')
  } finally {
    isLoading.value = false
  }
}

function resolveResourceRoute(
  resource: McResourcePayload,
): { rootSlug: string; entrySlug: string } | null {
  const tree = processedTagTree.value
  if (!tree) {
    return null
  }

  for (const root of tree.roots) {
    const entry = root.entries.find((item) => item.platform === resource.platform)
    if (entry) {
      return {
        rootSlug: root.key,
        entrySlug: entry.key,
      }
    }
  }

  const fallbackRoot = tree.roots[0]
  const fallbackEntry = fallbackRoot?.entries[0]
  if (fallbackRoot && fallbackEntry) {
    return {
      rootSlug: fallbackRoot.key,
      entrySlug: fallbackEntry.key,
    }
  }

  return null
}

async function openResourceHomepage(resource: McResourcePayload) {
  if (!processedTagTree.value) {
    await loadResourceRouteTree()
  }

  const routeParams = resolveResourceRoute(resource)
  if (!routeParams) {
    showToast('资源目录暂未配置完整标签路由', 'warning')
    return
  }

  await router.push(
    resourceDetailLocation({
      resourceId: resource.id,
      rootSlug: routeParams.rootSlug,
      entrySlug: routeParams.entrySlug,
      sale: resourceListingSaleOf(resource.price_fen, resource.price_points),
    }),
  )
}

function openPublishVersionDialog(resource: McResourcePayload) {
  if (isResourceArchiveLocked(resource)) {
    showToast(RESOURCE_ARCHIVE_LOCKED_MESSAGE, 'warning')
    return
  }

  selectedResource.value = resource
  resetVersionDraft()
  publishDialogVisible.value = true
}

function openEditHomepagePage(resource: McResourcePayload) {
  if (isResourceArchiveLocked(resource)) {
    showToast(RESOURCE_ARCHIVE_LOCKED_MESSAGE, 'warning')
    return
  }

  router.push({ name: 'dev-resource-homepage-edit', params: { resourceId: resource.id } })
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
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (isResourceArchiveLocked(resource)) {
    showToast(RESOURCE_ARCHIVE_LOCKED_MESSAGE, 'warning')
    return
  }

  if (!canDeleteResource(resource)) {
    showToast('已关联需求的资源不能删除', 'warning')
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
    showToast('资源已删除', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除资源失败'
    showToast(message, 'error')
  } finally {
    deletingResourceId.value = null
  }
}

function handleResourceAction(
  command: 'view' | 'publish' | 'edit' | 'versions' | 'delete',
  resource: McResourcePayload,
) {
  if (command === 'view') {
    void openResourceHomepage(resource)
    return
  }

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
    payload.action !== 'view' &&
    payload.action !== 'publish' &&
    payload.action !== 'edit' &&
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
 * 开发者把名下资源项目过户给其他开发者 / 团队，需接收方同意后才换主。
 * 本页提供：资源表格里的「过户」入口与发起弹窗、顶部「待我同意 / 我发起的」两张列表
 * （同意 / 拒绝 / 撤销）。所有权变更与全部校验都在后端，这里只消费接口、透出后端中文提示。
 * ------------------------------------------------------------------ */
const transferDialogVisible = ref(false)
const transferTarget = ref<McResourcePayload | null>(null)
const transferInbox = ref<ResourceTransferPayload[]>([])
const myTransfers = ref<ResourceTransferPayload[]>([])
const transfersLoading = ref(false)
/** 正在处理（同意 / 拒绝 / 撤销）的申请 id，用于给对应按钮显示 loading。 */
const respondingTransferId = ref<number | null>(null)
const transferTab = ref<'inbox' | 'mine'>('inbox')

const transferInboxCount = computed(() => transferInbox.value.length)

/** 打开「发起过户」弹窗；表单本身在 `ResourceTransferDialog` 里，这里只传目标资源。 */
function openTransferDialog(resource: McResourcePayload) {
  transferTarget.value = resource
  transferDialogVisible.value = true
}

/** 弹窗发起成功后切到「我发起的」，让用户立刻看到刚发出去的那条。 */
async function handleTransferSubmitted() {
  transferTab.value = 'mine'
  await loadTransfers()
}

/** 拉取「待我同意」与「我发起的」两份列表。 */
async function loadTransfers() {
  if (!auth.token) {
    return
  }

  transfersLoading.value = true
  try {
    const [inbox, mine] = await Promise.all([
      listMyResourceTransferInbox(auth.token),
      listMyResourceTransfers(auth.token),
    ])
    transferInbox.value = inbox
    myTransfers.value = mine
  } catch (error) {
    const { message } = describeTransferError(error, '加载过户列表失败')
    showToast(message, 'warning')
  } finally {
    transfersLoading.value = false
  }
}

/** 接收方同意 / 拒绝。同意后资源换主，两份列表与资源表格都要刷新。 */
async function respondTransfer(transfer: ResourceTransferPayload, accepted: boolean) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  const resourceName = transfer.resource_name || `资源 #${transfer.resource_id}`
  if (accepted) {
    const confirmed = window.confirm(
      `同意接收资源「${resourceName}」吗？同意后该资源归你所有，原所有者将不再拥有它。`,
    )
    if (!confirmed) {
      return
    }
  }

  respondingTransferId.value = transfer.transfer_id
  try {
    if (accepted) {
      await acceptResourceTransfer(auth.token, transfer.transfer_id)
    } else {
      await rejectResourceTransfer(auth.token, transfer.transfer_id)
    }
    showToast(accepted ? '已同意过户，资源已转入你的资源项目' : '已拒绝该过户申请', 'success')
    await Promise.all([loadTransfers(), loadResources()])
  } catch (error) {
    const { message, needRefresh } = describeTransferError(
      error,
      accepted ? '同意过户失败' : '拒绝过户失败',
    )
    showToast(message, 'error')
    if (needRefresh) {
      await Promise.all([loadTransfers(), loadResources()])
    }
  } finally {
    respondingTransferId.value = null
  }
}

/** 发起方撤销待处理的申请。 */
async function cancelTransferApply(transfer: ResourceTransferPayload) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  respondingTransferId.value = transfer.transfer_id
  try {
    await cancelResourceTransfer(auth.token, transfer.transfer_id)
    showToast('过户申请已撤销，资源归属保持不变', 'success')
    await loadTransfers()
  } catch (error) {
    const { message, needRefresh } = describeTransferError(error, '撤销过户失败')
    showToast(message, 'error')
    if (needRefresh) {
      await loadTransfers()
    }
  } finally {
    respondingTransferId.value = null
  }
}

async function submitVersion() {
  if (!auth.token || !selectedResource.value) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (isResourceArchiveLocked(selectedResource.value)) {
    showToast(RESOURCE_ARCHIVE_LOCKED_MESSAGE, 'warning')
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

async function requestPublicReview(resource: McResourcePayload) {
  if (!auth.token) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (isResourceArchiveLocked(resource)) {
    showToast(RESOURCE_ARCHIVE_LOCKED_MESSAGE, 'warning')
    return
  }

  if (resource.requirement_id) {
    showToast('已关联需求的资源不能申请公开审核', 'warning')
    return
  }

  if (isPricedResource(resource.price_fen, resource.price_points) && resource.requirement_id) {
    showToast('绑定定制交付的资源不可付费售卖', 'warning')
    return
  }

  if (
    isPricedResource(resource.price_fen, resource.price_points) &&
    !resource.copyright_declared
  ) {
    showToast('付费资源须先在「编辑主页」勾选版权声明，再申请公开', 'warning')
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

  if (isResourceArchiveLocked(resource)) {
    showToast(RESOURCE_ARCHIVE_LOCKED_MESSAGE, 'warning')
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

    <TCard class="dev-surface-card dev-transfer-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">资源过户</h3>
          <p class="dev-card-head__hint">
            接收方同意后才完成所有权转移；过户不改写已成交订单的卖家。
          </p>
        </div>
        <div class="dev-card-head__actions">
          <TButton variant="outline" :loading="transfersLoading" @click="loadTransfers">
            <TIcon>
              <Refresh />
            </TIcon>
            <span>刷新</span>
          </TButton>
        </div>
      </div>

      <div class="dev-transfer-tabs" role="tablist" aria-label="资源过户列表切换">
        <button type="button" role="tab" class="dev-transfer-tab" :class="{ 'is-active': transferTab === 'inbox' }"
          :aria-selected="transferTab === 'inbox'" @click="transferTab = 'inbox'">
          待我同意
          <span v-if="transferInboxCount" class="dev-transfer-tab__badge">{{ transferInboxCount }}</span>
        </button>
        <button type="button" role="tab" class="dev-transfer-tab" :class="{ 'is-active': transferTab === 'mine' }"
          :aria-selected="transferTab === 'mine'" @click="transferTab = 'mine'">
          我发起的
        </button>
      </div>

      <!-- 待我同意：接收方为本人，或本人是接收团队的 owner / admin -->
      <ul v-if="transferTab === 'inbox'" class="dev-transfer-list">
        <li v-for="item in transferInbox" :key="item.transfer_id" class="dev-transfer-item">
          <div class="dev-transfer-item__main">
            <div class="dev-transfer-item__head">
              <span class="dev-transfer-item__name">
                {{ item.resource_name || `资源 #${item.resource_id}` }}
              </span>
              <TTag variant="outline" :tone="transferStatusTone(item.status)">
                {{ transferStatusLabel(item.status) }}
              </TTag>
            </div>
            <p class="dev-transfer-item__meta">
              来自 {{ item.from_team_name ? `团队 ${item.from_team_name}` : item.from_user }}
              · 发起于 {{ item.initiated_at }}
            </p>
            <p v-if="item.message" class="dev-transfer-item__message">“{{ item.message }}”</p>
          </div>
          <div class="dev-transfer-item__actions">
            <TButton variant="solid" tone="accent" :disabled="respondingTransferId === item.transfer_id"
              @click="respondTransfer(item, true)">
              同意
            </TButton>
            <TButton variant="outline" :disabled="respondingTransferId === item.transfer_id"
              @click="respondTransfer(item, false)">
              拒绝
            </TButton>
          </div>
        </li>
        <li v-if="!transferInbox.length" class="dev-transfer-empty">
          {{ transfersLoading ? '过户列表加载中' : '暂无待你同意的过户申请' }}
        </li>
      </ul>

      <!-- 我发起的：显示状态与时间，只有 pending 才给撤销 -->
      <ul v-else class="dev-transfer-list">
        <li v-for="item in myTransfers" :key="item.transfer_id" class="dev-transfer-item">
          <div class="dev-transfer-item__main">
            <div class="dev-transfer-item__head">
              <span class="dev-transfer-item__name">
                {{ item.resource_name || `资源 #${item.resource_id}` }}
              </span>
              <TTag variant="outline" :tone="transferStatusTone(item.status)">
                {{ transferStatusLabel(item.status) }}
              </TTag>
            </div>
            <p class="dev-transfer-item__meta">
              转给 {{ describeTransferReceiver(item) }} · 发起于 {{ item.initiated_at }}
              <template v-if="item.responded_at"> · 处理于 {{ item.responded_at }}</template>
            </p>
            <p v-if="item.message" class="dev-transfer-item__message">“{{ item.message }}”</p>
          </div>
          <div v-if="isTransferCancelable(item.status)" class="dev-transfer-item__actions">
            <TButton variant="outline" :disabled="respondingTransferId === item.transfer_id"
              @click="cancelTransferApply(item)">
              撤销
            </TButton>
          </div>
        </li>
        <li v-if="!myTransfers.length" class="dev-transfer-empty">
          {{ transfersLoading ? '过户列表加载中' : '你还没有发起过资源过户' }}
        </li>
      </ul>
    </TCard>

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
        <TSelect v-model="filters.visibility" clearable placeholder="资源状态"
          class="dev-toolbar__field" aria-label="按资源状态筛选">
          <TOption label="已公开" value="published" />
          <TOption label="审核中" value="review" />
          <TOption label="私有" value="draft" />
        </TSelect>

        <TInput v-model="filters.keyword" clearable placeholder="搜索资源标题、作者或标签"
          class="dev-toolbar__search">
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
              <img v-if="scope.row.cover_url" :src="resourceCoverUrl(scope.row, apiUrl)" alt="资源图标"
                class="dev-resource-table__icon" />
              <div>
                <button class="dev-resource-table__title-link" type="button" @click="openResourceHomepage(scope.row)">
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
        <TTableColumn label="售价" min-width="90">
          <template #default="scope">
            <TTag
              variant="outline"
              :tone="
                isPricedResource(scope.row.price_fen, scope.row.price_points)
                  ? 'accent'
                  : 'neutral'
              "
            >
              {{
                formatResourcePriceLabel(scope.row.price_fen ?? 0, scope.row.price_points ?? 0)
              }}
            </TTag>
          </template>
        </TTableColumn>
        <TTableColumn label="状态" min-width="110">
          <template #default="scope">
            <div class="dev-resource-table__status-tags">
              <TTag variant="outline" :tone="resourceVisibilityTagType(scope.row.visibility)">
                {{ resourceVisibilityLabel(scope.row.visibility) }}
              </TTag>
              <!-- R028：接口资源不进大厅，列表里必须一眼看得出来 -->
              <TTag
                v-if="isApiResourceKind(scope.row.resource_kind)"
                variant="soft"
                tone="warning"
                data-testid="resource-api-tag"
              >
                接口资源 · 不在大厅展示
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
        <TTableColumn prop="created_at" label="创建时间" min-width="150" />
        <TTableColumn label="操作" min-width="120" fixed="right">
          <template #default="scope">
            <TDropdown trigger="click"
              @command="(cmd) => handleResourceCommand(cmd as { action: string; resource: McResourcePayload })">
              <TButton variant="outline" tone="accent">
                <span>更多</span>
                <TIcon class="dev-action-caret">
                  <ArrowDown />
                </TIcon>
              </TButton>
              <template #dropdown>
                <TDropdownMenu>
                  <TDropdownItem
                    :disabled="isResourceArchiveLocked(scope.row)"
                    :command="{ action: 'publish', resource: scope.row }"
                  >
                    发布版本
                  </TDropdownItem>
                  <TDropdownItem v-if="scope.row.visibility === 'draft'" :disabled="Boolean(scope.row.requirement_id) ||
                    isResourceArchiveLocked(scope.row) ||
                    requestingReviewResourceId === scope.row.id
                    " :command="{ action: 'request-review', resource: scope.row }">
                    {{ requestingReviewResourceId === scope.row.id ? '提交中...' : '申请公开' }}
                  </TDropdownItem>
                  <TDropdownItem v-if="scope.row.visibility === 'published'"
                    :disabled="isResourceArchiveLocked(scope.row) || settingPrivateResourceId === scope.row.id"
                    :command="{ action: 'set-private', resource: scope.row }">
                    {{ settingPrivateResourceId === scope.row.id ? '设置中...' : '设为私有' }}
                  </TDropdownItem>
                  <TDropdownItem
                    v-if="scope.row.visibility === 'published'"
                    :disabled="isResourceArchiveLocked(scope.row)"
                    :command="{ action: 'use-promo', resource: scope.row }"
                  >
                    使用道具
                  </TDropdownItem>
                  <TDropdownItem :command="{ action: 'versions', resource: scope.row }">版本管理</TDropdownItem>
                  <TDropdownItem
                    :disabled="isResourceArchiveLocked(scope.row)"
                    :command="{ action: 'edit', resource: scope.row }"
                  >
                    编辑主页
                  </TDropdownItem>
                  <TDropdownItem :command="{ action: 'sold-orders', resource: scope.row }">
                    售出订单
                  </TDropdownItem>
                  <TDropdownItem :command="{ action: 'transfer', resource: scope.row }">
                    过户
                  </TDropdownItem>
                  <TDropdownItem :command="{ action: 'delete', resource: scope.row }"
                    :disabled="isResourceArchiveLocked(scope.row) || !canDeleteResource(scope.row) || deletingResourceId === scope.row.id">
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
            <TOption v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
          </TSelect>
        </div>
        <TPagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal" :pager-count="5" background aria-label="资源列表分页" />
      </div>
    </TCard>

    <TDialog v-model:open="publishDialogVisible" width="520px" class="dev-dialog"
      :title="selectedResource ? `发布版本 · ${selectedResource.title}` : '发布版本'">
      <TForm label-position="top" class="dev-version-form">
        <TFormItem label="版本号" required>
          <TInput v-model="versionForm.version"  :maxlength="80" placeholder="例如：1.20.1-2.0.0" />
        </TFormItem>
        <TFormItem label="资源文件" required>
          <div class="dev-version-file-picker">
            <input ref="versionFileInput" type="file" class="dev-version-file-picker__input"
              @change="handleVersionFileChange" />
            <TButton @click="triggerVersionFileSelect">选择文件</TButton>
            <span class="dev-version-file-picker__name">{{
              selectedVersionFileName || '未选择文件'
              }}</span>
          </div>
        </TFormItem>
        <TFormItem label="备注">
          <TInput show-count v-model="versionForm.note" type="textarea" :rows="4"  :maxlength="1000"
            placeholder="记录本次新版本说明、兼容性变化或补充信息" />
        </TFormItem>
      </TForm>

      <template #footer>
        <TButton @click="publishDialogVisible = false">取消</TButton>
        <TButton variant="solid" tone="accent" :loading="publishingResourceId === selectedResource?.id" @click="submitVersion">
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
          <TSelect v-model="selectedPromoCardId" placeholder="请选择未使用的道具卡" style="width: 100%">
            <TOption
              v-for="card in unusedPromoCards"
              :key="card.id"
              :value="card.id"
              :disabled="isFeaturedCardDisabled(card, promoTarget)"
              :label="`${promoCardLabel(card.card_code)} · ${card.duration_days} 天${
                isFeaturedCardDisabled(card, promoTarget)
                  ? `（点赞不足 ${highLikeThreshold}）`
                  : ''
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

    <ResourceTransferDialog v-model:open="transferDialogVisible" :resource="transferTarget"
      @submitted="handleTransferSubmitted" />
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

/* ---------- R015 资源过户：待我同意 / 我发起的列表与发起表单 ---------- */

.dev-card-head__hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--dev-muted);
  line-height: 1.5;
}

.dev-transfer-tabs {
  display: flex;
  gap: 8px;
  margin: 16px 0 12px;
  border-bottom: 1px solid var(--dev-line);
}

.dev-transfer-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px 10px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--dev-muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.dev-transfer-tab.is-active {
  border-bottom-color: var(--dev-blue);
  color: var(--dev-blue);
}

.dev-transfer-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--dev-gold);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
}

.dev-transfer-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dev-transfer-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
}

.dev-transfer-item__main {
  flex: 1 1 auto;
  min-width: 0;
}

.dev-transfer-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dev-transfer-item__name {
  color: var(--dev-ink);
  font-weight: 700;
  word-break: break-all;
}

.dev-transfer-item__meta {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--dev-muted);
  line-height: 1.5;
}

.dev-transfer-item__message {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--dev-ink-soft);
  line-height: 1.6;
}

.dev-transfer-item__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.dev-transfer-empty {
  padding: 20px 0;
  color: var(--dev-muted);
  font-size: 13px;
  text-align: center;
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

/* 窄屏下把操作按钮换到资源名下方，免得长资源名把按钮挤成竖排 */
@media (max-width: 640px) {
  .dev-transfer-item {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .dev-transfer-item__actions {
    justify-content: flex-end;
  }
}
</style>
