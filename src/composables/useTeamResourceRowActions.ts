import { ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  deleteMcResource,
  updateMcResourceHomepage,
  type McResourcePayload,
} from '@/api/mcResources'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import {
  canDeleteResource,
  isResourceArchiveLocked,
  RESOURCE_ARCHIVE_LOCKED_MESSAGE,
} from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/**
 * 「团队资源」表格「更多」菜单里的动作：导航、申请公开、设为私有、删除、发布版本。
 *
 * 与「资源项目」页（`useDevResourceRowActions`）是两套入口：本页的删除确认走
 * `window.confirm`、申请公开不拦付费资源的版权声明、编辑与版本页带上
 * `from=team-resources` 回跳标记——这些差异都是页面既有口径，不合并。
 */
export function useTeamResourceRowActions(deps: {
  /** 列表本体：删除成功后从内存里摘掉这一行，不必重拉。 */
  resources: Ref<McResourcePayload[]>
  /** 申请公开 / 设为私有之后重拉列表：可见性由后端改，前端只看结果。 */
  reload: () => Promise<void>
  /** 「发布版本」弹窗入口（`useDevResourcePublishVersion`）。 */
  openPublish: (resource: McResourcePayload) => void
}) {
  const auth = useAuthStore()
  const router = useRouter()

  const deletingResourceId = ref<number | null>(null)
  const settingPrivateResourceId = ref<number | null>(null)
  const requestingReviewResourceId = ref<number | null>(null)

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
      deps.resources.value = deps.resources.value.filter((item) => item.id !== resource.id)
      TMessage.success('资源已删除')
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除资源失败'
      TMessage.error(message)
    } finally {
      deletingResourceId.value = null
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
      await deps.reload()
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
      deps.openPublish(payload.resource)
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

  return {
    deletingResourceId,
    settingPrivateResourceId,
    requestingReviewResourceId,
    openResourceHomepage,
    handleResourceCommand,
  }
}
