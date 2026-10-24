import { computed, ref } from 'vue'

import {
  reviewRequirementResourceDelete as reviewRequirementResourceDeleteApi,
  updateRequirementResourceVisibility as updateRequirementResourceVisibilityApi,
  updateRequirementSubscription as updateRequirementSubscriptionApi,
  type RequirementItem,
  type RequirementPendingResourceVersionDeleteRequest,
} from '@/api/requirements'
import type { PublicMcResourceVersionItem } from '@/api/resources'
import { useResourceDownload } from '@/composables/useResourceDownload'
import { isRequirementArchived } from '@/shared/requirementArchive'
import {
  canToggleRequirementResourceVisibility,
  hasBoundResource,
  hasPendingResourceVersionDeleteReview,
  isSelfManagedRequirement,
  nextResourceVisibility,
  pendingResourceVersionDeleteRequests,
  pendingVersionRejectNote,
} from '@/shared/requirementRowRules'

import { TMessage } from 'ui_73info'

type UseRequirementRowOperationsOptions = {
  token: () => string
  isAuthed: () => boolean
  reload: () => Promise<void>
  /** 最新列表：刷新后清理失效的「版本删除审核」展开卡要用它。 */
  myRequirements: () => RequirementItem[]
  /** 绑定资源的版本列表（按条 map 只在 `useMyRequirementsData` 里，注入而不是再查一次）。 */
  versionsFor: (item: RequirementItem) => PublicMcResourceVersionItem[] | undefined
}

/**
 * 「我的需求」需求行上的四个就地动作：订阅开关、关联资源公开 / 私有、版本删除审核、下载某一版。
 *
 * 四项形状相同（只作用在一条需求上的请求 + 一个 loading id），口径仍来自 `shared/requirementRowRules`，
 * 这里不新增判定。展开 / 弹窗状态也收口在这里，视图只拿 `v-bind` 对象与判定函数；
 * 下载请求本身走 `useResourceDownload`（全站唯一的进度条与 401 口径）。
 */
export function useRequirementRowOperations(options: UseRequirementRowOperationsOptions) {
  const { downloadResourceVersion } = useResourceDownload()

  // ---- 订阅状态变化 / 资源公开私有：两个独立的 loading id，同一行互不牵连 ----
  const requirementSubscriptionLoadingId = ref<string | null>(null)
  const resourceVisibilityLoadingId = ref<string | null>(null)

  function versionsOf(item: RequirementItem) {
    return options.versionsFor(item) ?? []
  }

  async function toggleRequirementSubscription(item: RequirementItem) {
    if (!options.isAuthed()) {
      TMessage.error('请先登录后再设置需求订阅')
      return
    }

    requirementSubscriptionLoadingId.value = item.requirement_id
    const nextValue = !item.subscribe_status_change

    try {
      await updateRequirementSubscriptionApi(options.token(), item.requirement_id, {
        subscribe_status_change: nextValue,
      })
      item.subscribe_status_change = nextValue
      TMessage.success(nextValue ? '已订阅该需求的状态变化' : '已取消该需求的状态变化订阅')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '更新需求订阅失败')
    } finally {
      requirementSubscriptionLoadingId.value = null
    }
  }

  async function toggleRequirementResourceVisibility(item: RequirementItem) {
    if (!options.isAuthed() || !hasBoundResource(item)) {
      return
    }

    if (!canToggleRequirementResourceVisibility(item)) {
      TMessage.warning(
        isSelfManagedRequirement(item)
          ? '需求完成后才能设置资源为公开或私有'
          : '需求必须在已付尾款后，才能设置资源为公开或私有',
      )
      return
    }

    const visibility = nextResourceVisibility(item)
    resourceVisibilityLoadingId.value = item.requirement_id
    try {
      await updateRequirementResourceVisibilityApi(options.token(), item.requirement_id, {
        visibility,
      })
      TMessage.success(visibility === 'public' ? '关联资源已提交公开审核' : '关联资源已设为私有')
      await options.reload()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '更新资源可见性失败')
    } finally {
      resourceVisibilityLoadingId.value = null
    }
  }

  // ---- 版本删除审核：展开态、正在填拒绝原因的那一版、按版本 id 存的原因草稿 ----
  const resourceVersionDeleteReviewLoadingId = ref<string | null>(null)
  const expandedVersionDeleteReviewRequirementId = ref<string | null>(null)
  const versionDeleteRejectTargetId = ref<number | null>(null)
  const versionDeleteRejectNotes = ref<Record<number, string>>({})

  function isVersionDeleteReviewExpanded(item: RequirementItem) {
    return expandedVersionDeleteReviewRequirementId.value === item.requirement_id
  }

  /** 审核卡只在「展开 + 真有待审核项 + 未归档」时渲染（三个判据缺一个都会渲染出空卡）。 */
  function isVersionReviewCardVisible(item: RequirementItem) {
    return (
      isVersionDeleteReviewExpanded(item) &&
      pendingResourceVersionDeleteRequests(item).length > 0 &&
      !isRequirementArchived(item)
    )
  }

  function openRejectVersion(request: RequirementPendingResourceVersionDeleteRequest) {
    versionDeleteRejectTargetId.value = request.version_id
    versionDeleteRejectNotes.value = {
      ...versionDeleteRejectNotes.value,
      [request.version_id]: versionDeleteRejectNotes.value[request.version_id] ?? '',
    }
  }

  /** 拒绝原因草稿的写入口：卡片只 emit，record 由这里重建，保持单向数据流。 */
  function updateVersionDeleteRejectNote(versionId: number, value: string) {
    versionDeleteRejectNotes.value = { ...versionDeleteRejectNotes.value, [versionId]: value }
  }

  function cancelRejectVersion() {
    if (resourceVersionDeleteReviewLoadingId.value) {
      return
    }

    versionDeleteRejectTargetId.value = null
  }

  function closeVersionDeleteReviewCard() {
    if (resourceVersionDeleteReviewLoadingId.value) {
      return
    }

    expandedVersionDeleteReviewRequirementId.value = null
    versionDeleteRejectTargetId.value = null
  }

  function toggleVersionDeleteReviewCard(item: RequirementItem) {
    if (!hasPendingResourceVersionDeleteReview(item)) {
      return
    }

    if (isVersionDeleteReviewExpanded(item)) {
      closeVersionDeleteReviewCard()
      return
    }

    expandedVersionDeleteReviewRequirementId.value = item.requirement_id
    versionDeleteRejectTargetId.value = null
  }

  async function submitVersionDeleteReview(
    item: RequirementItem,
    request: RequirementPendingResourceVersionDeleteRequest,
    action: 'approve' | 'reject',
  ) {
    if (!options.isAuthed() || !hasPendingResourceVersionDeleteReview(item)) {
      return
    }

    const note = pendingVersionRejectNote(versionDeleteRejectNotes.value, request).trim()

    if (action === 'reject' && note.length > 500) {
      TMessage.error('拒绝原因不能超过 500 字')
      return
    }

    resourceVersionDeleteReviewLoadingId.value = item.requirement_id
    try {
      await reviewRequirementResourceDeleteApi(options.token(), item.requirement_id, {
        version_id: request.version_id,
        action,
        note: note || undefined,
      })
      TMessage.success(action === 'approve' ? '已同意删除版本' : '已拒绝删除版本')
      versionDeleteRejectTargetId.value = null
      if (action === 'reject') {
        const nextNotes = { ...versionDeleteRejectNotes.value }
        delete nextNotes[request.version_id]
        versionDeleteRejectNotes.value = nextNotes
      }
      await options.reload()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '审核版本删除失败')
    } finally {
      resourceVersionDeleteReviewLoadingId.value = null
    }
  }

  /**
   * 列表刷新后的收尾：展开着的审核卡若已失效（需求没了 / 审核项没了），顺手收起。
   * 由 `useMyRequirementsData` 的 `onRequirementsLoaded` 注入调用——这条副作用原本挂在列表加载末尾。
   */
  function pruneStaleVersionDeleteReviewCard() {
    const expandedId = expandedVersionDeleteReviewRequirementId.value
    if (!expandedId) return
    const stillPending = options
      .myRequirements()
      .some(
        (item) => item.requirement_id === expandedId && hasPendingResourceVersionDeleteReview(item),
      )
    if (!stillPending) closeVersionDeleteReviewCard()
  }

  // ---- 下载选择器：先选版本，再走全站统一下载入口 ----
  const resourceDownloadingId = ref<number | null>(null)
  const downloadPickerRequirement = ref<RequirementItem | null>(null)

  function openDownloadPicker(item: RequirementItem) {
    if (!hasBoundResource(item)) {
      return
    }

    if (!versionsOf(item).length) {
      TMessage.info('开发者还没有发布可下载的版本')
      return
    }

    downloadPickerRequirement.value = item
  }

  function closeDownloadPicker() {
    downloadPickerRequirement.value = null
  }

  /** 下载某一版：选择器只 emit 版本，需求取当前选中的那条；进度与「准备中...」都靠 `resourceDownloadingId`。 */
  async function downloadRequirementVersion(version: PublicMcResourceVersionItem) {
    const item = downloadPickerRequirement.value
    const token = options.token()
    if (!item || !hasBoundResource(item) || !token) {
      return
    }

    const resourceId = item.bound_resource_id as number
    resourceDownloadingId.value = resourceId
    try {
      await downloadResourceVersion(resourceId, version, token.trim() || null)
    } catch (err) {
      TMessage.warning(err instanceof Error ? err.message : '下载资源失败')
    } finally {
      resourceDownloadingId.value = null
    }
  }

  // ---- 挂点：审核卡与下载选择器的 props / 监听 ----
  const versionReviewCard = (item: RequirementItem) => ({
    item,
    reviewLoading: resourceVersionDeleteReviewLoadingId.value === item.requirement_id,
    rejectTargetId: versionDeleteRejectTargetId.value,
    rejectNotes: versionDeleteRejectNotes.value,
    onClose: closeVersionDeleteReviewCard,
    onApprove: (request: RequirementPendingResourceVersionDeleteRequest) =>
      submitVersionDeleteReview(item, request, 'approve'),
    onReject: (request: RequirementPendingResourceVersionDeleteRequest) =>
      submitVersionDeleteReview(item, request, 'reject'),
    onOpenReject: openRejectVersion,
    onCancelReject: cancelRejectVersion,
    onUpdateNote: updateVersionDeleteRejectNote,
  })

  const downloadPicker = computed(() => ({
    requirement: downloadPickerRequirement.value,
    versions: downloadPickerRequirement.value ? versionsOf(downloadPickerRequirement.value) : [],
    downloading: resourceDownloadingId.value === downloadPickerRequirement.value?.bound_resource_id,
    onClose: closeDownloadPicker,
    onDownload: downloadRequirementVersion,
  }))

  return {
    requirementSubscriptionLoadingId,
    resourceVisibilityLoadingId,
    resourceDownloadingId,
    toggleRequirementSubscription,
    toggleRequirementResourceVisibility,
    isVersionDeleteReviewExpanded,
    isVersionReviewCardVisible,
    toggleVersionDeleteReviewCard,
    pruneStaleVersionDeleteReviewCard,
    versionReviewCard,
    openDownloadPicker,
    downloadPicker,
  }
}
