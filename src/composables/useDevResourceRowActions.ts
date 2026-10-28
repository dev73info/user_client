import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import { TMessage, TMessageBox } from 'ui_73info'

import {
  deleteMcResource,
  listMcResourceVersions,
  submitMcResourceReview,
  updateMcResourceHomepage,
  type McResourcePayload,
} from '@/api/mcResources'
import {
  resolveResourceCreationType,
  resolveResourcePaidMode,
  resourceCreationRouteQuery,
} from '@/shared/resourceCreation'
import {
  canDeleteResource,
  isResourceArchiveLocked,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
} from '@/shared/resourcePresentation'
import { isPricedResource } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

/** 「更多」菜单里带过来的动作码与目标资源（与 `shared/resourceApi.ts` 的 `ResourceRowAction` 同一套）。 */
export type DevResourceCommandPayload = { action: string; resource: McResourcePayload }

type DevResourceRowActionDeps = {
  /** 列表本体：删除成功后从内存里摘掉这一行，不必重拉。 */
  resources: Ref<McResourcePayload[]>
  /** 申请公开 / 设为私有之后重拉列表：可见性由后端改，前端只看结果。 */
  reload: () => Promise<void>
  /** 「发布版本」弹窗入口（`useDevResourcePublishVersion`）。 */
  openPublish: (resource: McResourcePayload) => void
}

/**
 * 资源表格「更多」菜单里的动作：导航、申请公开、设为私有、删除，以及发布入口的分流。
 *
 * 从 `views/DevResourceListView.vue` 抽出，请求实参与提示文案逐段照搬。
 * 弹窗本身在各自的 composable 里（如 `useDevResourcePublishVersion`），
 * 这里只通过 `deps.openPublish` 转交，避免两个 composable 互相 import。
 */
export function useDevResourceRowActions(deps: DevResourceRowActionDeps) {
  const auth = useAuthStore()
  const router = useRouter()

  const requestingReviewResourceId = ref<number | null>(null)
  const settingPrivateResourceId = ref<number | null>(null)
  const deletingResourceId = ref<number | null>(null)

  function openEditHomepagePage(resource: McResourcePayload) {
    if (isResourceArchiveLocked(resource)) {
      TMessage.warning(RESOURCE_ARCHIVE_LOCKED_MESSAGE)
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

  function goCreateResource(kind: unknown, mode?: unknown) {
    const type = resolveResourceCreationType(kind)
    void router.push({
      name: 'dev-plugins',
      query: resourceCreationRouteQuery(type, resolveResourcePaidMode(mode)),
    })
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
      if (!resource.copyright_declared) {
        const versions = await listMcResourceVersions(auth.token, resource.id)
        if (
          isPricedResource(resource.buyout_price_fen, resource.price_points) ||
          versions.some((version) => Number(version.price_fen ?? 0) > 0)
        ) {
          TMessage.warning('付费资源须先在「编辑主页」勾选版权声明，再申请公开')
          router.push({
            name: 'dev-resource-homepage-edit',
            params: { resourceId: String(resource.id) },
          })
          return
        }
      }

      // 契约里的审核动作端点：不再用 PATCH visibility:'review' 拼整页字段顶上去
      await submitMcResourceReview(auth.token, resource.id)
      TMessage.success('公开申请已提交，等待管理员审核')
      await deps.reload()
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
      await deps.reload()
    } catch (error) {
      const message = error instanceof Error ? error.message : '设为私有失败'
      TMessage.error(message)
    } finally {
      settingPrivateResourceId.value = null
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
      deps.resources.value = deps.resources.value.filter((item) => item.id !== resource.id)
      TMessage.success('资源已删除')
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除资源失败'
      TMessage.error(message)
    } finally {
      deletingResourceId.value = null
    }
  }

  /** 菜单里三条「操作类」动作：都是弹窗或危险操作，分别落到各自的处理函数。 */
  function runRowAction(command: 'publish' | 'versions' | 'delete', resource: McResourcePayload) {
    if (command === 'publish') {
      deps.openPublish(resource)
      return
    }

    if (command === 'versions') {
      openVersionsPage(resource)
      return
    }

    void removeResource(resource)
  }

  /** 「更多」菜单的统一入口：表格里只 emit 动作码，怎么分发是这里的事。 */
  function handleResourceCommand({ action, resource }: DevResourceCommandPayload) {
    if (action === 'request-review') {
      void requestPublicReview(resource)
      return
    }

    if (action === 'set-private') {
      void setResourcePrivate(resource)
      return
    }

    if (action === 'sold-orders') {
      openSoldPurchases(resource)
      return
    }

    if (action === 'publish' || action === 'versions' || action === 'delete') {
      runRowAction(action, resource)
    }
  }

  return {
    requestingReviewResourceId,
    settingPrivateResourceId,
    deletingResourceId,
    openEditHomepagePage,
    goCreateResource,
    handleResourceCommand,
    requestPublicReview,
    setResourcePrivate,
    removeResource,
  }
}
