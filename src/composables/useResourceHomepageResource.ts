import { computed, ref, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { McResourcePayload } from '@/api/mcResources'
import { getTagRouteSlug } from '@/api/resourceTags'
import { useAuthStore } from '@/stores/auth'
import {
  canPreviewResource,
  resourceDetailLocation,
  resourceListingSaleOf,
} from '@/shared/resourceNavigation'
import {
  isResourceArchiveLocked,
  resourceVisibilityLabel as visibilityLabel,
} from '@/shared/resourcePresentation'
import { savedTagPathSegment } from '@/shared/resourceTagPath'

/** 资源主页编辑页的资源状态、预览可见性与预览地址。 */
export function useResourceHomepageResource() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const resource = ref<McResourcePayload | null>(null)
  const loading = ref(false)
  /** 资源加载代际：同一路由内切换资源时，旧请求的响应不能覆盖新资源。 */
  const loadGeneration = ref(0)

  const resourceVisibilityLabel = computed(() =>
    resource.value ? visibilityLabel(resource.value.visibility) : '私有',
  )
  const archiveLocked = computed(() =>
    resource.value ? isResourceArchiveLocked(resource.value) : false,
  )
  /** 绑定定制交付的资源不能改售价（定制单里已定价）。 */
  const boundToRequirement = computed(() => Boolean(resource.value?.requirement_id))
  const canPreview = computed(() => canPreviewResource(resource.value))
  const previewBlockReason = computed(() =>
    canPreview.value ? '' : `${resourceVisibilityLabel.value}，暂不可预览`,
  )

  /** 站内分享地址：独立详情页已废弃，统一指到列表页的页内详情态（`?resource=`）。 */
  function userClientResourceUrl(target: McResourcePayload): string {
    const rootSlug = getTagRouteSlug(savedTagPathSegment(0, target.tag_selections) || 'resources')
    const entrySlug = getTagRouteSlug(
      savedTagPathSegment(1, target.tag_selections) || target.platform || 'detail',
    )
    const routeLocation = router.resolve(
      resourceDetailLocation({
        resourceId: target.id,
        rootSlug,
        entrySlug,
        sale: resourceListingSaleOf(target.buyout_price_fen, target.price_points),
      }),
    )

    const configuredBase = (import.meta.env.VITE_USER_CLIENT_BASE_URL as string | undefined)?.trim()
    const baseUrl = configuredBase ? configuredBase.replace(/\/$/, '') + '/' : window.location.href
    return new URL(routeLocation.href, baseUrl).toString()
  }

  const userClientPreviewUrl = computed(() =>
    resource.value ? userClientResourceUrl(resource.value) : '',
  )

  function goBack() {
    if (window.history.state?.back) {
      router.back()
      return
    }
    router.push({ name: 'dev-resource-list' })
  }

  return {
    auth,
    route,
    router,
    resource,
    loading,
    loadGeneration,
    resourceVisibilityLabel,
    archiveLocked,
    boundToRequirement,
    canPreview,
    previewBlockReason,
    userClientPreviewUrl,
    goBack,
    userClientResourceUrl,
  }
}

/** 本页拿到的资源 ref（其余 composable 都靠它取值，导出类型方便互相传参）。 */
export type ResourceHomepageResource = ReturnType<typeof useResourceHomepageResource>
/** 资源 ref 的简写 */
export type ResourceRef = Ref<McResourcePayload | null>
