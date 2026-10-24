import type { Ref } from 'vue'
import { useRouter } from 'vue-router'

import type { CommunityPost } from '@/api/community'
import type { PublicMcResourceItem } from '@/api/resources'
import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import type { McProcessedTagTree } from '@/api/resourceTags'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'

/**
 * 搜索结果页的三处落点（资源卡片 / 需求弹窗的「前往工作台」/ 帖子卡片）与「返回首页」。
 *
 * 抽出来是因为视图只该剩接线：路由对象不进模板，也不进三个卡片组件
 * （卡片只 `emit('open')`，落点由本域按当前关键词兜底）。
 *
 * 资源的落点要标签树：详情是「资源列表页的页内详情态」，路径段是 `<根分区>/<子分区>`，
 * 而资源自己只带平台名。找不到匹配分区时退回第一个分区（拆分前就这么兜），
 * 连第一个分区都没有（标签树没取到）才退成「带关键词去免费厅」。
 */
export function useSearchResultNavigation(options: {
  keyword: Ref<string>
  tagTree: Ref<McProcessedTagTree | null>
}) {
  const router = useRouter()

  /** 平台名 → 标签树里的 `<根分区>/<子分区>` 两个 key；匹配不到就退第一个分区。 */
  function resolveResourceRoute(
    resource: PublicMcResourceItem,
  ): { rootSlug: string; entrySlug: string } | null {
    for (const root of options.tagTree.value?.roots ?? []) {
      const entry = root.entries.find((item) => item.platform === resource.platform)
      if (entry) {
        return { rootSlug: root.key, entrySlug: entry.key }
      }
    }

    const fallbackRoot = options.tagTree.value?.roots[0]
    const fallbackEntry = fallbackRoot?.entries[0]
    return fallbackRoot && fallbackEntry
      ? { rootSlug: fallbackRoot.key, entrySlug: fallbackEntry.key }
      : null
  }

  function openResource(resource: PublicMcResourceItem) {
    const routeParams = resolveResourceRoute(resource)
    if (!routeParams) {
      void router.push({
        name: 'resources',
        query: options.keyword.value
          ? { sale: 'free', keyword: options.keyword.value }
          : { sale: 'free' },
      })
      return
    }

    void router.push(
      resourceDetailLocation({
        resourceId: resource.id,
        rootSlug: routeParams.rootSlug,
        entrySlug: routeParams.entrySlug,
        sale: resourceListingSaleOf(resource.price_fen, resource.price_points),
      }),
    )
  }

  /** 需求卡片的「前往工作台接取」：进开发者侧的需求详情。 */
  function openRequirementWorkbench(requirement: PublicRequirementSpotlightItem) {
    void router.push({
      name: 'dev-requirement-detail',
      params: { requirementId: requirement.requirement_id },
    })
  }

  /** 帖子详情带上关键词，详情页的「返回」才能回到同一批结果。 */
  function openCommunityPost(post: CommunityPost) {
    void router.push({
      name: 'community-post',
      params: { postId: String(post.id) },
      query: options.keyword.value ? { keyword: options.keyword.value } : {},
    })
  }

  function openHome() {
    void router.push({ name: 'home' })
  }

  return { openResource, openRequirementWorkbench, openCommunityPost, openHome }
}
